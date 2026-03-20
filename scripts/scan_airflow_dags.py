#!/usr/bin/env python3
"""
Scan a directory of Airflow DAGs, extract dbt_selector/dbt_select values,
resolve them against a dbt manifest.json, and output a mapping of
model unique_id → DAG files.

Usage:
    python scan_airflow_dags.py <dags_directory> <manifest_path>

Output (stdout): JSON object mapping model unique_ids to lists of DAG info:
    {
      "model.pkg.name": [{"dagFile": "my_dag.py", "selector": "tag:nightly"}],
      ...
    }

Progress is written to stderr as JSON lines.
"""

import ast
import json
import os
import re
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _SCRIPT_DIR)
from dbt_select import load_manifest, resolve_selector


def progress(step: str, detail: str):
    print(json.dumps({"step": step, "detail": detail}), file=sys.stderr, flush=True)


def find_dag_files(dags_dir: str) -> list:
    """Recursively find Python files containing 'airflow' keyword."""
    dag_files = []
    for root, _dirs, files in os.walk(dags_dir):
        for fname in files:
            if not fname.endswith(".py"):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", errors="ignore") as f:
                    content = f.read()
                if "airflow" in content:
                    dag_files.append((fpath, fname, content))
            except (OSError, IOError):
                continue
    return dag_files


# Regex to match dbt_selector or dbt_select = "value" (single/double quotes)
# Handles optional whitespace around =
_SELECTOR_RE = re.compile(
    r"""(?:dbt_selector|dbt_select)\s*=\s*(?P<quote>['"])(?P<value>.+?)(?P=quote)""",
    re.DOTALL,
)

_SELECTOR_KWARG_NAMES = {"dbt_select", "dbt_selector"}


def _extract_selectors_regex(content: str) -> list:
    """Fallback: extract dbt_selector/dbt_select via simple regex."""
    selectors = []
    for m in _SELECTOR_RE.finditer(content):
        val = m.group("value").strip()
        if val:
            selectors.append(val)
    return selectors


# ---------------------------------------------------------------------------
# AST-based mock-parse for selector extraction
# ---------------------------------------------------------------------------


