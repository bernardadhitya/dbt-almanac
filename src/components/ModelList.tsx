import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { filterByRelevance } from '../utils/search';
import { DbtIcon, SourceIcon } from './Icons';
import { AssetTypeFilter } from './AssetTypeFilter';
import type { SlimNode } from '../types';

type ViewMode = 'list' | 'card';

interface ModelListProps {
  modelNames: string[];
  sourceNames: string[];
  allNodes: Map<string, SlimNode> | null;
  selectedModel: string | null;
  onSelect: (name: string | null) => void;
  listAnimations?: boolean;
  assetTypeFilter: Set<string>;
  onAssetTypeFilterChange: (filter: Set<string>) => void;
}

const LIST_ITEM_HEIGHT = 32;
const CARD_ITEM_HEIGHT = 92;
const OVERSCAN = 10;
const DESC_MAX_LENGTH = 90;
const SHUFFLE_DURATION = 300; // ms

/** Find a SlimNode by display name */
function findNode(allNodes: Map<string, SlimNode> | null, name: string): SlimNode | undefined {
  if (!allNodes) return undefined;
  for (const [, node] of allNodes) {
    if (node.name === name) return node;
  }
  return undefined;
}

function isSource(name: string): boolean {
  return name.startsWith('source:');
}

function MaterialBadge({ materialized }: { materialized?: string }) {
  if (!materialized) return null;
  const colorMap: Record<string, string> = {
    table: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
    view: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400',
    incremental: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
    ephemeral: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  };
  const cls = colorMap[materialized] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-none ${cls}`}>
      {materialized}
    </span>
  );
}

function ListViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M2 4h12M2 8h12M2 12h12" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function CardViewIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <rect x="1.5" y="2" width="13" height="4.5" rx="1" strokeWidth={1.3} />
      <rect x="1.5" y="9.5" width="13" height="4.5" rx="1" strokeWidth={1.3} />
    </svg>
  );
}

/**
 * Animation phases:
 *  'idle'    – no animation, no transition
 *  'prepare' – offsets applied (items at OLD positions), transition: none
 *  'animate' – offsets cleared (items move to NEW positions), transition active
 */
type AnimPhase = 'idle' | 'prepare' | 'animate';

export function ModelList({ modelNames, sourceNames, allNodes, selectedModel, onSelect, listAnimations = true, assetTypeFilter, onAssetTypeFilterChange }: ModelListProps) {
  const [listFilter, setListFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Animation state
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const [animOffsets, setAnimOffsets] = useState<Map<string, number>>(new Map());
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemHeight = viewMode === 'list' ? LIST_ITEM_HEIGHT : CARD_ITEM_HEIGHT;

  const allNames = useMemo(() => {
    const names: string[] = [];
    if (assetTypeFilter.has('model')) names.push(...modelNames);
    if (assetTypeFilter.has('source')) names.push(...sourceNames);
    return names;
  }, [modelNames, sourceNames, assetTypeFilter]);

  const filtered = useMemo(() => {
    if (!listFilter) return allNames;
    return filterByRelevance(allNames, listFilter);
  }, [allNames, listFilter]);

  // Build current position map and trigger shuffle animation
  useEffect(() => {
    const prevPositions = prevPositionsRef.current;
    const newPositions = new Map<string, number>();
    filtered.forEach((name, idx) => {
      newPositions.set(name, idx * itemHeight);
    });

    if (listAnimations && prevPositions.size > 0) {
      const offsets = new Map<string, number>();
      let hasOffsets = false;

      filtered.forEach((name, idx) => {
        const newY = idx * itemHeight;
        const oldY = prevPositions.get(name);
        if (oldY !== undefined && oldY !== newY) {
          // Item moved: offset = where it was - where it is now
          offsets.set(name, oldY - newY);
          hasOffsets = true;
        } else if (oldY === undefined) {
          // New item entering: fade in via a special offset marker
          offsets.set(name, -1); // sentinel for fade-in
          hasOffsets = true;
        }
      });

      if (hasOffsets) {
        // Clean up any pending animation
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);

        // Phase 1: 'prepare' — snap items to old positions (no transition)
        setAnimOffsets(new Map(offsets));
        setAnimPhase('prepare');

        // Phase 2: next frame — clear offsets, enable transition so items glide to new positions
        animFrameRef.current = requestAnimationFrame(() => {
          animFrameRef.current = requestAnimationFrame(() => {
            setAnimOffsets(new Map());
            setAnimPhase('animate');

            // Phase 3: after transition completes, go back to idle
            animTimerRef.current = setTimeout(() => {
              setAnimPhase('idle');
            }, SHUFFLE_DURATION + 50);
          });
        });
      }
    }

    prevPositionsRef.current = newPositions;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [filtered, itemHeight, listAnimations]);

  // Reset scroll when filter or view mode changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [listFilter, viewMode]);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // Virtual window
  const totalHeight = filtered.length * itemHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + OVERSCAN);
  const visibleItems = filtered.slice(startIdx, endIdx);

  return (
    <div className="flex flex-col min-h-0 flex-1 -mx-4">
      {/* Header row with label + view toggle */}
      <div className="flex items-center justify-between mb-2 px-4">
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <DbtIcon className="w-3.5 h-3.5" />
          Assets ({filtered.length.toLocaleString()})
        </label>
        <div className="flex items-center gap-1">
          <AssetTypeFilter filter={assetTypeFilter} onChange={onAssetTypeFilterChange} />
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title="List view"
            >
              <ListViewIcon />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title="Card view"
            >
              <CardViewIcon />
            </button>
          </div>
        </div>
      </div>

      {/* Filter input */}
      <div className="px-4">
        <input
          type="text"
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          placeholder="Filter assets..."
          className="w-full px-2.5 py-1.5 mb-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Virtualized list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map((name, i) => {
            const idx = startIdx + i;
            const isActive = name === selectedModel;

            // Compute animation style based on phase
            let animStyle: React.CSSProperties = {};
            if (listAnimations) {
              const offset = animOffsets.get(name);
              const isFadeIn = offset === -1;

              if (animPhase === 'prepare') {
                // Snap to old position instantly (no transition)
                const translateY = offset !== undefined && !isFadeIn ? offset : 0;
                animStyle = {
                  transform: `translateY(${translateY}px)`,
                  transition: 'none',
                  opacity: isFadeIn ? 0 : 1,
                };
              } else if (animPhase === 'animate') {
                // Animate to new position (transition active, offset cleared so translateY=0)
                animStyle = {
                  transform: 'translateY(0)',
                  transition: `transform ${SHUFFLE_DURATION}ms cubic-bezier(0.25, 0.8, 0.25, 1), opacity ${SHUFFLE_DURATION}ms ease`,
                  opacity: 1,
                };
              }
              // 'idle' → no extra styles
            }

            const isSrc = isSource(name);
            const ItemIcon = isSrc ? SourceIcon : DbtIcon;

            if (viewMode === 'list') {
              return (
                <button
                  key={name}
                  onClick={() => onSelect(isActive ? null : name)}
                  style={{
                    position: 'absolute',
                    top: idx * itemHeight,
                    left: 0,
                    right: 0,
                    height: itemHeight,
                    ...animStyle,
                  }}
                  className={`flex items-center gap-2 px-4 text-xs text-left w-full transition-colors ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <ItemIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            }

            // Card view
            const node = findNode(allNodes, name);
            const desc = node?.description || node?.source_description || '';
            const truncDesc = desc.length > DESC_MAX_LENGTH
              ? desc.slice(0, DESC_MAX_LENGTH).trimEnd() + '…'
              : desc;

            return (
              <button
                key={name}
                onClick={() => onSelect(isActive ? null : name)}
                style={{
                  position: 'absolute',
                  top: idx * itemHeight,
                  left: 0,
                  right: 0,
                  height: itemHeight,
                  ...animStyle,
                }}
                className={`flex flex-col justify-center px-4 py-2 text-left w-full transition-colors border-b ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-gray-200 dark:border-gray-700'
                    : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                {/* Row 1: icon + name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <ItemIcon className="w-3 h-3 shrink-0" />
                  <span className={`text-xs truncate ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-gray-800 dark:text-gray-200 font-medium'
                  }`}>
                    {name}
                  </span>
                </div>

                {/* Row 2: type badges */}
                <div className="flex items-center gap-1 mt-0.5">
                  {isSrc ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400">
                      source
                    </span>
                  ) : (
                    <>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                        model
                      </span>
                      <MaterialBadge materialized={node?.materialized} />
                    </>
                  )}
                </div>

                {/* Row 3: description */}
                <p className={`text-[11px] leading-tight mt-1 line-clamp-2 ${
                  truncDesc
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-300 dark:text-gray-600 italic'
                }`}>
                  {truncDesc || 'No description'}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
