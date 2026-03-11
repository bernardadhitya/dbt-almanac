#!/usr/bin/env python3
"""
Parse a dbt manifest.json and emit a slim JSON with only the data
needed for Almanac's dependency graph.

Progress is written to stderr as JSON lines: {"step": "...", "detail": "..."}
Result is written to stdout as a single JSON object.

Reference: lineage_from_manifest.py by Bernard Kurniawan
"""

import json
import os
import sys
import time


def progress(step: str, detail: str):
    """Send a progress update to stderr (read by Electron main process)."""
    print(json.dumps({"step": step, "detail": detail}), file=sys.stderr, flush=True)


def is_lineage_node(uid: str) -> bool:
    return uid.startswith("model.") or uid.startswith("source.")


def is_model(uid: str) -> bool:
    return uid.startswith("model.")


def main():
    if len(sys.argv) < 2:
        print("Usage: parse_manifest.py <path_to_manifest.json>", file=sys.stderr)
        sys.exit(1)

    manifest_path = sys.argv[1]

    # Step 1: Check file
    if not os.path.isfile(manifest_path):
        print(json.dumps({"error": f"File not found: {manifest_path}"}))
        sys.exit(0)

    size_mb = os.path.getsize(manifest_path) / (1024 * 1024)
    progress("reading", f"Reading manifest.json ({size_mb:.1f} MB)...")

    # Step 2: Load and parse JSON (Python's json.load streams from file handle)
    t0 = time.time()
    progress("parsing", f"Parsing JSON ({size_mb:.1f} MB)...")
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    t_parse = time.time() - t0
    progress("parsing", f"Parsed in {t_parse:.1f}s")

    nodes = manifest.get("nodes", {})
    sources = manifest.get("sources", {})
    raw_parent_map = manifest.get("parent_map", {})
    raw_child_map = manifest.get("child_map", {})

    # Step 3: Extract models
    total_nodes = len(nodes)
    progress("extracting", f"Scanning {total_nodes:,} nodes for models...")

    models = {}
    all_node_ids = set()
    model_count = 0

    for uid, node in nodes.items():
        if node.get("resource_type") == "model":
            name = node.get("name", "")
            # Extract columns as compact list [{name, type}]
            columns_raw = node.get("columns", {})
            columns = [
                {"name": c.get("name", k), "type": c.get("data_type", "")}
                for k, c in columns_raw.items()
            ]
            models[uid] = {
                "unique_id": uid,
                "name": name,
                "resource_type": "model",
                "schema": node.get("schema", ""),
                "database": node.get("database", ""),
                "description": node.get("description", ""),
                "materialized": node.get("config", {}).get("materialized", ""),
                "tags": node.get("tags", []),
                "columns": columns,
                "raw_code": node.get("raw_code", ""),
            }
            all_node_ids.add(uid)
            model_count += 1

    # Step 4: Extract sources (using display format from lineage_from_manifest.py)
    total_sources = len(sources)
    progress("extracting", f"Found {model_count:,} models. Extracting {total_sources:,} sources...")

    source_nodes = {}
    for uid, src in sources.items():
        source_name = src.get("source_name", "")
        name = src.get("name", "")
        # Fallback: parse from unique_id (source.package.schema.table)
        if not source_name and "." in uid:
            parts = uid.split(".")
            if len(parts) >= 4:
                source_name, name = parts[-2], parts[-1]

        display = f"source:{source_name}.{name}" if (source_name or name) else uid

        # Reconstruct YAML-like content from structured fields for keyword search
        yaml_lines = [
            f"source: {source_name}",
            f"  name: {name}",
        ]
        identifier = src.get("identifier", "")
        if identifier and identifier != name:
            yaml_lines.append(f"  identifier: {identifier}")
        desc = src.get("description", "")
        if desc:
            yaml_lines.append(f"  description: {desc}")
        src_desc = src.get("source_description", "")
        if src_desc:
            yaml_lines.append(f"  source_description: {src_desc}")
        loader = src.get("loader", "")
        if loader:
            yaml_lines.append(f"  loader: {loader}")
        db = src.get("database", "")
        if db:
            yaml_lines.append(f"  database: {db}")
        schema = src.get("schema", "")
        if schema:
            yaml_lines.append(f"  schema: {schema}")
        tags = src.get("tags", [])
        if tags:
            yaml_lines.append(f"  tags: [{', '.join(tags)}]")
        columns = src.get("columns", {})
        if columns:
            yaml_lines.append("  columns:")
            for col_name, col_data in columns.items():
                yaml_lines.append(f"    - name: {col_name}")
                col_desc = col_data.get("description", "")
                if col_desc:
                    yaml_lines.append(f"      description: {col_desc}")
                col_type = col_data.get("data_type", "")
                if col_type:
                    yaml_lines.append(f"      data_type: {col_type}")

        # Extract columns as compact list [{name, type}]
        src_columns = [
            {"name": c.get("name", k), "type": c.get("data_type", "")}
            for k, c in columns.items()
        ]

        # Extract external source info (format, URIs) when available
        external = src.get("external")
        external_format = ""
        external_uris = []
        if external and isinstance(external, dict):
            opts = external.get("options") or {}
            external_format = opts.get("format", "") or ""
            uris = opts.get("uris") or []
            if isinstance(uris, list):
                external_uris = [u for u in uris if isinstance(u, str)]

        # relation_name is the fully qualified warehouse table reference
        relation_name = src.get("relation_name", "") or ""

        source_nodes[uid] = {
            "unique_id": uid,
            "name": display,
            "resource_type": "source",
            "schema": src.get("schema", ""),
            "database": db,
            "description": desc,
            "source_description": src_desc,
            "loader": loader,
            "identifier": identifier,
            "source_name": source_name,
            "tags": tags,
            "columns": src_columns,
            "external_format": external_format,
            "external_uris": external_uris,
            "relation_name": relation_name,
            "raw_code": "\n".join(yaml_lines),
        }
        all_node_ids.add(uid)

    # Step 4b: Enrich sources with YAML properties (external_data_configuration)
    # The manifest doesn't include custom `properties` blocks from source YAML files,
    # so we read the YAML files directly to get source_format / source_uris.
    enrich_sources_from_yaml(manifest_path, sources, source_nodes)

    # Step 5: Build filtered parent/child maps (only models and sources)
    progress("mapping", f"Building dependency maps for {len(all_node_ids):,} nodes...")

    parent_map = {}
    for uid, parents in raw_parent_map.items():
        if uid in all_node_ids:
            filtered = [p for p in parents if p in all_node_ids]
            if filtered:
                parent_map[uid] = filtered

    # For child_map: only follow model children downstream (exclude tests)
    child_map = {}
    for uid, children in raw_child_map.items():
        if uid in all_node_ids:
            filtered = [c for c in children if c in all_node_ids]
            if filtered:
                child_map[uid] = filtered

    # Step 6: Build sorted model names
    progress("finalizing", "Sorting model names...")
    model_names = sorted(m["name"] for m in models.values())

    edge_count = sum(len(v) for v in parent_map.values())
    progress("done", f"Ready: {model_count:,} models, {len(source_nodes):,} sources, {edge_count:,} edges")

    # Write result to stdout
    result = {
        "models": models,
        "sources": source_nodes,
        "parentMap": parent_map,
        "childMap": child_map,
        "modelNames": model_names,
    }

    t_total = time.time() - t0
    progress("done", f"Complete in {t_total:.1f}s — {model_count:,} models, {len(source_nodes):,} sources, {edge_count:,} edges")

    json.dump(result, sys.stdout, separators=(",", ":"))


