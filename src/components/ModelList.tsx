import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { filterByRelevance } from '../utils/search';
import { DbtIcon } from './Icons';
import type { SlimNode } from '../types';

type ViewMode = 'list' | 'card';

interface ModelListProps {
  modelNames: string[];
  models: Map<string, SlimNode> | null;
  selectedModel: string | null;
  onSelect: (name: string | null) => void;
}

const LIST_ITEM_HEIGHT = 32;
const CARD_ITEM_HEIGHT = 92;
const OVERSCAN = 10;
const DESC_MAX_LENGTH = 90;

/** Find a SlimNode by model name (looks up by model.{name} key pattern) */
function findNode(models: Map<string, SlimNode> | null, name: string): SlimNode | undefined {
  if (!models) return undefined;
  for (const [, node] of models) {
    if (node.name === name) return node;
  }
  return undefined;
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

export function ModelList({ modelNames, models, selectedModel, onSelect }: ModelListProps) {
  const [listFilter, setListFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const itemHeight = viewMode === 'list' ? LIST_ITEM_HEIGHT : CARD_ITEM_HEIGHT;

  const filtered = useMemo(() => {
    if (!listFilter) return modelNames;
    return filterByRelevance(modelNames, listFilter);
  }, [modelNames, listFilter]);

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
          Models ({filtered.length.toLocaleString()})
        </label>
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

      {/* Filter input */}
      <div className="px-4">
        <input
          type="text"
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          placeholder="Filter models..."
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
                  }}
                  className={`flex items-center gap-2 px-4 text-xs text-left w-full transition-colors ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <DbtIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            }

            // Card view
            const node = findNode(models, name);
            const desc = node?.description || '';
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
                }}
                className={`flex flex-col justify-center px-4 py-2 text-left w-full transition-colors border-b ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-gray-200 dark:border-gray-700'
                    : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                {/* Row 1: icon + name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <DbtIcon className="w-3 h-3 shrink-0" />
                  <span className={`text-xs truncate ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-gray-800 dark:text-gray-200 font-medium'
                  }`}>
                    {name}
                  </span>
                </div>

                {/* Row 2: material badges */}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                    model
                  </span>
                  <MaterialBadge materialized={node?.materialized} />
                </div>

                {/* Row 2: description */}
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
