/**
 * dbt selector parser — resolve dbt selector statements against a ParsedManifest
 * client-side, without invoking `dbt list`.
 *
 * Supported selectors:
 *   model_name          — match by node name (glob)
 *   +model_name         — model + all upstream ancestors
 *   model_name+         — model + all downstream descendants
 *   +model_name+        — model + all upstream + all downstream
 *   N+model_name+M      — with depth limits
 *   tag:value           — nodes matching a tag (glob)
 *   source:name         — all sources in a source group
 *   source:name.table   — specific source table
 *   *                   — all nodes
 *   A B                 — union (space-separated)
 *   A,B                 — intersection (comma-separated)
 *
 * Unsupported (no data in SlimNode): path, fqn, config, package, test_type, etc.
 */

import { ParsedManifest } from '../types';

// ── Glob matching ──────────────────────────────────────────────────────

function globMatch(pattern: string, value: string): boolean {
  // Convert glob pattern to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(value);
}

// ── Graph traversal ────────────────────────────────────────────────────

function traverse(
  manifest: ParsedManifest,
  startIds: Set<string>,
  direction: 'parents' | 'children',
  depth?: number | null,
): Set<string> {
  const adj = direction === 'parents' ? manifest.parentMap : manifest.childMap;
  const visited = new Set<string>();
  const queue: [string, number][] = [];

  for (const id of startIds) {
    queue.push([id, 0]);
  }

  while (queue.length > 0) {
    const [uid, d] = queue.shift()!;
    if (visited.has(uid)) continue;
    visited.add(uid);
    if (depth != null && d >= depth) continue;
    for (const neighbor of adj.get(uid) || []) {
      if (!visited.has(neighbor)) {
        queue.push([neighbor, d + 1]);
      }
    }
  }

  return visited;
}

// ── Selector atom parsing ──────────────────────────────────────────────

interface SelectorAtom {
  method: string | null;
  value: string;
  parents: boolean;
  parentDepth: number | null;
  children: boolean;
  childrenDepth: number | null;
}

const KNOWN_METHODS = new Set([
  'tag', 'source', 'resource_type',
  // These are recognized but will return an "unsupported" error:
  'path', 'file', 'fqn', 'package', 'config',
  'test_type', 'test_name', 'exposure', 'metric',
  'semantic_model', 'saved_query', 'unit_test',
  'access', 'group', 'version', 'state', 'result', 'source_status',
]);

const UNSUPPORTED_METHODS = new Set([
  'path', 'file', 'fqn', 'package', 'config',
  'test_type', 'test_name', 'exposure', 'metric',
  'semantic_model', 'saved_query', 'unit_test',
  'access', 'group', 'version', 'state', 'result', 'source_status',
]);

function parseAtom(raw: string): SelectorAtom {
  raw = raw.trim();

  let parents = false;
  let parentDepth: number | null = null;
  let children = false;
  let childrenDepth: number | null = null;

  // Handle @ prefix (treat as +node+)
  if (raw.startsWith('@')) {
    raw = raw.slice(1);
    parents = true;
    children = true;
  }

  // Handle parent prefix: N+ or bare +
  const parentMatch = raw.match(/^(\d+)\+/);
  if (parentMatch) {
    parents = true;
    parentDepth = parseInt(parentMatch[1], 10);
    raw = raw.slice(parentMatch[0].length);
  } else if (raw.startsWith('+')) {
    parents = true;
    parentDepth = null; // unlimited
    raw = raw.slice(1);
  }

  // Handle child suffix: +N or bare +
  const childMatch = raw.match(/\+(\d+)$/);
  if (childMatch) {
    children = true;
    childrenDepth = parseInt(childMatch[1], 10);
    raw = raw.slice(0, -childMatch[0].length);
  } else if (raw.endsWith('+')) {
    children = true;
    childrenDepth = null;
    raw = raw.slice(0, -1);
  }

  // Parse method:value
  let method: string | null = null;
  let value = raw;

  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const candidateMethod = raw.slice(0, colonIdx);
    const baseMethod = candidateMethod.split('.')[0];
    if (KNOWN_METHODS.has(baseMethod)) {
      method = candidateMethod;
      value = raw.slice(colonIdx + 1);
    }
  }

  return { method, value, parents, parentDepth, children, childrenDepth };
}

// ── Method matching ────────────────────────────────────────────────────

