import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import cronstrue from 'cronstrue';
import { AirflowIcon } from './Icons';
import type { AirflowSchedule } from '../types';

export interface DagScheduleInfo {
  dagFile: string;
  schedule: AirflowSchedule;
}

export interface DagGroupNodeData {
  dagFiles: string[];
  width: number;
  height: number;
  /** 0-1 — higher = more shared DAGs, more opaque */
  intensity: number;
  /** IDs of model/source nodes inside this container */
  memberNodeIds: string[];
  /** Schedule info per DAG file */
  schedules?: DagScheduleInfo[];
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

/** Clock icon for schedule display */
function ClockIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className={className} style={style}>
      <circle cx="8" cy="8" r="6.5" strokeWidth={1.3} />
      <path d="M8 4.5V8l2.5 1.5" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dataset icon for dataset-triggered DAGs */
function DatasetIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className={className} style={style}>
      <ellipse cx="8" cy="4" rx="6" ry="2.5" strokeWidth={1.2} />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" strokeWidth={1.2} />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" strokeWidth={1.2} />
    </svg>
  );
}

/** Build a human-readable schedule label from schedule info */
function ScheduleBadge({ schedules, intensity }: { schedules: DagScheduleInfo[]; intensity: number }) {
  if (schedules.length === 0) return null;

  // Deduplicate and convert cron expressions to human-readable
  const uniqueSchedules: { display: string; type: string; datasets?: string[] }[] = [];
  const seen = new Set<string>();
  for (const s of schedules) {
    const rawDisplay = s.schedule.display;
    if (!seen.has(rawDisplay)) {
      seen.add(rawDisplay);
      // Convert raw cron to human-readable on the client side
      let display = rawDisplay;
      if (s.schedule.type === 'cron') {
        try {
          display = cronstrue.toString(rawDisplay);
        } catch {
          display = `Cron: ${rawDisplay}`;
        }
      }
      uniqueSchedules.push({
        display,
        type: s.schedule.type,
        datasets: s.schedule.datasets,
      });
    }
  }

  const isDataset = uniqueSchedules.some(s => s.type === 'dataset');

  // Build tooltip with full details
  const tooltipLines: string[] = [];
  for (const s of uniqueSchedules) {
    tooltipLines.push(s.display);
    if (s.datasets && s.datasets.length > 0) {
      for (const ds of s.datasets) {
        tooltipLines.push(`  → ${ds}`);
      }
    }
  }

  // Display label: if single schedule show it, if multiple show first + count
  let displayLabel: string;
  if (uniqueSchedules.length === 1) {
    displayLabel = uniqueSchedules[0].display;
  } else {
    displayLabel = `${uniqueSchedules[0].display} +${uniqueSchedules.length - 1}`;
  }

  // For dataset triggers, show dataset URIs inline if just one with few datasets
  const showDatasets = isDataset && uniqueSchedules.length === 1 &&
    uniqueSchedules[0].datasets && uniqueSchedules[0].datasets.length <= 2;

  return (
    <div
      className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md select-none"
      style={{
        backgroundColor: `rgba(59, 130, 246, ${0.08 + intensity * 0.12})`,
      }}
      title={tooltipLines.join('\n')}
    >
      {isDataset ? (
        <DatasetIcon className="w-2.5 h-2.5 shrink-0" style={{ stroke: `rgba(59, 130, 246, ${0.5 + intensity * 0.35})` }} />
      ) : (
        <ClockIcon className="w-2.5 h-2.5 shrink-0" style={{ stroke: `rgba(59, 130, 246, ${0.5 + intensity * 0.35})` }} />
      )}
      <span
        className="text-[8px] font-medium whitespace-nowrap"
        style={{ color: `rgba(59, 130, 246, ${0.5 + intensity * 0.35})` }}
      >
        {displayLabel}
      </span>
      {showDatasets && uniqueSchedules[0].datasets!.map((ds, i) => (
        <span
          key={i}
          className="text-[7px] font-mono truncate max-w-[120px]"
          style={{ color: `rgba(59, 130, 246, ${0.4 + intensity * 0.3})` }}
          title={ds}
        >
          {ds}
        </span>
      ))}
    </div>
  );
}

function DagGroupNodeComponent({ data }: { data: DagGroupNodeData }) {
  const { dagFiles, width, height, intensity, schedules } = data;

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
        {/* Left side: grip, icon, DAG name(s) */}
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

        {/* Spacer to push schedule to the right */}
        <div className="flex-1" />

        {/* Right side: schedule badge */}
        {schedules && schedules.length > 0 && (
          <ScheduleBadge schedules={schedules} intensity={intensity} />
        )}
      </div>

      {/* Invisible handles — required by React Flow but we don't use them */}
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  );
}

export const DagGroupNode = memo(DagGroupNodeComponent);
