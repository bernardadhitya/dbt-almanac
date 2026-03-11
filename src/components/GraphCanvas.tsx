import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ModelNode } from './ModelNode';
import { NodeTooltip } from './NodeTooltip';
import { ParsedManifest, AirflowDagMap } from '../types';

const nodeTypes = { model: ModelNode };

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
}

function GraphCanvasInner({ nodes: inputNodes, edges: inputEdges, selectedModel, focusNodeId, onFocusHandled, onNodeClick, manifest, airflowDagMap }: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(inputNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inputEdges);
  const { fitView, setCenter } = useReactFlow();
  const prevSelectedRef = useRef<string | null>(null);

  // Tooltip state: the visible tooltip's node ID + anchored position
  const [tooltip, setTooltip] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  // Refs for hover timing
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodeRef = useRef<string | null>(null); // node waiting to show

  // Update nodes/edges when input changes
  useEffect(() => {
    setNodes(inputNodes);
    setEdges(inputEdges);
  }, [inputNodes, inputEdges, setNodes, setEdges]);

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
  }, [cancelDismiss, tooltip?.nodeId]);

  const handleNodeMouseLeave = useCallback(() => {
    // Cancel any pending show
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    pendingNodeRef.current = null;

    // Schedule dismiss with grace period (cursor might be moving to tooltip)
    if (tooltip) {
      scheduleDismiss();
    }
  }, [tooltip, scheduleDismiss]);

  // Called when cursor enters the tooltip card
  const handleTooltipMouseEnter = useCallback(() => {
    cancelDismiss();
  }, [cancelDismiss]);

  // Called when cursor leaves the tooltip card
  const handleTooltipMouseLeave = useCallback(() => {
    scheduleDismiss();
  }, [scheduleDismiss]);

  // Clear tooltip on panning/zooming
  const handleMoveStart = useCallback(() => {
    clearAllTimers();
    setTooltip(null);
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
        edges={edges}
        onNodesChange={onNodesChange}
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

      {/* Render tooltip as portal so it's not clipped by React Flow container */}
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
    </>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasInner {...props} />;
}
