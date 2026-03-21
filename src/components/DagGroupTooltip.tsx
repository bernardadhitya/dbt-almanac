import { useRef, useLayoutEffect, useState } from 'react';
import cronstrue from 'cronstrue';
import { AirflowIcon } from './Icons';
import { CopyButton } from './CopyButton';
import type { DagScheduleInfo, DagGroupNodeData } from './DagGroupNode';

interface DagGroupTooltipProps {
  data: DagGroupNodeData;
  x: number;
  y: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const OFFSET = 48;

/** Clock icon */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className={className}>
      <circle cx="8" cy="8" r="6.5" strokeWidth={1.3} />
      <path d="M8 4.5V8l2.5 1.5" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dataset icon */
function DatasetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className={className}>
      <ellipse cx="8" cy="4" rx="6" ry="2.5" strokeWidth={1.2} />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" strokeWidth={1.2} />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" strokeWidth={1.2} />
    </svg>
  );
}

/** Convert schedule to human-readable display */
function formatSchedule(schedule: DagScheduleInfo['schedule']): string {
  if (schedule.type === 'cron') {
    try {
      return cronstrue.toString(schedule.display);
    } catch {
      return `Cron: ${schedule.display}`;
    }
  }
  return schedule.display;
}

export function DagGroupTooltip({ data, x, y, onMouseEnter, onMouseLeave }: DagGroupTooltipProps) {
  const { dagFiles, schedules } = data;

  // Build a map of dagFile -> schedule for easy lookup
  const scheduleMap = new Map<string, DagScheduleInfo['schedule']>();
  if (schedules) {
    for (const s of schedules) {
      scheduleMap.set(s.dagFile, s.schedule);
    }
  }

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y - OFFSET });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x - rect.width / 2;
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (left < 8) left = 8;

    let top = y - rect.height - OFFSET;
    if (top < 8) top = y + OFFSET;
    if (top + rect.height > vh - 8) top = vh - rect.height - 8;

    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-[100]"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden text-xs flex flex-col"
        style={{ maxHeight: '400px' }}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 shrink-0 bg-blue-50 dark:bg-blue-900/30">
          <div className="font-semibold text-gray-900 dark:text-gray-100 leading-snug flex items-center gap-1.5">
            <AirflowIcon className="w-4 h-4 shrink-0" />
            <span>Airflow DAGs</span>
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300">
              {dagFiles.length} {dagFiles.length === 1 ? 'DAG' : 'DAGs'}
            </span>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-3 py-2 space-y-2.5 overflow-y-auto min-h-0">
          {dagFiles.map((dagFile) => {
            const schedule = scheduleMap.get(dagFile);
            return (
              <div key={dagFile} className="space-y-0.5">
                {/* DAG filename */}
                <div className="flex items-start gap-1.5">
                  <AirflowIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="font-medium text-gray-800 dark:text-gray-200 text-[11px]">
                    <span className="break-all">{dagFile.replace(/\.py$/, '')}</span>
                    <span className="inline-flex align-middle ml-1"><CopyButton text={dagFile.replace(/\.py$/, '')} label="DAG name" /></span>
                  </span>
                </div>

                {/* Schedule info */}
                {schedule ? (
                  <div className="ml-5 space-y-0.5">
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                      {schedule.type === 'dataset' ? (
                        <DatasetIcon className="w-3 h-3 shrink-0" />
                      ) : (
                        <ClockIcon className="w-3 h-3 shrink-0" />
                      )}
                      <span className="text-[10px]">
                        {formatSchedule(schedule)}
                      </span>
                    </div>
                    {/* Dataset URIs */}
                    {schedule.type === 'dataset' && schedule.datasets && schedule.datasets.length > 0 && (
                      <div className="ml-4 space-y-0.5">
                        {schedule.datasets.map((ds, i) => (
                          <div
                            key={i}
                            className="text-[9px] font-mono text-gray-400 dark:text-gray-500 truncate"
                            title={ds}
                          >
                            → {ds}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ml-5 text-[10px] text-gray-400 dark:text-gray-500 italic">
                    No schedule info
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
