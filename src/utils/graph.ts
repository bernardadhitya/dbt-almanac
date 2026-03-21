import Dagre from '@dagrejs/dagre';
import { type Node, type Edge, MarkerType } from '@xyflow/react';
import { ParsedManifest, FilterState, AirflowDagMap, AirflowSchedule } from '../types';

/**
 * Maximum nodes for compound (DAG-clustered) Dagre layout.
 * Compound layout scales super-linearly and is the single most expensive
 * operation — keep this conservative.  Above this we use regular Dagre
 * layout but still render DAG group container overlays.
 */
export const COMPOUND_LAYOUT_MAX_NODES = 50;

/**
 * Node-count threshold above which GraphCanvas switches to "perf mode":
 * - Deferred DAG group container computation (requestAnimationFrame)
 * - DAG group bounding boxes only rebuilt on drag-end, not every frame
 *
 * This is intentionally higher than COMPOUND_LAYOUT_MAX_NODES because
 * buildDagGroupNodes is much cheaper than compound Dagre layout.
 */
export const PERF_MODE_THRESHOLD = 80;

export function getFilteredNodeIds(
  manifest: ParsedManifest,
  filters: FilterState
): Set<string> | null {
  if (!filters.selectedModel) return new Set<string>(); // empty = nothing to render

  // Find the unique_id for the selected model name
  const selectedId = Array.from(manifest.models.entries()).find(
    ([, m]) => m.name === filters.selectedModel
  )?.[0];

  if (!selectedId) return new Set<string>();

  const visited = new Set<string>();
  visited.add(selectedId);

  // BFS upstream
  {
    let frontier = [selectedId];
    for (let depth = 0; depth < filters.upstreamLevel; depth++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const parents = manifest.parentMap.get(nodeId) || [];
        for (const parent of parents) {
          if (!visited.has(parent) && manifest.allNodes.has(parent)) {
            visited.add(parent);
            nextFrontier.push(parent);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
  }

  // BFS downstream
  {
    let frontier = [selectedId];
    for (let depth = 0; depth < filters.downstreamLevel; depth++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const children = manifest.childMap.get(nodeId) || [];
        for (const child of children) {
          if (!visited.has(child) && manifest.allNodes.has(child)) {
            visited.add(child);
            nextFrontier.push(child);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
  }

  return visited;
}

export function buildGraphData(
  manifest: ParsedManifest,
  filteredIds: Set<string> | null,
  selectedModelName: string | null,
  highlightedIds?: Set<string>,
  airflowDagMap?: AirflowDagMap | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodeIds = filteredIds ?? new Set(manifest.allNodes.keys());
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  for (const id of nodeIds) {
    const modelData = manifest.allNodes.get(id);
    if (!modelData) continue;

    const isSource = modelData.resource_type === 'source';
    const isSelected = modelData.name === selectedModelName;
    const isHighlighted = highlightedIds ? highlightedIds.has(id) : false;

    nodes.push({
      id,
      type: 'model',
      position: { x: 0, y: 0 },
      data: {
        label: modelData.name,
        resourceType: modelData.resource_type,
        schema: modelData.schema || '',
        isSelected,
        isSource,
        isHighlighted,
      },
    });

    // Add edges from parent_map (parent -> this node)
    const parents = manifest.parentMap.get(id) || [];
    for (const parentId of parents) {
      if (nodeIds.has(parentId)) {
        const edgeId = `${parentId}->${id}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: parentId,
            target: id,
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#94a3b8',
            },
          });
        }
      }
    }
  }

  if (airflowDagMap) {
    return layoutGraphWithDagGroups(nodes, edges, airflowDagMap);
  }
  return layoutGraph(nodes, edges);
}

// Estimate node pixel width from label length (~6.5px per char at 12px font + padding)
function estimateNodeWidth(label: string): number {
  return Math.max(120, label.length * 6.5 + 32);
}

const NODE_HEIGHT = 44;

function layoutGraph(
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 40, marginy: 40 });

  for (const node of nodes) {
    const w = estimateNodeWidth((node.data as any).label);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ── DAG-aware layout (compound graph) ────────────────────────────────

/**
 * Compute DAG group clusters from an AirflowDagMap for a set of visible
 * node IDs.  Returns merged groups (same logic as buildDagGroupNodes)
 * ready for use as dagre compound-graph parents.
 */
function computeDagClusters(
  visibleIds: Set<string>,
  airflowDagMap: AirflowDagMap,
): { nodeIds: Set<string>; dagFiles: string[] }[] {
  // dagFile → Set<visibleNodeId>
  const dagToNodes = new Map<string, Set<string>>();
  for (const [nodeId, dags] of Object.entries(airflowDagMap)) {
    if (!visibleIds.has(nodeId)) continue;
    for (const dag of dags) {
      let s = dagToNodes.get(dag.dagFile);
      if (!s) { s = new Set(); dagToNodes.set(dag.dagFile, s); }
      s.add(nodeId);
    }
  }

  // Merge DAGs covering the exact same set of visible nodes
  const nodeSetKey = (ids: Set<string>) => Array.from(ids).sort().join('\0');
  const groups = new Map<string, { nodeIds: Set<string>; dagFiles: string[] }>();

  for (const [dagFile, nodeIds] of dagToNodes) {
    if (nodeIds.size < 2) continue;
    const key = nodeSetKey(nodeIds);
    let g = groups.get(key);
    if (!g) { g = { nodeIds, dagFiles: [] }; groups.set(key, g); }
    g.dagFiles.push(dagFile.replace(/\.py$/, ''));
  }

  return Array.from(groups.values());
}

/**
 * Layout using dagre's compound-graph mode so that nodes sharing a DAG
 * are clustered together and non-member nodes stay outside the cluster
 * bounding box.
 */
function layoutGraphWithDagGroups(
  nodes: Node[],
  edges: Edge[],
  airflowDagMap: AirflowDagMap,
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Safety net: even if the caller didn't check, fall back to regular
  // layout when the graph exceeds the compound layout threshold.
  if (nodes.length > COMPOUND_LAYOUT_MAX_NODES) {
    console.log(
      `Compound layout skipped: ${nodes.length} nodes exceeds threshold (${COMPOUND_LAYOUT_MAX_NODES}). Using regular layout.`,
    );
    return layoutGraph(nodes, edges);
  }

  const visibleIds = new Set(nodes.map((n) => n.id));
  const clusters = computeDagClusters(visibleIds, airflowDagMap);

  // Fall back to regular layout if there are no multi-node clusters
  if (clusters.length === 0) return layoutGraph(nodes, edges);

  // Create compound graph
  const g = new Dagre.graphlib.Graph({ compound: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 40, marginy: 40 });

  // Add all real nodes
  for (const node of nodes) {
    const w = estimateNodeWidth((node.data as any).label);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Sort clusters largest-first so bigger groups win if a node belongs
  // to multiple clusters (dagre compound allows only one parent).
  const sorted = [...clusters].sort((a, b) => b.nodeIds.size - a.nodeIds.size);
  const assigned = new Set<string>();

  sorted.forEach((cluster, idx) => {
    const clusterId = `__dag_cluster_${idx}`;
    g.setNode(clusterId, {});

    for (const nid of cluster.nodeIds) {
      if (!assigned.has(nid)) {
        g.setParent(nid, clusterId);
        assigned.add(nid);
      }
    }
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - pos.width / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ── DAG group containers ──────────────────────────────────────────────

const GROUP_PADDING_X = 24;
const GROUP_PADDING_TOP = 28;   // extra room for the label row
const GROUP_PADDING_BOTTOM = 16;

/**
 * Estimate the minimum container width needed to display the header content
 * (DAG label + badge + schedule) without truncation.
 *
 * Header layout: grip(6) + gap(6) + airflowIcon(12) + gap(6) + labelText +
 *                [gap(4) + dagCountBadge] + gap(flex) + [scheduleBadge] + padding(20)
 *
 * Font: label is ~9px semibold (≈4.5px/char), schedule is ~8px (≈4px/char)
 */

/**
 * Build translucent container nodes that group visible nodes sharing common
 * Airflow DAGs.  Each container is per-unique-set-of-nodes: if DAG A and
 * DAG B both cover the exact same visible nodes, they merge into one
 * container labelled with both names.  Intensity (opacity) rises with
 * the number of shared DAGs.
 */
export function buildDagGroupNodes(
  positionedNodes: Node[],
  airflowDagMap: AirflowDagMap,
): Node[] {
  const visibleIds = new Set(positionedNodes.map((n) => n.id));

  // 1. Build dagFile → Set<visibleNodeId>  and  dagFile → schedule
  const dagToNodes = new Map<string, Set<string>>();
  const dagSchedules = new Map<string, AirflowSchedule>();
  for (const [nodeId, dags] of Object.entries(airflowDagMap)) {
    if (!visibleIds.has(nodeId)) continue;
    for (const dag of dags) {
      let s = dagToNodes.get(dag.dagFile);
      if (!s) { s = new Set(); dagToNodes.set(dag.dagFile, s); }
      s.add(nodeId);
      // Store schedule info (first seen wins — same DAG file, same schedule)
      if (dag.schedule && !dagSchedules.has(dag.dagFile)) {
        dagSchedules.set(dag.dagFile, dag.schedule);
      }
    }
  }

  // 2. Group DAGs that cover the exact same set of visible nodes
  //    key = sorted node IDs joined → { dagFiles[], nodeIds }
  const nodeSetKey = (ids: Set<string>) => Array.from(ids).sort().join('\0');
  const groups = new Map<string, { nodeIds: Set<string>; dagFiles: string[] }>();

  for (const [dagFile, nodeIds] of dagToNodes) {
    if (nodeIds.size < 2) continue;                 // only group 2+ nodes
    const key = nodeSetKey(nodeIds);
    let g = groups.get(key);
    if (!g) { g = { nodeIds, dagFiles: [] }; groups.set(key, g); }
    g.dagFiles.push(dagFile.replace(/\.py$/, ''));
  }

  if (groups.size === 0) return [];

  // Pre-index positioned nodes for fast lookup
  const nodeById = new Map<string, Node>();
  for (const n of positionedNodes) nodeById.set(n.id, n);

  // 3. For each merged group compute bounding box & create a container node
  const maxDagCount = Math.max(...Array.from(groups.values()).map((g) => g.dagFiles.length));
  const result: Node[] = [];

  let idx = 0;
  for (const { nodeIds, dagFiles } of groups.values()) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const nid of nodeIds) {
      const node = nodeById.get(nid);
      if (!node) continue;
      const w = estimateNodeWidth((node.data as any).label || '');
      const x = node.position.x;
      const y = node.position.y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + NODE_HEIGHT > maxY) maxY = y + NODE_HEIGHT;
    }

    if (minX === Infinity) continue;

    const nodesWidth = (maxX - minX) + GROUP_PADDING_X * 2;
    const height = (maxY - minY) + GROUP_PADDING_TOP + GROUP_PADDING_BOTTOM;

    // Intensity: 0 = 1 DAG, 1 = maxDagCount DAGs
    const intensity = maxDagCount > 1
      ? (dagFiles.length - 1) / (maxDagCount - 1)
      : 0;

    // Collect schedule info for the DAGs in this group
    const schedules: { dagFile: string; schedule: AirflowSchedule }[] = [];
    for (const df of dagFiles) {
      const sched = dagSchedules.get(df + '.py') || dagSchedules.get(df);
      if (sched) schedules.push({ dagFile: df, schedule: sched });
    }

    result.push({
      id: `dag-group-${idx++}`,
      type: 'dagGroup',
      position: { x: minX - GROUP_PADDING_X, y: minY - GROUP_PADDING_TOP },
      data: { dagFiles, width: nodesWidth, height, intensity, memberNodeIds: Array.from(nodeIds), schedules: schedules.length > 0 ? schedules : undefined },
      selectable: false,
      draggable: true,
      connectable: false,
      zIndex: -10,
      dragHandle: '.dag-group-handle',
      style: { pointerEvents: 'none' as const },
    });
  }

  return result;
}