function matchMethod(
  manifest: ParsedManifest,
  method: string,
  value: string,
): { ids: Set<string>; error: string | null } {
  const baseMethod = method.split('.')[0];

  if (UNSUPPORTED_METHODS.has(baseMethod)) {
    return { ids: new Set(), error: `"${method}" selector is not supported in client-side search` };
  }

  const results = new Set<string>();

  if (method === 'tag') {
    for (const [uid, node] of manifest.allNodes) {
      for (const tag of node.tags || []) {
        if (globMatch(value, tag)) {
          results.add(uid);
          break;
        }
      }
    }
  } else if (method === 'source') {
    // source:source_name or source:source_name.table_name
    const parts = value.split('.', 2);
    const srcNamePat = parts[0];
    const tablePat = parts.length > 1 ? parts[1] : null;
    for (const [uid, node] of manifest.allNodes) {
      if (node.resource_type !== 'source') continue;
      if (!globMatch(srcNamePat, node.source_name || '')) continue;
      if (tablePat != null) {
        // For sources, node.name is the display name "source:group.table"
        // We need to match against the raw table name portion
        const tableName = node.name.includes('.')
          ? node.name.split('.').pop() || ''
          : node.name.replace(/^source:/, '');
        if (!globMatch(tablePat, tableName)) continue;
      }
      results.add(uid);
    }
  } else if (method === 'resource_type') {
    for (const [uid, node] of manifest.allNodes) {
      if (globMatch(value, node.resource_type)) {
        results.add(uid);
      }
    }
  }

  return { ids: results, error: null };
}

function matchUnqualified(manifest: ParsedManifest, value: string): Set<string> {
  const results = new Set<string>();

  // Match by node name (display name)
  for (const [uid, node] of manifest.allNodes) {
    if (globMatch(value, node.name)) {
      results.add(uid);
    }
  }

  return results;
}

// ── Atom resolution ────────────────────────────────────────────────────

function resolveAtom(
  manifest: ParsedManifest,
  atom: SelectorAtom,
): { ids: Set<string>; error: string | null } {
  let base: Set<string>;
  let error: string | null = null;

  if (atom.method) {
    const result = matchMethod(manifest, atom.method, atom.value);
    base = result.ids;
    error = result.error;
  } else if (atom.value === '*') {
    base = new Set(manifest.allNodes.keys());
  } else {
    base = matchUnqualified(manifest, atom.value);
  }

  if (error) return { ids: base, error };

  const result = new Set(base);

  if (atom.parents) {
    const ancestors = traverse(manifest, base, 'parents', atom.parentDepth);
    for (const id of ancestors) result.add(id);
  }
  if (atom.children) {
    const descendants = traverse(manifest, base, 'children', atom.childrenDepth);
    for (const id of descendants) result.add(id);
  }

  return { ids: result, error: null };
}

// ── Top-level resolver ─────────────────────────────────────────────────

export interface SelectorResult {
  /** All resolved unique_ids (seed nodes + graph expansion from +/@ operators) */
  nodeIds: string[];
  /** The "seed" nodes before graph expansion — these are the focused/highlighted ones */
  seedIds: string[];
  /** Parse or resolution error, if any */
  error: string | null;
}

export function resolveSelector(
  manifest: ParsedManifest,
  selector: string,
): SelectorResult {
  const trimmed = selector.trim();
  if (!trimmed) {
    return { nodeIds: [], seedIds: [], error: null };
  }

  // Space-separated = union
  const unionTerms = trimmed.split(/\s+/);
  const unionResult = new Set<string>();
  const allSeeds = new Set<string>();
  const errors: string[] = [];

  for (const unionTerm of unionTerms) {
    // Comma-separated = intersection
    const intersectionParts = unionTerm.split(',');
    let termResult: Set<string> | null = null;
    let termSeeds: Set<string> | null = null;

    for (const part of intersectionParts) {
      const atom = parseAtom(part);

      // Collect seed IDs (base matches before graph expansion)
      let seedBase: Set<string>;
      if (atom.method) {
        const r = matchMethod(manifest, atom.method, atom.value);
        seedBase = r.ids;
        if (r.error) errors.push(r.error);
      } else if (atom.value === '*') {
        seedBase = new Set(manifest.allNodes.keys());
      } else {
        seedBase = matchUnqualified(manifest, atom.value);
      }

      const atomResult = resolveAtom(manifest, atom);
      if (atomResult.error && !errors.includes(atomResult.error)) {
        errors.push(atomResult.error);
      }

      if (termResult === null) {
        termResult = atomResult.ids;
        termSeeds = seedBase;
      } else {
        // Intersection
        const prevResult: Set<string> = termResult;
        termResult = new Set(Array.from(prevResult).filter(id => atomResult.ids.has(id)));
        const prevSeeds: Set<string> = termSeeds || new Set<string>();
        termSeeds = new Set(Array.from(prevSeeds).filter(id => seedBase.has(id)));
      }
    }

    if (termResult) {
      for (const id of termResult) unionResult.add(id);
    }
    if (termSeeds) {
      for (const id of termSeeds) allSeeds.add(id);
    }
  }

  // Filter to nodes that exist in the manifest
  const validIds = [...unionResult].filter(id => manifest.allNodes.has(id));
  const validSeeds = [...allSeeds].filter(id => manifest.allNodes.has(id));

  return {
    nodeIds: validIds,
    seedIds: validSeeds,
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}
