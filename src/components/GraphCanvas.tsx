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
import { buildDagGroupNodes, PERF_MODE_THRESHOLD } from '../utils/graph';
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
  onHideNode?: (nodeId: string) => void;
  /** Node whose detail sidebar is open — keeps edges highlighted */
  activeNodeId?: string | null;
  manifest?: ParsedManifest | null;
  airflowDagMap?: AirflowDagMap | null;
  showDagGroups?: boolean;
  edgeAnimations?: boolean;
}

function GraphCanvasInner({ nodes: inputNodes, edges: inputEdges, selectedModel, focusNodeId, onFocusHandled, onNodeClick, onHideNode, activeNodeId, manifest, airflowDagMap, showDagGroups, edgeAnimations = true }: GraphCanvasProps) {
  // All nodes (model/source + dagGroup containers) live in one state.
  // DagGroup nodes are recomputed from model positions on every position change
  // so containers follow dragged nodes in real-time.
  const [nodes, setNodes] = useState<Node[]>(inputNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inputEdges);
  const { fitView, setCenter, flowToScreenPosition } = useReactFlow();
  const prevSelectedRef = useRef<string | null>(null);

  // Tooltip state: the visible tooltip's node ID + anchored position
  const [tooltip, setTooltip] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  // DAG group tooltip state: shown when hovering a dagGroup container header
  const [dagGroupTooltip, setDagGroupTooltip] = useState<{ data: DagGroupNodeData; x: number; y: number } | null>(null);

  // Hovered node for edge highlighting (set instantly, cleared with tooltip dismiss)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Tooltip placement: 'above' or 'below' the node — used to position the hide button on the opposite side
  const [tooltipPlacement, setTooltipPlacement] = useState<'above' | 'below'>('above');

  // Refs for hover timing
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodeRef = useRef<string | null>(null); // node waiting to show

  // Performance mode: for large graphs, defer heavy work and skip
  // per-frame container rebuilds to prevent renderer crashes.
  const isLargeGraph = inputNodes.length > PERF_MODE_THRESHOLD;

  // Sync nodes from parent when input changes (initial layout or model/filter change).
  useEffect(() => {
    if (showDagGroups && airflowDagMap) {
      if (isLargeGraph) {
        // Large graph → render base nodes immediately, defer DAG groups
        setNodes(inputNodes);
        const rafId = requestAnimationFrame(() => {
          const dagGroups = buildDagGroupNodes(inputNodes, airflowDagMap);
          setNodes([...dagGroups, ...inputNodes]);
        });
        return () => cancelAnimationFrame(rafId);
      } else {
        // Small graph → compute DAG groups synchronously (full experience)
        const dagGroups = buildDagGroupNodes(inputNodes, airflowDagMap);
        setNodes([...dagGroups, ...inputNodes]);
      }
    } else {
      setNodes(inputNodes);
    }
  }, [inputNodes, showDagGroups, airflowDagMap, isLargeGraph]);

  // Sync edges from parent
  useEffect(() => {
    setEdges(inputEdges);
  }, [inputEdges, setEdges]);

  // Compute styled edges: highlight connected edges on hover (or active detail node), dim the rest.
  // edgeAnimations controls only the flowing dash animation and glow filter;
  // the blue highlight + dimming of other edges is always active.
  const highlightNodeId = hoveredNodeId || activeNodeId;
  const styledEdges = useMemo(() => {
    if (!highlightNodeId) return edges;

    return edges.map((edge) => {
      const isConnected =
        edge.source === highlightNodeId || edge.target === highlightNodeId;

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
  }, [edges, highlightNodeId, edgeAnimations]);

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

      // Recompute dagGroup bounding boxes after position changes.
      // Small graphs: rebuild on every frame so containers follow in real-time.
      // Large graphs: only rebuild on drag-end to avoid expensive per-frame work.
      if (showDagGroups && airflowDagMap) {
        const shouldRebuild = isLargeGraph
          ? changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging === false)
          : changes.some((c) => c.type === 'position');
        if (shouldRebuild) {
          const modelNodes = next.filter((n) => n.type !== 'dagGroup');
          const newDagGroups = buildDagGroupNodes(modelNodes, airflowDagMap);
          next = [...newDagGroups, ...modelNodes];
        }
      }

      return next;
    });
  }, [showDagGroups, airflowDagMap, isLargeGraph]);

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

  // Compute screen-space center of the hovered node for the hide button
  const hideButtonPos = useMemo(() => {
    if (!tooltip || !onHideNode) return null;
    const node = nodes.find(n => n.id === tooltip.nodeId);
    if (!node || node.type === 'dagGroup') return null;
    // Approximate node dimensions (from ModelNode: px-3 py-2 + text)
    const nodeW = node.measured?.width ?? 200;
    const nodeH = node.measured?.height ?? 44;
    const centerScreen = flowToScreenPosition({
      x: node.position.x + nodeW / 2,
      y: node.position.y + nodeH / 2,
    });
    return {
      centerX: centerScreen.x,
      topY: flowToScreenPosition({ x: 0, y: node.position.y }).y,
      bottomY: flowToScreenPosition({ x: 0, y: node.position.y + nodeH }).y,
    };
  }, [tooltip, onHideNode, nodes, flowToScreenPosition]);

  const handleHideNode = useCallback((nodeId: string) => {
    // Clear tooltip and hover state, then notify parent
    clearAllTimers();
    setTooltip(null);
    setHoveredNodeId(null);
    onHideNode?.(nodeId);
  }, [clearAllTimers, onHideNode]);

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
          onPlacementResolved={setTooltipPlacement}
        />,
        document.body
      )}

      {/* Hide Node button — centered on node, opposite side from tooltip */}
      {hoveredSlimNode && tooltip && onHideNode && hideButtonPos && createPortal(
        <div
          className="fixed z-[99]"
          style={{
            left: hideButtonPos.centerX,
            top: tooltipPlacement === 'above'
              ? hideButtonPos.bottomY + 6   // tooltip is above → button below node
              : hideButtonPos.topY - 34,    // tooltip is below → button above node
            transform: 'translateX(-50%)',
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <button
            onClick={() => handleHideNode(tooltip.nodeId)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-950/80 hover:border-red-200 dark:hover:border-red-800 hover:text-red-500 dark:hover:text-red-400 shadow-md transition-colors cursor-pointer"
            title="Hide node and downstream"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 512 512">
              <path d="M71.294,335.13c8.333,8.33,21.84,8.328,30.17-0.005c8.33-8.333,8.328-21.84-0.005-30.17l-48.953-48.936l74.001-74.001 c44.668-44.668,108.079-62.868,168.762-50.082c11.529,2.429,22.844-4.948,25.273-16.477s-4.948-22.844-16.477-25.273 c-74.65-15.728-152.755,6.688-207.729,61.662L7.248,240.936c-8.332,8.332-8.331,21.842,0.003,30.172L71.294,335.13z"/>
              <path d="M506.77,240.913l-64.043-64.021c-8.333-8.33-21.84-8.328-30.17,0.005c-8.33,8.333-8.328,21.84,0.005,30.17l48.953,48.936 l-74.001,74.001c-44.668,44.669-108.079,62.868-168.762,50.082c-11.529-2.429-22.844,4.948-25.273,16.477 c-2.429,11.529,4.948,22.844,16.477,25.273c74.65,15.728,152.755-6.688,207.729-61.662l89.088-89.088 C515.105,262.753,515.104,249.243,506.77,240.913z"/>
              <path d="M150.344,256.011c0,11.782,9.551,21.333,21.333,21.333c11.782,0,21.333-9.551,21.333-21.333c0-35.343,28.657-64,64-64 c11.782,0,21.333-9.551,21.333-21.333c0-11.782-9.551-21.333-21.333-21.333C198.103,149.344,150.344,197.103,150.344,256.011z"/>
              <path d="M321.011,256.011c0,35.343-28.657,64-64,64c-11.782,0-21.333,9.551-21.333,21.333c0,11.782,9.551,21.333,21.333,21.333 c58.907,0,106.667-47.759,106.667-106.667c0-11.782-9.551-21.333-21.333-21.333C330.562,234.677,321.011,244.229,321.011,256.011z"/>
              <path d="M506.762,6.259c-8.331-8.331-21.839-8.331-30.17,0L7.259,475.592c-8.331,8.331-8.331,21.839,0,30.17 c8.331,8.331,21.839,8.331,30.17,0L506.762,36.429C515.094,28.098,515.094,14.59,506.762,6.259z"/>
            </svg>
          </button>
        </div>,
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
