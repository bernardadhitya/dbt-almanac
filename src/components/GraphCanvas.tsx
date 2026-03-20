import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useEdgesState,
  useReactFlow,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ModelNode } from './ModelNode';
import { DagGroupNode } from './DagGroupNode';
import { NodeTooltip } from './NodeTooltip';
import { DagGroupTooltip } from './DagGroupTooltip';
import type { DagGroupNodeData } from './DagGroupNode';
import { buildDagGroupNodes } from '../utils/graph';
import { ParsedManifest, AirflowDagMap } from '../types';

const nodeTypes = { model: ModelNode, dagGroup: DagGroupNode };

/** Grace period (ms) when moving cursor between node and tooltip */
const DISMISS_DELAY = 200;
/** Delay before showing tooltip to avoid flicker on quick pass-throughs */
const SHOW_DELAY = 300;

interface GraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  selectedModel: string | null;
  focusNodeId?: string | null;
  onFocusHandled?: () => void;
  onNodeClick?: (nodeId: string) => void;
  manifest?: ParsedManifest | null;
  airflowDagMap?: AirflowDagMap | null;
  showDagGroups?: boolean;
  edgeAnimations?: boolean;
}

function GraphCanvasInner({ nodes: inputNodes, edges: inputEdges, selectedModel, focusNodeId, onFocusHandled, onNodeClick, manifest, airflowDagMap, showDagGroups, edgeAnimations = true }: GraphCanvasProps) {
  // All nodes (model/source + dagGroup containers) live in one state.
  // DagGroup nodes are recomputed from model positions on every position change
  // so containers follow dragged nodes in real-time.
  const [nodes, setNodes] = useState<Node[]>(inputNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inputEdges);
  const { fitView, setCenter } = useReactFlow();
  const prevSelectedRef = useRef<string | null>(null);

  // Tooltip state: the visible tooltip's node ID + anchored position
  const [tooltip, setTooltip] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  // DAG group tooltip state: shown when hovering a dagGroup container header
  const [dagGroupTooltip, setDagGroupTooltip] = useState<{ data: DagGroupNodeData; x: number; y: number } | null>(null);

  // Hovered node for edge highlighting (set instantly, cleared with tooltip dismiss)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Refs for hover timing
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodeRef = useRef<string | null>(null); // node waiting to show

  // Sync nodes from parent when input changes (initial layout or model/filter change)
  useEffect(() => {
    if (showDagGroups && airflowDagMap) {
      const dagGroups = buildDagGroupNodes(inputNodes, airflowDagMap);
      setNodes([...dagGroups, ...inputNodes]);
    } else {
      setNodes(inputNodes);
    }
  }, [inputNodes, showDagGroups, airflowDagMap]);

  // Sync edges from parent
  useEffect(() => {
    setEdges(inputEdges);
  }, [inputEdges, setEdges]);

  // Compute styled edges: highlight connected edges on hover, dim the rest.
  // edgeAnimations controls only the flowing dash animation and glow filter;
  // the blue highlight + dimming of other edges is always active.
  const styledEdges = useMemo(() => {
    if (!hoveredNodeId) return edges;

    return edges.map((edge) => {
      const isConnected =
        edge.source === hoveredNodeId || edge.target === hoveredNodeId;

      if (isConnected) {
        return {
          ...edge,
          animated: edgeAnimations,
          style: {
            stroke: '#3b82f6',
            strokeWidth: 2.5,
            ...(edgeAnimations && {
              filter:
                'drop-shadow(0 0 3px rgba(59,130,246,0.55)) drop-shadow(0 0 7px rgba(59,130,246,0.3))',
            }),
            transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: '#3b82f6',
          },
        };
      }

      // Dim non-connected edges so highlighted ones stand out
      return {
        ...edge,
        style: {
          stroke: '#d1d5db',
          strokeWidth: 1,
          opacity: 0.35,
          transition:
            'stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: '#d1d5db',
        },
      };
    });
  }, [edges, hoveredNodeId, edgeAnimations]);

  // Custom onNodesChange handler:
  // - When a dagGroup container is dragged, move all its member nodes by the same delta
  // - After any position change, recompute dagGroup bounding boxes
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      let next = applyNodeChanges(changes, prev);

      // If a dagGroup is being actively dragged, move its member nodes too
      for (const change of changes) {
        if (
          change.type !== 'position' ||
          !('dragging' in change && change.dragging) ||
          !change.id.startsWith('dag-group-')
        ) continue;
        if (!('position' in change) || !change.position) continue;

        const prevGroup = prev.find((n) => n.id === change.id);
        if (!prevGroup) continue;

        const dx = change.position.x - prevGroup.position.x;
        const dy = change.position.y - prevGroup.position.y;
        if (dx === 0 && dy === 0) continue;

        const memberIds = new Set<string>((prevGroup.data as any).memberNodeIds || []);
        next = next.map((n) =>
          memberIds.has(n.id)
            ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            : n,
        );
      }

      // Recompute dagGroup bounding boxes whenever any node position changes
      const hasPositionChange = changes.some((c) => c.type === 'position');
      if (hasPositionChange && showDagGroups && airflowDagMap) {
        const modelNodes = next.filter((n) => n.type !== 'dagGroup');
        const newDagGroups = buildDagGroupNodes(modelNodes, airflowDagMap);
        next = [...newDagGroups, ...modelNodes];
      }

      return next;
    });
  }, [showDagGroups, airflowDagMap]);

  // Fit view on initial load / data change
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.1, duration: 300 }), 100);
    return () => clearTimeout(timer);
  }, [inputNodes, fitView]);

  // Center on selected model when it changes
  useEffect(() => {
    if (selectedModel && selectedModel !== prevSelectedRef.current) {
      const selectedNode = inputNodes.find(
        (n) => (n.data as any).label === selectedModel
      );
      if (selectedNode) {
        setTimeout(() => {
          setCenter(
            selectedNode.position.x + 100,
            selectedNode.position.y + 22,
            { zoom: 1.5, duration: 500 }
          );
        }, 200);
      }
    }
    prevSelectedRef.current = selectedModel;
  }, [selectedModel, inputNodes, setCenter]);

  // Focus on a specific node (triggered from search results panel)
  useEffect(() => {
    if (!focusNodeId) return;
    const node = inputNodes.find((n) => n.id === focusNodeId);
    if (node) {
      setCenter(
        node.position.x + 100,
        node.position.y + 22,
        { zoom: 1.5, duration: 500 }
      );
    }
    onFocusHandled?.();
  }, [focusNodeId, inputNodes, setCenter, onFocusHandled]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  // --- Tooltip hover logic ---

  const clearAllTimers = useCallback(() => {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null; }
    pendingNodeRef.current = null;
  }, []);

  const scheduleDismiss = useCallback(() => {
    // Don't dismiss immediately — give a grace period for cursor to move to tooltip
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setTooltip(null);
      setDagGroupTooltip(null);
      setHoveredNodeId(null);
      dismissTimerRef.current = null;
    }, DISMISS_DELAY);
  }, []);

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const handleNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    // Cancel any pending dismiss (e.g. re-entering same node from tooltip)
    cancelDismiss();

    // DAG group nodes: show DAG group tooltip
    if (node.type === 'dagGroup') {
      // Clear any model tooltip
      setTooltip(null);
      setHoveredNodeId(null);

      // If already showing for this group, keep it
      if (dagGroupTooltip && dagGroupTooltip.data === (node.data as DagGroupNodeData)) return;

      // Cancel any pending show
      if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }

      const anchorX = event.clientX;
      const anchorY = event.clientY;
      const nodeData = node.data as DagGroupNodeData;
      pendingNodeRef.current = node.id;

      showTimerRef.current = setTimeout(() => {
        if (pendingNodeRef.current === node.id) {
          setDagGroupTooltip({ data: nodeData, x: anchorX, y: anchorY });
        }
        showTimerRef.current = null;
      }, SHOW_DELAY);
      return;
    }

    // Model/source nodes: show model tooltip
    // Clear any DAG group tooltip
    setDagGroupTooltip(null);

    // Highlight edges immediately
    setHoveredNodeId(node.id);

    // If tooltip is already showing for this node, keep it
    if (tooltip?.nodeId === node.id) return;

    // Cancel any pending show for a different node
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }

    // Capture anchor position from the mouse at entry time
    const anchorX = event.clientX;
    const anchorY = event.clientY;
    pendingNodeRef.current = node.id;

    showTimerRef.current = setTimeout(() => {
      if (pendingNodeRef.current === node.id) {
        setTooltip({ nodeId: node.id, x: anchorX, y: anchorY });
      }
      showTimerRef.current = null;
    }, SHOW_DELAY);
  }, [cancelDismiss, tooltip?.nodeId, dagGroupTooltip]);

  const handleNodeMouseLeave = useCallback(() => {
    // Cancel any pending show
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    pendingNodeRef.current = null;

    if (tooltip || dagGroupTooltip) {
      // A tooltip is showing — use grace period
      scheduleDismiss();
    } else {
      // No tooltip yet — clear edge highlighting immediately
      setHoveredNodeId(null);
    }
  }, [tooltip, dagGroupTooltip, scheduleDismiss]);

  // Called when cursor enters the tooltip card
  const handleTooltipMouseEnter = useCallback(() => {
    cancelDismiss();
  }, [cancelDismiss]);

  // Called when cursor leaves the tooltip card
  const handleTooltipMouseLeave = useCallback(() => {
    scheduleDismiss();
  }, [scheduleDismiss]);

  // Clear tooltip + edge highlighting on panning/zooming
  const handleMoveStart = useCallback(() => {
    clearAllTimers();
    setTooltip(null);
    setDagGroupTooltip(null);
    setHoveredNodeId(null);
  }, [clearAllTimers]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const hoveredSlimNode = tooltip && manifest ? manifest.allNodes.get(tooltip.nodeId) : null;
  const hoveredAirflowDags = tooltip && airflowDagMap ? airflowDagMap[tooltip.nodeId] || null : null;

  const defaultEdgeOptions = {
    type: 'default' as const,  // bezier curves — loose, flowing arrows
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  };

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onMoveStart={handleMoveStart}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        minZoom={0.01}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-gray-50 dark:!bg-gray-950" />
        <Controls className="!bg-white dark:!bg-gray-800 !border-gray-300 dark:!border-gray-600 !shadow-md [&>button]:!bg-white dark:[&>button]:!bg-gray-800 [&>button]:!border-gray-300 dark:[&>button]:!border-gray-600 [&>button]:!text-gray-600 dark:[&>button]:!text-gray-300" />
        <MiniMap
          className="!bg-white dark:!bg-gray-800 !border-gray-300 dark:!border-gray-600"
          nodeColor={(node) => {
            if ((node.data as any).isHighlighted) return '#f59e0b';
            if ((node.data as any).isSelected) return '#3b82f6';
            if ((node.data as any).isSource) return '#22c55e';
            return '#94a3b8';
          }}
          maskColor="rgba(0,0,0,0.1)"
        />
      </ReactFlow>

      {/* Render model tooltip as portal so it's not clipped by React Flow container */}
      {hoveredSlimNode && tooltip && createPortal(
        <NodeTooltip
          node={hoveredSlimNode}
          x={tooltip.x}
          y={tooltip.y}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          airflowDags={hoveredAirflowDags}
        />,
        document.body
      )}

      {/* Render DAG group tooltip as portal */}
      {dagGroupTooltip && createPortal(
        <DagGroupTooltip
          data={dagGroupTooltip.data}
          x={dagGroupTooltip.x}
          y={dagGroupTooltip.y}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />,
        document.body
      )}
    </>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasInner {...props} />;
}