def enrich_sources_from_yaml(manifest_path, sources, source_nodes):
    """Read source YAML files to extract external_data_configuration properties."""
    try:
        import yaml
    except ImportError:
        progress("extracting", "PyYAML not installed — skipping YAML enrichment")
        return

    try:
        Loader = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
        project_dir = os.path.dirname(os.path.dirname(manifest_path))  # up from target/
        progress("extracting", f"Project dir for YAML: {project_dir}")

        # Group sources by their YAML file so we read each file only once
        yaml_groups = {}  # path -> [(uid, src_name, table_name)]
        for uid, snode in source_nodes.items():
            if snode["external_format"] or snode["external_uris"]:
                continue
            src = sources.get(uid, {})
            rel_path = src.get("original_file_path", "")
            if rel_path:
                table_name = src.get("name", "")
                src_name = src.get("source_name", "")
                yaml_groups.setdefault(rel_path, []).append((uid, src_name, table_name))

        progress("extracting", f"Scanning {len(yaml_groups):,} YAML files for source metadata...")

        enriched = 0
        files_with_ext = 0
        errors = 0
        for rel_path, src_list in yaml_groups.items():
            full_path = os.path.join(project_dir, rel_path)
            if not os.path.isfile(full_path):
                continue
            try:
                with open(full_path, "r") as yf:
                    raw = yf.read()
                if "external_data_configuration" not in raw:
                    continue
                files_with_ext += 1
                yml = yaml.load(raw, Loader=Loader)
                if not isinstance(yml, dict):
                    continue
                for source_block in yml.get("sources", []):
                    if not isinstance(source_block, dict):
                        continue
                    for table in source_block.get("tables", []):
                        if not isinstance(table, dict):
                            continue
                        tname = table.get("name", "")
                        props = table.get("properties") or {}
                        ext_config = props.get("external_data_configuration") or {}
                        if not ext_config:
                            continue
                        src_format = ext_config.get("source_format", "") or ""
                        src_uris = ext_config.get("source_uris") or []
                        if not isinstance(src_uris, list):
                            src_uris = [src_uris] if src_uris else []
                        if not src_format and not src_uris:
                            continue
                        for s_uid, s_sname, s_tname in src_list:
                            if s_tname == tname:
                                if src_format:
                                    source_nodes[s_uid]["external_format"] = src_format
                                if src_uris:
                                    source_nodes[s_uid]["external_uris"] = [
                                        u for u in src_uris if isinstance(u, str)
                                    ]
                                enriched += 1
            except Exception as e:
                errors += 1
                if errors <= 3:
                    progress("extracting", f"YAML error in {rel_path}: {e}")
                continue

        progress("extracting",
                 f"YAML enrichment: {files_with_ext} files had ext config, "
                 f"enriched {enriched} sources, {errors} errors")
    except Exception as e:
        progress("extracting", f"YAML enrichment failed: {e}")


if __name__ == "__main__":
    main()
