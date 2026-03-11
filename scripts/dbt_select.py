#!/usr/bin/env python3
"""
dbt selector parser — resolve dbt selector statements against a manifest.json
without invoking `dbt list`.

Usage:
    python dbt_select.py <manifest_path> --select "<selector>" [--exclude "<selector>"] [--resource-type model]

Examples:
    python dbt_select.py target/manifest.json --select "tag:nightly"
    python dbt_select.py target/manifest.json --select "+my_model+"
    python dbt_select.py target/manifest.json --select "tag:nightly,config.materialized:incremental"
    python dbt_select.py target/manifest.json --select "source:raw.events+"
    python dbt_select.py target/manifest.json --select "2+my_model+3" --exclude "other_model"
    python dbt_select.py target/manifest.json --select "@my_model"
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from collections import deque
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Dict, FrozenSet, List, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Manifest loader
# ---------------------------------------------------------------------------

@dataclass
class ManifestNode:
    unique_id: str
    resource_type: str
    name: str
    package_name: str
    fqn: List[str]
    tags: List[str]
    config: dict
    path: str
    original_file_path: str
    depends_on_nodes: List[str]
    source_name: Optional[str] = None
    test_metadata: Optional[dict] = None
    access: Optional[str] = None
    group: Optional[str] = None
    version: Optional[str] = None
    latest_version: Optional[str] = None


@dataclass
class Manifest:
    nodes: Dict[str, ManifestNode]
    parent_map: Dict[str, List[str]]
    child_map: Dict[str, List[str]]
    all_unique_ids: Set[str]


def _load_node(uid: str, raw: dict) -> ManifestNode:
    return ManifestNode(
        unique_id=uid,
        resource_type=raw.get("resource_type", ""),
        name=raw.get("name", ""),
        package_name=raw.get("package_name", ""),
        fqn=raw.get("fqn", []),
        tags=raw.get("tags", []),
        config=raw.get("config") or {},
        path=raw.get("path", ""),
        original_file_path=raw.get("original_file_path", ""),
        depends_on_nodes=raw.get("depends_on", {}).get("nodes", []),
        source_name=raw.get("source_name"),
        test_metadata=raw.get("test_metadata"),
        access=raw.get("access"),
        group=raw.get("group"),
        version=raw.get("version"),
        latest_version=raw.get("latest_version"),
    )


def load_manifest(path: str) -> Manifest:
    with open(path) as f:
        raw = json.load(f)

    nodes: Dict[str, ManifestNode] = {}

    for section in ("nodes", "sources", "exposures", "metrics", "semantic_models", "saved_queries", "unit_tests"):
        for uid, data in raw.get(section, {}).items():
            nodes[uid] = _load_node(uid, data)

    parent_map = raw.get("parent_map", {})
    child_map = raw.get("child_map", {})
    all_ids = set(nodes.keys())

    return Manifest(nodes=nodes, parent_map=parent_map, child_map=child_map, all_unique_ids=all_ids)


# ---------------------------------------------------------------------------
# Glob / wildcard matching helpers
# ---------------------------------------------------------------------------

def _glob_match(pattern: str, value: str) -> bool:
    """fnmatch-style glob match (case-sensitive)."""
    return fnmatch.fnmatchcase(value, pattern)


def _get_nested(d: dict, dotted_key: str):
    """Traverse a dict via dot-separated keys. Returns None if missing."""
    parts = dotted_key.split(".")
    cur = d
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


# ---------------------------------------------------------------------------
# Graph traversal
# ---------------------------------------------------------------------------

def _traverse(manifest: Manifest, start_ids: Set[str], direction: str, depth: Optional[int] = None) -> Set[str]:
    """BFS traversal. direction = 'parents' | 'children'."""
    adj = manifest.parent_map if direction == "parents" else manifest.child_map
    visited: Set[str] = set()
    queue: deque[Tuple[str, int]] = deque()
    for sid in start_ids:
        queue.append((sid, 0))

    while queue:
        uid, d = queue.popleft()
        if uid in visited:
            continue
        visited.add(uid)
        if depth is not None and d >= depth:
            continue
        for neighbor in adj.get(uid, []):
            if neighbor not in visited:
                queue.append((neighbor, d + 1))

    return visited


# ---------------------------------------------------------------------------
# Selector method matching
# ---------------------------------------------------------------------------

def _match_method(manifest: Manifest, method: str, value: str) -> Set[str]:
    """Return set of unique_ids matching a single method:value selector."""
    results: Set[str] = set()

    if method == "tag":
        for uid, node in manifest.nodes.items():
            for tag in node.tags:
                if _glob_match(value, tag):
                    results.add(uid)
                    break

    elif method == "source":
        # source:source_name or source:source_name.table_name
        parts = value.split(".", 1)
        src_name_pat = parts[0]
        table_pat = parts[1] if len(parts) > 1 else None
        for uid, node in manifest.nodes.items():
            if node.resource_type != "source":
                continue
            if not _glob_match(src_name_pat, node.source_name or ""):
                continue
            if table_pat is not None and not _glob_match(table_pat, node.name):
                continue
            results.add(uid)

    elif method == "path":
        for uid, node in manifest.nodes.items():
            ofp = node.original_file_path
            p = node.path
            if _glob_match(value, ofp) or _glob_match(value, p):
                results.add(uid)
            elif ofp.startswith(value.rstrip("/") + "/") or p.startswith(value.rstrip("/") + "/"):
                results.add(uid)
            # Also try with trailing wildcard
            elif "/" not in value and not any(c in value for c in "*?["):
                # bare directory name
                if f"/{value}/" in f"/{ofp}" or f"/{value}/" in f"/{p}":
                    results.add(uid)

    elif method == "file":
        for uid, node in manifest.nodes.items():
            if _glob_match(value, node.original_file_path) or _glob_match(value, node.path):
                results.add(uid)

    elif method == "fqn":
        # fqn value uses dots as separator; we match against the dot-joined fqn
        for uid, node in manifest.nodes.items():
            fqn_str = ".".join(node.fqn)
            if _glob_match(value, fqn_str):
                results.add(uid)
            # Also allow partial prefix match: fqn:project.subdir matches project.subdir.*
            elif fqn_str.startswith(value + "."):
                results.add(uid)

    elif method == "package":
        for uid, node in manifest.nodes.items():
            if _glob_match(value, node.package_name):
                results.add(uid)

    elif method.startswith("config"):
        # config.materialized:incremental  or  config.meta.key:value
        # The method itself is "config" or "config.x.y"
        config_path = method[len("config"):]
        if config_path.startswith("."):
            config_path = config_path[1:]
        else:
            config_path = ""

        for uid, node in manifest.nodes.items():
            if config_path:
                actual = _get_nested(node.config, config_path)
            else:
                actual = node.config

            if actual is None:
                continue

            # Handle different types
            if isinstance(actual, bool):
                if value.lower() in ("true", "1") and actual:
                    results.add(uid)
                elif value.lower() in ("false", "0") and not actual:
                    results.add(uid)
            elif isinstance(actual, (int, float)):
                if _glob_match(value, str(actual)):
                    results.add(uid)
            elif isinstance(actual, str):
                if _glob_match(value, actual):
                    results.add(uid)
            elif isinstance(actual, list):
                for item in actual:
                    if _glob_match(value, str(item)):
                        results.add(uid)
                        break
            elif isinstance(actual, dict):
                # Check if value matches any key
                for k in actual.keys():
                    if _glob_match(value, str(k)):
                        results.add(uid)
                        break

    elif method == "test_type":
        for uid, node in manifest.nodes.items():
            if node.resource_type != "test":
                continue
            if value == "generic" and node.test_metadata is not None:
                results.add(uid)
            elif value == "singular" and node.test_metadata is None:
                results.add(uid)
            elif value == "unit" and node.resource_type == "unit_test":
                results.add(uid)

    elif method == "test_name":
        for uid, node in manifest.nodes.items():
            if node.test_metadata and _glob_match(value, node.test_metadata.get("name", "")):
                results.add(uid)

    elif method == "resource_type":
        for uid, node in manifest.nodes.items():
            if _glob_match(value, node.resource_type):
                results.add(uid)

    elif method == "exposure":
        for uid, node in manifest.nodes.items():
            if node.resource_type == "exposure" and _glob_match(value, node.name):
                results.add(uid)

    elif method == "metric":
        for uid, node in manifest.nodes.items():
            if node.resource_type == "metric" and _glob_match(value, node.name):
                results.add(uid)

    elif method == "semantic_model":
        for uid, node in manifest.nodes.items():
            if node.resource_type == "semantic_model" and _glob_match(value, node.name):
                results.add(uid)

    elif method == "saved_query":
        for uid, node in manifest.nodes.items():
            if node.resource_type == "saved_query" and _glob_match(value, node.name):
                results.add(uid)

    elif method == "unit_test":
        for uid, node in manifest.nodes.items():
            if node.resource_type == "unit_test" and _glob_match(value, node.name):
                results.add(uid)

    elif method == "access":
        for uid, node in manifest.nodes.items():
            if node.access and _glob_match(value, node.access):
                results.add(uid)

    elif method == "group":
        for uid, node in manifest.nodes.items():
            if node.group and _glob_match(value, node.group):
                results.add(uid)

    elif method == "version":
        for uid, node in manifest.nodes.items():
            if node.resource_type != "model":
                continue
            if value == "latest":
                if node.version is not None and node.version == node.latest_version:
                    results.add(uid)
            elif value == "prerelease":
                if node.version is not None and node.latest_version is not None:
                    try:
                        if int(node.version) > int(node.latest_version):
                            results.add(uid)
                    except (ValueError, TypeError):
                        pass
            elif value == "old":
                if node.version is not None and node.latest_version is not None:
                    try:
                        if int(node.version) < int(node.latest_version):
                            results.add(uid)
                    except (ValueError, TypeError):
                        pass
            elif value == "none":
                if node.version is None:
                    results.add(uid)
            else:
                if str(node.version) == value:
                    results.add(uid)

    elif method == "wildcard":
        # Bare * or wildcard with no method
        for uid, node in manifest.nodes.items():
            if _glob_match(value, node.name):
                results.add(uid)

    else:
        print(f"Warning: unknown selector method '{method}', ignoring", file=sys.stderr)

    return results


def _match_unqualified(manifest: Manifest, value: str) -> Set[str]:
    """Match an unqualified selector (no method: prefix).
    dbt tries: model/resource name, then path, then fqn prefix."""
    results: Set[str] = set()

    # 1) Try matching by resource name
    for uid, node in manifest.nodes.items():
        if _glob_match(value, node.name):
            results.add(uid)

    if results:
        return results

    # 2) Try matching by path (directory or file)
    for uid, node in manifest.nodes.items():
        ofp = node.original_file_path
        p = node.path
        val_stripped = value.rstrip("/")

        if _glob_match(value, ofp) or _glob_match(value, p):
            results.add(uid)
        elif ofp.startswith(val_stripped + "/") or p.startswith(val_stripped + "/"):
            results.add(uid)
        # Check if it's a subdirectory component
        elif f"/{val_stripped}/" in f"/{ofp}" or f"/{val_stripped}/" in f"/{p}":
            results.add(uid)

    if results:
        return results

    # 3) Try fqn prefix match
    for uid, node in manifest.nodes.items():
        fqn_str = ".".join(node.fqn)
        if _glob_match(value, fqn_str) or fqn_str.startswith(value + "."):
            results.add(uid)

    return results


# ---------------------------------------------------------------------------
# Selector statement tokenizer / parser
# ---------------------------------------------------------------------------

# Regex to parse a single selector atom:
#   [N+]  [method:]value  [+[M]]
# or
#   @[method:]value
_ATOM_RE = re.compile(
    r"""
    (?P<at>@)?                        # optional @ prefix
    (?:(?P<parent_depth>\d+)\+)?      # optional N+ parent depth
    (?:\+(?=\S))?                     # optional bare + prefix (0-depth = all parents)
    (?P<body>.+?)                     # the method:value or bare value
    $
    """,
    re.VERBOSE,
)


@dataclass
class SelectorAtom:
    method: Optional[str]
    value: str
    parents: bool = False
    parent_depth: Optional[int] = None
    children: bool = False
    children_depth: Optional[int] = None
    at_sign: bool = False  # @ operator


def _parse_atom(raw: str) -> SelectorAtom:
    """Parse a single selector atom like '2+tag:nightly+3' or '@my_model'."""
    raw = raw.strip()

    at_sign = False
    parents = False
    parent_depth: Optional[int] = None
    children = False
    children_depth: Optional[int] = None

    # Handle @ prefix
    if raw.startswith("@"):
        at_sign = True
        raw = raw[1:]

    # Handle parent prefix: N+ or bare +
    m = re.match(r"^(\d+)\+", raw)
    if m:
        parents = True
        parent_depth = int(m.group(1))
        raw = raw[m.end():]
    elif raw.startswith("+"):
        parents = True
        parent_depth = None  # unlimited
        raw = raw[1:]

    # Handle child suffix: +N or bare +
    m = re.search(r"\+(\d+)$", raw)
    if m:
        children = True
        children_depth = int(m.group(1))
        raw = raw[:m.start()]
    elif raw.endswith("+"):
        children = True
        children_depth = None
        raw = raw[:-1]

    # Parse method:value
    method = None
    value = raw

    # Methods can contain dots (config.materialized) so we need to be careful
    # Known method prefixes
    known_methods = (
        "tag", "source", "path", "file", "fqn", "package",
        "config", "test_type", "test_name", "resource_type",
        "exposure", "metric", "semantic_model", "saved_query",
        "unit_test", "access", "group", "version",
        "state", "result", "source_status",
    )

    colon_idx = raw.find(":")
    if colon_idx > 0:
        candidate_method = raw[:colon_idx]
        # Check if it's a known method (possibly with dot subpath like config.materialized)
        base_method = candidate_method.split(".")[0]
        if base_method in known_methods:
            method = candidate_method
            value = raw[colon_idx + 1:]

    return SelectorAtom(
        method=method,
        value=value,
        parents=parents,
        parent_depth=parent_depth,
        children=children,
        children_depth=children_depth,
        at_sign=at_sign,
    )


def _resolve_atom(manifest: Manifest, atom: SelectorAtom) -> Set[str]:
    """Resolve a single selector atom to a set of unique_ids."""
    # Get base matches
    if atom.method:
        base = _match_method(manifest, atom.method, atom.value)
    elif atom.value == "*":
        base = set(manifest.all_unique_ids)
    else:
        base = _match_unqualified(manifest, atom.value)

    result = set(base)

    # Apply graph operators
    if atom.at_sign:
        # @ = the node + all descendants + all ancestors of those descendants
        descendants = _traverse(manifest, base, "children")
        ancestors_of_descendants = _traverse(manifest, descendants, "parents")
        result = descendants | ancestors_of_descendants
    else:
        if atom.parents:
            ancestors = _traverse(manifest, base, "parents", atom.parent_depth)
            result |= ancestors
        if atom.children:
            descendants = _traverse(manifest, base, "children", atom.children_depth)
            result |= descendants

    return result


def _tokenize_selector(selector: str) -> List[str]:
    """Split a selector string into union-separated groups (space-separated),
    each of which may contain intersection terms (comma-separated)."""
    # We need to handle spaces as union operators.
    # But spaces inside quotes or complex expressions shouldn't split.
    # dbt uses simple space splitting for union.
    return selector.strip().split()


def resolve_selector(manifest: Manifest, selector: str) -> Set[str]:
    """Resolve a full selector string (with union/intersection) to unique_ids."""
    union_terms = _tokenize_selector(selector)
    result: Set[str] = set()

    for union_term in union_terms:
        # Each union term may have comma-separated intersection terms
        intersection_parts = union_term.split(",")
        term_result: Optional[Set[str]] = None

        for part in intersection_parts:
            atom = _parse_atom(part)
            atom_result = _resolve_atom(manifest, atom)
            if term_result is None:
                term_result = atom_result
            else:
                term_result &= atom_result

        if term_result:
            result |= term_result

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Resolve dbt selector statements against a manifest.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("manifest", help="Path to dbt manifest.json")
    parser.add_argument("-s", "--select", required=True, help="dbt selector statement")
    parser.add_argument("--exclude", default=None, help="dbt exclude statement")
    parser.add_argument(
        "--resource-type",
        default=None,
        help="Filter results to a specific resource type (e.g. model, test, source, seed, snapshot)",
    )
    parser.add_argument(
        "--output-format",
        choices=["name", "unique_id", "fqn"],
        default="unique_id",
        help="Output format (default: unique_id)",
    )
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)

    selected = resolve_selector(manifest, args.select)

    if args.exclude:
        excluded = resolve_selector(manifest, args.exclude)
        selected -= excluded

    # Optional resource type filter
    if args.resource_type:
        rt = args.resource_type
        selected = {uid for uid in selected if manifest.nodes.get(uid) and manifest.nodes[uid].resource_type == rt}

    # Filter to only existing nodes (graph traversal may reference IDs not in our node set)
    selected = {uid for uid in selected if uid in manifest.nodes}

    # Sort and print
    items = sorted(selected)
    for uid in items:
        node = manifest.nodes[uid]
        if args.output_format == "name":
            print(node.name)
        elif args.output_format == "fqn":
            print(".".join(node.fqn))
        else:
            print(uid)


if __name__ == "__main__":
    main()
