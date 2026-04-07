import { useCallback, useRef, useEffect, useState } from 'react';
import { FilterState } from '../types';

interface FiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  disabled: boolean;
}

const MIN_LEVEL = 0;
const MAX_LEVEL = 5;
const CENTER = MAX_LEVEL + 1;            // position 6
const TOTAL_STEPS = CENTER * 2;          // 12: positions 0–12

/**
 * Map upstream/downstream levels (each 0–5) to the 0–12 abstract track:
 *   position 0  = upstream 5   (leftmost)
 *   position 5  = upstream 0   (just left of center)
 *   position 6  = center (the selected model)
 *   position 7  = downstream 0 (just right of center)
 *   position 12 = downstream 5 (rightmost)
 *
 * The left handle lives in [0..5], right handle in [7..12].
 */
function upstreamToPos(level: number): number {
  return MAX_LEVEL - level; // 5→0, 4→1, … 0→5
}
function posToUpstream(pos: number): number {
  return MAX_LEVEL - pos; // 0→5, 1→4, … 5→0
}
function downstreamToPos(level: number): number {
  return CENTER + 1 + level; // 0→7, 1→8, … 5→12
}
function posToDownstream(pos: number): number {
  return pos - CENTER - 1; // 7→0, 8→1, … 12→5
}

export function Filters({ filters, onChange, disabled }: FiltersProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  const leftPos = upstreamToPos(filters.upstreamLevel);
  const rightPos = downstreamToPos(filters.downstreamLevel);

  // Convert a clientX to the nearest track position (0–10)
  const clientXToPos = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.round(ratio * TOTAL_STEPS);
  }, []);

  const handlePointerDown = useCallback((side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(side);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const pos = clientXToPos(e.clientX);

    if (dragging === 'left') {
      // Left handle: clamp to [0..5] (upstream 5..0)
      const clamped = Math.max(0, Math.min(MAX_LEVEL, pos));
      const newUpstream = posToUpstream(clamped);
      if (newUpstream !== filters.upstreamLevel) {
        onChange({
          ...filters,
          upstreamLevel: newUpstream,
          ...(filters.locked ? { downstreamLevel: newUpstream } : {}),
        });
      }
    } else {
      // Right handle: clamp to [7..12] (downstream 0..5)
      const clamped = Math.max(CENTER + 1, Math.min(TOTAL_STEPS, pos));
      const newDownstream = posToDownstream(clamped);
      if (newDownstream !== filters.downstreamLevel) {
        onChange({
          ...filters,
          downstreamLevel: newDownstream,
          ...(filters.locked ? { upstreamLevel: newDownstream } : {}),
        });
      }
    }
  }, [dragging, filters, onChange, clientXToPos]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Clean up dragging state if pointer leaves window
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging]);

  const leftPct = (leftPos / TOTAL_STEPS) * 100;
  const rightPct = (rightPos / TOTAL_STEPS) * 100;
  const centerPct = (CENTER / TOTAL_STEPS) * 100; // 50%

  // Tick labels: 5 4 3 2 1 0 · 0 1 2 3 4 5
  const ticks = Array.from({ length: TOTAL_STEPS + 1 }, (_, i) => {
    if (i === CENTER) return null; // center dot handled separately
    const label = i < CENTER ? MAX_LEVEL - i : i - CENTER - 1;
    return { pos: i, label };
  }).filter(Boolean) as { pos: number; label: number }[];

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
        Dependency Depth
      </label>

      {/* Direction labels */}
      <div className="flex items-center justify-between text-[10px] font-medium text-gray-400 dark:text-gray-500 px-0.5">
        <span>Upstream</span>
        <span>Downstream</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-8 select-none touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />

        {/* Active range: left handle to right handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-blue-500/40 dark:bg-blue-400/30"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />

        {/* Center marker (the selected model) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 -ml-1 z-10"
          style={{ left: `${centerPct}%` }}
        />

        {/* Left handle (upstream) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 group cursor-grab ${dragging === 'left' ? 'cursor-grabbing' : ''}`}
          style={{ left: `${leftPct}%` }}
          onPointerDown={handlePointerDown('left')}
        >
          <div className={`w-4 h-4 rounded-full bg-blue-600 dark:bg-blue-500 border-2 border-white dark:border-gray-900 shadow-md transition-transform ${
            dragging === 'left' ? 'scale-125' : 'group-hover:scale-110'
          }`} />
          {/* Value badge */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded px-1">
            {filters.upstreamLevel}
          </div>
        </div>

        {/* Right handle (downstream) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 group cursor-grab ${dragging === 'right' ? 'cursor-grabbing' : ''}`}
          style={{ left: `${rightPct}%` }}
          onPointerDown={handlePointerDown('right')}
        >
          <div className={`w-4 h-4 rounded-full bg-blue-600 dark:bg-blue-500 border-2 border-white dark:border-gray-900 shadow-md transition-transform ${
            dragging === 'right' ? 'scale-125' : 'group-hover:scale-110'
          }`} />
          {/* Value badge */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded px-1">
            {filters.downstreamLevel}
          </div>
        </div>
      </div>

      {/* Tick marks */}
      <div className="relative h-3 -mt-1">
        {ticks.map(({ pos, label }) => (
          <span
            key={pos}
            className="absolute -translate-x-1/2 text-[9px] text-gray-400 dark:text-gray-500"
            style={{ left: `${(pos / TOTAL_STEPS) * 100}%` }}
          >
            {label}
          </span>
        ))}
        {/* Center dot label */}
        <span
          className="absolute -translate-x-1/2 text-[9px] text-gray-300 dark:text-gray-600"
          style={{ left: `${centerPct}%` }}
        >
          &middot;
        </span>
      </div>

      {/* Lock toggle */}
      <div className="flex items-center justify-center gap-1.5 pt-0.5">
        <button
          onClick={() => {
            if (!filters.locked) {
              // Switching to Synced: snap both to the lesser (shallower) depth
              const min = Math.min(filters.upstreamLevel, filters.downstreamLevel);
              onChange({ ...filters, locked: true, upstreamLevel: min, downstreamLevel: min });
            } else {
              onChange({ ...filters, locked: false });
            }
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            filters.locked
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={filters.locked ? 'Unlock: adjust upstream & downstream independently' : 'Lock: sync upstream & downstream levels'}
        >
          {filters.locked ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          )}
          {filters.locked ? 'Synced' : 'Not Synced'}
        </button>
      </div>
    </div>
  );
}