def _safe_eval_node(node, symtab: dict, loop_vars: dict = None):
    """
    Recursively evaluate an AST expression node against a symbol table.
    Returns str | int | float | list | dict | tuple | None.
    Returns None for anything we cannot statically resolve.
    """
    if loop_vars is None:
        loop_vars = {}

    if node is None:
        return None

    # --- Constant literal ---
    if isinstance(node, ast.Constant):
        return node.value

    # --- Variable name ---
    if isinstance(node, ast.Name):
        if node.id in loop_vars:
            return loop_vars[node.id]
        return symtab.get(node.id)

    # --- List / Tuple literal ---
    if isinstance(node, (ast.List, ast.Tuple)):
        items = []
        for elt in node.elts:
            v = _safe_eval_node(elt, symtab, loop_vars)
            if v is None:
                return None
            items.append(v)
        return items

    # --- Dict literal ---
    if isinstance(node, ast.Dict):
        result = {}
        for k_node, v_node in zip(node.keys, node.values):
            if k_node is None:
                return None  # dict unpacking (**)
            k = _safe_eval_node(k_node, symtab, loop_vars)
            v = _safe_eval_node(v_node, symtab, loop_vars)
            if k is None:
                return None
            result[k] = v
        return result

    # --- Subscript: x["key"] or x[0] ---
    if isinstance(node, ast.Subscript):
        target = _safe_eval_node(node.value, symtab, loop_vars)
        if target is None:
            return None
        slc = node.slice
        # Python 3.9+ uses the node directly, older uses ast.Index
        if isinstance(slc, ast.Index):
            slc = slc.value
        idx = _safe_eval_node(slc, symtab, loop_vars)
        if idx is None:
            return None
        try:
            return target[idx]
        except (KeyError, IndexError, TypeError):
            return None

    # --- f-string ---
    if isinstance(node, ast.JoinedStr):
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append(str(v.value))
            elif isinstance(v, ast.FormattedValue):
                val = _safe_eval_node(v.value, symtab, loop_vars)
                if val is None:
                    return None
                # Handle format spec if present
                if v.format_spec is not None:
                    fmt = _safe_eval_node(v.format_spec, symtab, loop_vars)
                    if fmt is not None:
                        try:
                            parts.append(format(val, fmt))
                            continue
                        except (ValueError, TypeError):
                            pass
                parts.append(str(val))
            else:
                return None
        return "".join(parts)

    # --- Binary operations ---
    if isinstance(node, ast.BinOp):
        left = _safe_eval_node(node.left, symtab, loop_vars)
        right = _safe_eval_node(node.right, symtab, loop_vars)
        if left is None or right is None:
            return None
        # String/list concatenation
        if isinstance(node.op, ast.Add):
            try:
                return left + right
            except TypeError:
                return None
        # % formatting: "format" % value
        if isinstance(node.op, ast.Mod) and isinstance(left, str):
            try:
                return left % right
            except (TypeError, ValueError):
                return None
        return None

    # --- Unary minus (for negative numbers) ---
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        val = _safe_eval_node(node.operand, symtab, loop_vars)
        if isinstance(val, (int, float)):
            return -val
        return None

    # --- Starred dict merge: {**a, **b} handled via ast.Dict with None keys ---
    # (already handled above in Dict)

    # --- Function calls ---
    if isinstance(node, ast.Call):
        # --- .join() ---
        if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "join" and len(node.args) == 1):
            sep = _safe_eval_node(node.func.value, symtab, loop_vars)
            arg = _safe_eval_node(node.args[0], symtab, loop_vars)
            if isinstance(sep, str) and isinstance(arg, list):
                try:
                    return sep.join(str(x) for x in arg)
                except TypeError:
                    return None
            return None

        # --- .get() ---
        if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "get" and 1 <= len(node.args) <= 2):
            target = _safe_eval_node(node.func.value, symtab, loop_vars)
            key = _safe_eval_node(node.args[0], symtab, loop_vars)
            default = None
            if len(node.args) >= 2:
                default = _safe_eval_node(node.args[1], symtab, loop_vars)
            if isinstance(target, dict) and key is not None:
                return target.get(key, default)
            return None

        # --- .items() ---
        if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "items" and len(node.args) == 0):
            target = _safe_eval_node(node.func.value, symtab, loop_vars)
            if isinstance(target, dict):
                return list(target.items())
            return None

        # --- .split() ---
        if (isinstance(node.func, ast.Attribute) and
                node.func.attr == "split"):
            target = _safe_eval_node(node.func.value, symtab, loop_vars)
            if isinstance(target, str):
                if len(node.args) >= 1:
                    sep = _safe_eval_node(node.args[0], symtab, loop_vars)
                    if isinstance(sep, str):
                        return target.split(sep)
                else:
                    return target.split()
            return None

        # For any other call, we don't try to evaluate it — but we do check
        # its keyword args for dbt_select/dbt_selector (for DbtTransformationConfig etc.)
        # That's handled by the finder, not here.
        return None

    # --- Attribute access (for simple obj.attr on dicts-as-objects) ---
    if isinstance(node, ast.Attribute):
        # We only handle this when it's part of a method call (.join, .get, etc.)
        # Standalone attribute access: try symtab lookup as "obj.attr"
        if isinstance(node.value, ast.Name):
            target = symtab.get(node.value.id)
            if isinstance(target, dict):
                return target.get(node.attr)
        return None

    return None


def _build_symbol_table(tree: ast.Module) -> dict:
    """
    Walk top-level statements to build a symbol table of statically-resolvable
    values (strings, lists, dicts).
    """
    symtab = {}

    for stmt in tree.body:
        # Simple assignment: NAME = expr
        if isinstance(stmt, ast.Assign):
            for target in stmt.targets:
                if isinstance(target, ast.Name):
                    val = _safe_eval_node(stmt.value, symtab)
                    if val is not None:
                        symtab[target.id] = val

        # Augmented assignment: NAME += expr
        elif isinstance(stmt, ast.AugAssign):
            if isinstance(stmt.target, ast.Name) and isinstance(stmt.op, ast.Add):
                name = stmt.target.id
                existing = symtab.get(name)
                addition = _safe_eval_node(stmt.value, symtab)
                if isinstance(existing, list) and isinstance(addition, list):
                    symtab[name] = existing + addition
                elif isinstance(existing, str) and isinstance(addition, str):
                    symtab[name] = existing + addition

        # For loops at top level: handle list accumulation pattern
        elif isinstance(stmt, ast.For):
            _simulate_top_level_for(stmt, symtab)

    return symtab


