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

# Import the dbt selector parser (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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

    # Step 2: Extract selectors from each DAG
    progress("extracting", "Extracting dbt_selector values from DAGs...")
    dag_selectors = {}  # filename -> [selector_strings]
    total_selectors = 0
    for fpath, fname, content in dag_files:
        selectors = extract_selectors(content)
        if selectors:
            dag_selectors[fname] = selectors
            total_selectors += len(selectors)

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
