import Dagre from '@dagrejs/dagre';
import { type Node, type Edge, MarkerType } from '@xyflow/react';
import { ParsedManifest, FilterState } from '../types';

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
  if (filters.upstream) {
    let frontier = [selectedId];
    for (let level = 0; level < filters.level; level++) {
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
  if (filters.downstream) {
    let frontier = [selectedId];
    for (let level = 0; level < filters.level; level++) {
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
  highlightedIds?: Set<string>
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