def _simulate_top_level_for(for_node: ast.For, symtab: dict):
    """
    Simulate a top-level for loop to handle the list-accumulation pattern:
        selector_list = []
        for task in KNOWN_LIST:
            selector_list += [f"..."]
    Updates symtab in place.
    """
    iterable = _safe_eval_node(for_node.iter, symtab)
    if iterable is None or not isinstance(iterable, (list, dict)):
        return

    items = iterable if isinstance(iterable, list) else list(iterable.items())

    for item in items:
        # Bind loop variable(s)
        loop_vars = _bind_loop_target(for_node.target, item)
        if loop_vars is None:
            continue

        # Walk loop body for augmented assignments that accumulate into symtab lists
        for body_stmt in for_node.body:
            if isinstance(body_stmt, ast.AugAssign):
                if isinstance(body_stmt.target, ast.Name) and isinstance(body_stmt.op, ast.Add):
                    name = body_stmt.target.id
                    existing = symtab.get(name)
                    addition = _safe_eval_node(body_stmt.value, symtab, loop_vars)
                    if isinstance(existing, list) and isinstance(addition, list):
                        symtab[name] = existing + addition
            # Handle: some_list.append(expr)
            elif isinstance(body_stmt, ast.Expr) and isinstance(body_stmt.value, ast.Call):
                call = body_stmt.value
                if (isinstance(call.func, ast.Attribute) and
                        call.func.attr == "append" and
                        isinstance(call.func.value, ast.Name) and
                        len(call.args) == 1):
                    name = call.func.value.id
                    existing = symtab.get(name)
                    val = _safe_eval_node(call.args[0], symtab, loop_vars)
                    if isinstance(existing, list) and val is not None:
                        symtab[name] = existing + [val]


def _bind_loop_target(target, value) -> dict:
    """Bind a for-loop target (Name or Tuple) to a value. Returns loop_vars dict or None."""
    if isinstance(target, ast.Name):
        return {target.id: value}
    if isinstance(target, (ast.Tuple, ast.List)):
        if isinstance(value, (tuple, list)) and len(target.elts) == len(value):
            result = {}
            for t, v in zip(target.elts, value):
                if isinstance(t, ast.Name):
                    result[t.id] = v
                else:
                    return None
            return result
    return None


def _find_selectors_ast(tree: ast.Module, symtab: dict) -> list:
    """
    Walk the AST to find all dbt_select/dbt_selector keyword argument values.
    Handles for-loops by unrolling iterations over known collections.
    """
    selectors = []
    seen = set()

    def _add_selector(val):
        if isinstance(val, str) and val.strip() and val not in seen:
            seen.add(val)
            selectors.append(val)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, str) and item.strip() and item not in seen:
                    seen.add(item)
                    selectors.append(item)

    def _extract_from_call(call_node, extra_vars=None):
        """Check a Call node's keyword args for dbt_select/dbt_selector."""
        for kw in call_node.keywords:
            if kw.arg in _SELECTOR_KWARG_NAMES:
                val = _safe_eval_node(kw.value, symtab, extra_vars)
                _add_selector(val)

    def _walk_stmts(stmts, extra_vars=None):
        """Walk a list of statements, handling for-loops specially."""
        for stmt in stmts:
            _walk_node(stmt, extra_vars)

    def _walk_node(node, extra_vars=None):
        """Recursively walk AST nodes, extracting selectors from calls."""
        if isinstance(node, ast.For):
            # Try to unroll the loop
            merged = dict(symtab)
            if extra_vars:
                merged.update(extra_vars)
            iterable = _safe_eval_node(node.iter, merged)

            if isinstance(iterable, (list, dict)):
                items = iterable if isinstance(iterable, list) else list(iterable.items())
                for item in items:
                    loop_vars = _bind_loop_target(node.target, item)
                    if loop_vars is None:
                        continue
                    combined = dict(extra_vars or {})
                    combined.update(loop_vars)
                    _walk_stmts(node.body, combined)
                # Also walk else clause
                _walk_stmts(node.orelse, extra_vars)
            else:
                # Can't resolve iterable, walk body anyway (might have hardcoded selectors)
                _walk_stmts(node.body, extra_vars)
                _walk_stmts(node.orelse, extra_vars)
            return

        # Check all Call nodes in this subtree
        if isinstance(node, ast.Call):
            _extract_from_call(node, extra_vars)

        # Walk children
        for child in ast.iter_child_nodes(node):
            _walk_node(child, extra_vars)

    # Walk all top-level statements
    _walk_stmts(tree.body)
    return selectors


