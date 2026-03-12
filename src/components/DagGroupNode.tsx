import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { AirflowIcon } from './Icons';

export interface DagGroupNodeData {
  dagFiles: string[];
  width: number;
  height: number;
  /** 0-1 — higher = more shared DAGs, more opaque */
  intensity: number;
  /** IDs of model/source nodes inside this container */
  memberNodeIds: string[];
}

/** Small grip dots icon to hint "drag here" */
function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 6 10" fill="currentColor" className={className}>
      <circle cx="1" cy="1" r="0.9" />
      <circle cx="5" cy="1" r="0.9" />
      <circle cx="1" cy="5" r="0.9" />
      <circle cx="5" cy="5" r="0.9" />
      <circle cx="1" cy="9" r="0.9" />
      <circle cx="5" cy="9" r="0.9" />
    </svg>
  );
}

function DagGroupNodeComponent({ data }: { data: DagGroupNodeData }) {
  const { dagFiles, width, height, intensity } = data;

  // Base opacity 0.06, scaling up to ~0.22 with intensity
  const bgOpacity = 0.06 + intensity * 0.16;
  const borderOpacity = 0.15 + intensity * 0.25;
  const headerBgOpacity = 0.10 + intensity * 0.14;

  const label =
    dagFiles.length <= 2
      ? dagFiles.join(', ')
      : `${dagFiles.slice(0, 2).join(', ')} +${dagFiles.length - 2} more`;

  return (
    <div
      className="rounded-xl"
      style={{
        width,
        height,
        backgroundColor: `rgba(59, 130, 246, ${bgOpacity})`,
        border: `1.5px dashed rgba(59, 130, 246, ${borderOpacity})`,
      }}
    >
      {/*
        Header — window-style drag handle.
        pointer-events-auto overrides the wrapper's pointer-events:none
        so this strip is the only grabbable part.  The body below stays
        transparent and lets canvas panning work normally.
      */}
      <div
        className="dag-group-handle pointer-events-auto cursor-grab active:cursor-grabbing flex items-center gap-1.5 px-2.5 py-1 rounded-t-xl select-none"
        style={{
          backgroundColor: `rgba(59, 130, 246, ${headerBgOpacity})`,
          borderBottom: `1px solid rgba(59, 130, 246, ${borderOpacity * 0.6})`,
        }}
      >
        <GripIcon className="w-1.5 h-2.5 shrink-0 text-blue-500/40" />
        <AirflowIcon className="w-3 h-3 shrink-0" />
        <span
          className="text-[9px] font-semibold truncate"
          style={{ color: `rgba(59, 130, 246, ${0.55 + intensity * 0.35})` }}
          title={dagFiles.join(', ')}
        >
          {label}
        </span>
        {dagFiles.length > 1 && (
          <span
            className="text-[8px] font-bold px-1 py-0.5 rounded-sm shrink-0"
            style={{
              backgroundColor: `rgba(59, 130, 246, ${0.10 + intensity * 0.15})`,
              color: `rgba(59, 130, 246, ${0.6 + intensity * 0.3})`,
            }}
          >
            {dagFiles.length} DAGs
          </span>
        )}
      </div>

      {/* Invisible handles — required by React Flow but we don't use them */}
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  );
}

export const DagGroupNode = memo(DagGroupNodeComponent);
