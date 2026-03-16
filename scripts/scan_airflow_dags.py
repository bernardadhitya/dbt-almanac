#!/usr/bin/env python3
"""
Scan a directory of Airflow DAGs, extract dbt_selector values, resolve them
against a dbt manifest.json, and output a mapping of model unique_id → DAG files.

Usage:
    python scan_airflow_dags.py <dags_directory> <manifest_path>

Output (stdout): JSON object mapping model unique_ids to lists of DAG info:
    {
      "model.pkg.name": [{"dagFile": "my_dag.py", "selector": "tag:nightly"}],
      ...
    }

Progress is written to stderr as JSON lines.
"""

import json
import os
import re
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Add vendor directory (bundled dependencies) and script dir to path
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "vendor"))
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


# Regex to match dbt_selector = "value" or dbt_selector='value'
# Handles optional whitespace around =
_SELECTOR_RE = re.compile(
    r"""dbt_selector\s*=\s*(?P<quote>['"])(?P<value>.+?)(?P=quote)""",
    re.DOTALL,
)


def extract_selectors(content: str) -> list:
    """Extract all dbt_selector string values from a Python file."""
    selectors = []
    for m in _SELECTOR_RE.finditer(content):
        val = m.group("value").strip()
        if val:
            selectors.append(val)
    return selectors


# ---------------------------------------------------------------------------
# Schedule extraction
# ---------------------------------------------------------------------------

try:
    from cron_descriptor import ExpressionDescriptor, Options, CasingTypeEnum
    _HAS_CRON_DESCRIPTOR = True
except ImportError:
    _HAS_CRON_DESCRIPTOR = False

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


def _cron_to_human(cron_str: str) -> str:
    """Convert a cron expression to a human-readable string using cron-descriptor."""
    if _HAS_CRON_DESCRIPTOR:
        try:
            opts = Options()
            opts.casing_type = CasingTypeEnum.Sentence
            opts.use_24hour_time_format = False
            opts.locale_code = "en_US"
            return ExpressionDescriptor(cron_str.strip(), opts).get_description()
        except Exception:
            return f"Cron: {cron_str}"
    return f"Cron: {cron_str}"


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
        # Assume it's a cron expression
        return {"type": "cron", "display": _cron_to_human(val)}

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
    progress("extracting", "Extracting dbt_selector values and schedules from DAGs...")
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
        f"Found {total_selectors} dbt_selector values across {len(dag_selectors)} DAGs",
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