def extract_selectors(content: str) -> list:
    """
    Extract dbt_selector/dbt_select values using AST-based mock-parse.
    Falls back to regex for files that cannot be parsed.
    """
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return _extract_selectors_regex(content)

    symtab = _build_symbol_table(tree)
    selectors = _find_selectors_ast(tree, symtab)

    # Fallback: if AST found nothing, try regex (might catch edge cases)
    if not selectors:
        selectors = _extract_selectors_regex(content)

    return selectors


# ---------------------------------------------------------------------------
# Schedule extraction
# ---------------------------------------------------------------------------

# Airflow preset schedules → human-readable descriptions
_PRESET_MAP = {
    "@once": "Runs once",
    "@continuous": "Continuous",
    "@hourly": "Every hour",
    "@daily": "Daily at midnight",
    "@weekly": "Weekly (Sunday midnight)",
    "@monthly": "Monthly (1st at midnight)",
    "@yearly": "Yearly (Jan 1st)",
    "@annually": "Yearly (Jan 1st)",
}

# Match schedule= or schedule_interval= followed by value
# Captures: string literal, None, timedelta(...), [Dataset(...)], or other expression
_SCHEDULE_STR_RE = re.compile(
    r"""(?:schedule_interval|schedule)\s*=\s*(?P<quote>['"])(?P<value>.+?)(?P=quote)""",
    re.DOTALL,
)
_SCHEDULE_NONE_RE = re.compile(
    r"""(?:schedule_interval|schedule)\s*=\s*None\b""",
)
_SCHEDULE_TIMEDELTA_RE = re.compile(
    r"""(?:schedule_interval|schedule)\s*=\s*timedelta\((?P<args>[^)]+)\)""",
)
_SCHEDULE_DATASET_RE = re.compile(
    r"""(?:schedule_interval|schedule)\s*=\s*\[(?P<datasets>[^\]]+)\]""",
    re.DOTALL,
)
_DATASET_URI_RE = re.compile(
    r"""(?:Dataset|Asset)\(\s*(?P<q>['"])(?P<uri>.+?)(?P=q)""",
)


def _timedelta_to_human(args_str: str) -> str:
    """Convert timedelta constructor args to human-readable string."""
    parts = []
    for part in args_str.split(","):
        part = part.strip()
        if "=" in part:
            key, val = part.split("=", 1)
            key = key.strip()
            val = val.strip()
        else:
            continue
        try:
            n = int(val)
        except ValueError:
            try:
                n = float(val)
            except ValueError:
                parts.append(f"{val} {key}")
                continue
        unit = key.rstrip("s")  # days→day, hours→hour, etc.
        if n == 1:
            parts.append(f"Every {unit}")
        else:
            parts.append(f"Every {n} {key}")
    return ", ".join(parts) if parts else "Interval schedule"


def extract_schedule(content: str):
    """
    Extract schedule info from an Airflow DAG file.
    Returns dict with keys: type, display
    or None if no schedule found.
    """
    # Check for string literal schedule (cron or preset)
    m = _SCHEDULE_STR_RE.search(content)
    if m:
        val = m.group("value").strip()
        if val in _PRESET_MAP:
            return {"type": "preset", "display": _PRESET_MAP[val]}
        # Raw cron expression — human-readable conversion happens client-side
        return {"type": "cron", "display": val.strip()}

    # Check for None (manual trigger / externally triggered)
    m = _SCHEDULE_NONE_RE.search(content)
    if m:
        return {"type": "none", "display": "Manual / external trigger"}

    # Check for Dataset/Asset trigger
    m = _SCHEDULE_DATASET_RE.search(content)
    if m:
        datasets_str = m.group("datasets")
        uris = [dm.group("uri") for dm in _DATASET_URI_RE.finditer(datasets_str)]
        if uris:
            return {"type": "dataset", "display": "Dataset trigger", "datasets": uris}
        return {"type": "dataset", "display": "Dataset trigger"}

    # Check for timedelta
    m = _SCHEDULE_TIMEDELTA_RE.search(content)
    if m:
        return {"type": "timedelta", "display": _timedelta_to_human(m.group("args"))}

    return None


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: scan_airflow_dags.py <dags_directory> <manifest_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    dags_dir = sys.argv[1]
    manifest_path = sys.argv[2]

    if not os.path.isdir(dags_dir):
        print(json.dumps({"error": f"DAGs directory not found: {dags_dir}"}))
        sys.exit(0)

    if not os.path.isfile(manifest_path):
        print(json.dumps({"error": f"Manifest not found: {manifest_path}"}))
        sys.exit(0)

    # Step 1: Find DAG files
    progress("scanning", f"Scanning {dags_dir} for Airflow DAGs...")
    dag_files = find_dag_files(dags_dir)
    progress("scanning", f"Found {len(dag_files)} Airflow DAG files")

    # Step 2: Extract selectors and schedules from each DAG
    progress("extracting", "Extracting dbt_selector/dbt_select values and schedules from DAGs...")
    dag_selectors = {}  # filename -> [selector_strings]
    dag_schedules = {}  # filename -> schedule dict or None
    total_selectors = 0
    for fpath, fname, content in dag_files:
        selectors = extract_selectors(content)
        if selectors:
            dag_selectors[fname] = selectors
            total_selectors += len(selectors)
        # Extract schedule regardless of selectors (we'll use it for DAGs that have selectors)
        schedule = extract_schedule(content)
        if schedule:
            dag_schedules[fname] = schedule

    progress(
        "extracting",
        f"Found {total_selectors} dbt_selector/dbt_select values across {len(dag_selectors)} DAGs",
    )

    if total_selectors == 0:
        # No selectors found, return empty mapping
        print(json.dumps({}))
        sys.exit(0)

    # Step 3: Load manifest for selector resolution
    progress("resolving", "Loading manifest for selector resolution...")
    manifest = load_manifest(manifest_path)

    # Step 4: Resolve each selector and build model -> DAG mapping
    progress("resolving", f"Resolving {total_selectors} selectors against manifest...")
    model_to_dags = {}  # unique_id -> [{dagFile, selector}]

    resolved_count = 0
    for dag_file, selectors in dag_selectors.items():
        for selector in selectors:
            try:
                matched_ids = resolve_selector(manifest, selector)
                for uid in matched_ids:
                    # Only include models (not tests, sources, etc.)
                    node = manifest.nodes.get(uid)
                    if not node:
                        continue
                    if node.resource_type not in ("model", "source"):
                        continue
                    if uid not in model_to_dags:
                        model_to_dags[uid] = []
                    # Avoid duplicates
                    entry = {"dagFile": dag_file, "selector": selector}
                    # Attach schedule info if available
                    sched = dag_schedules.get(dag_file)
                    if sched:
                        entry["schedule"] = sched
                    if entry not in model_to_dags[uid]:
                        model_to_dags[uid].append(entry)
                resolved_count += 1
            except Exception as e:
                progress(
                    "resolving",
                    f"Warning: failed to resolve '{selector}' from {dag_file}: {e}",
                )
                resolved_count += 1

    progress(
        "done",
        f"Mapped {len(model_to_dags)} models to Airflow DAGs from {len(dag_selectors)} DAG files",
    )

    json.dump(model_to_dags, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
