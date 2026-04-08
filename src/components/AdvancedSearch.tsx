import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { resolveSelector, SelectorResult } from '../utils/selector';
import { DbtIcon, SourceIcon } from './Icons';
import { AssetTypeFilter } from './AssetTypeFilter';
import type { ParsedManifest, SlimNode } from '../types';

type ViewMode = 'list' | 'card';

interface AdvancedSearchProps {
  manifest: ParsedManifest | null;
  selectorExpression: string;
  onExpressionChange: (expr: string) => void;
  onResolve: (focusedIds: string[], seedIds: string[]) => void;
  onClear: () => void;
  isActive: boolean;
  result: SelectorResult | null;
  onResultChange: (result: SelectorResult | null) => void;
  onFocusNode?: (nodeId: string) => void;
  assetTypeFilter: Set<string>;
  onAssetTypeFilterChange: (filter: Set<string>) => void;
}

const LIST_ITEM_HEIGHT = 32;
const CARD_ITEM_HEIGHT = 92;
const OVERSCAN = 10;
const DESC_MAX_LENGTH = 90;
const LARGE_RESULT_THRESHOLD = 200;

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

interface MatchedAsset {
  uniqueId: string;
  name: string;
  isSrc: boolean;
  node: SlimNode | undefined;
}

export function AdvancedSearch({
  manifest,
  selectorExpression,
  onExpressionChange,
  onResolve,
  onClear,
  isActive,
  result,
  onResultChange,
  onFocusNode,
  assetTypeFilter,
  onAssetTypeFilterChange,
}: AdvancedSearchProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResolvingRef = useRef(false);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handleResolve = useCallback(() => {
    if (!manifest) return;

    // If expression is empty, clear the selection
    if (!selectorExpression.trim()) {
      onResultChange(null);
      onClear();
      return;
    }

    if (isResolvingRef.current) return;
    isResolvingRef.current = true;

    requestAnimationFrame(() => {
      const res = resolveSelector(manifest, selectorExpression.trim());
      onResultChange(res);
      isResolvingRef.current = false;

      if (res.nodeIds.length > 0) {
        onResolve(res.nodeIds, res.seedIds);
      }
    });
  }, [manifest, selectorExpression, onResolve, onResultChange, onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleResolve();
    }
  }, [handleResolve]);

  // Build sorted list of matched assets
  const matchedAssets = useMemo<MatchedAsset[]>(() => {
    if (!result || !manifest) return [];
    return result.seedIds
      .map(id => {
        const node = manifest.allNodes.get(id);
        return {
          uniqueId: id,
          name: node?.name || id,
          isSrc: node?.resource_type === 'source',
          node,
        };
      })
      .filter(a => assetTypeFilter.has(a.isSrc ? 'source' : 'model'))
      .sort((a, b) => {
        if (a.isSrc !== b.isSrc) return a.isSrc ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }, [result, manifest, assetTypeFilter]);

  const itemHeight = viewMode === 'list' ? LIST_ITEM_HEIGHT : CARD_ITEM_HEIGHT;
  const totalHeight = matchedAssets.length * itemHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
  const endIdx = Math.min(matchedAssets.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + OVERSCAN);
  const visibleItems = matchedAssets.slice(startIdx, endIdx);

  return (
    <div className="flex flex-col min-h-0 flex-1 -mx-4">
      {/* Header row with label + view toggle */}
      <div className="flex items-center justify-between mb-2 px-4">
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <DbtIcon className="w-3.5 h-3.5" />
          dbt Selector
          {matchedAssets.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500">({matchedAssets.length})</span>
          )}
        </label>
        <div className="flex items-center gap-1">
          <AssetTypeFilter filter={assetTypeFilter} onChange={onAssetTypeFilterChange} />
          {matchedAssets.length > 0 && (
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
          )}
        </div>
      </div>

      {/* Selector input + Execute button */}
      <div className="px-4">
        <div className="flex gap-1.5 mb-2">
          <input
            ref={inputRef}
            type="text"
            value={selectorExpression}
            onChange={(e) => onExpressionChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. +my_model tag:daily"
            className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />
          <button
            onClick={handleResolve}
            disabled={!manifest}
            className="shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Execute
          </button>
        </div>
      </div>

      {/* Result summary */}
      {result && matchedAssets.length > 0 && (
        <div className="px-4 mb-1.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            Matched <span className="font-medium text-gray-700 dark:text-gray-300">{matchedAssets.length}</span> asset{matchedAssets.length !== 1 ? 's' : ''}
            {result.nodeIds.length > result.seedIds.length && (
              <span className="text-gray-400 dark:text-gray-500">
                {' '}({result.nodeIds.length} with dependencies)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Error message */}
      {result?.error && (
        <div className="px-4 mb-2">
          <div className="px-2.5 py-1.5 text-[11px] rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            {result.error}
          </div>
        </div>
      )}

      {/* No-match message */}
      {result && matchedAssets.length === 0 && !result.error && (
        <div className="px-4 mb-2">
          <span className="text-[11px] text-red-500 dark:text-red-400">No matches found</span>
        </div>
      )}

      {/* Large result warning */}
      {matchedAssets.length > LARGE_RESULT_THRESHOLD && (
        <div className="px-4 mb-2">
          <div className="px-2 py-1 text-[10px] rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
            Large result set — graph may take a moment to render
          </div>
        </div>
      )}

      {/* Virtualized matched asset list */}
      {matchedAssets.length > 0 && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0"
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleItems.map((asset, i) => {
              const idx = startIdx + i;
              const ItemIcon = asset.isSrc ? SourceIcon : DbtIcon;

              if (viewMode === 'list') {
                return (
                  <button
                    key={asset.uniqueId}
                    onClick={() => onFocusNode?.(asset.uniqueId)}
                    style={{
                      position: 'absolute',
                      top: idx * itemHeight,
                      left: 0,
                      right: 0,
                      height: itemHeight,
                    }}
                    className="flex items-center gap-2 px-4 text-xs text-left w-full transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ItemIcon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{asset.name}</span>
                  </button>
                );
              }

              // Card view
              const desc = asset.node?.description || asset.node?.source_description || '';
              const truncDesc = desc.length > DESC_MAX_LENGTH
                ? desc.slice(0, DESC_MAX_LENGTH).trimEnd() + '…'
                : desc;

              return (
                <button
                  key={asset.uniqueId}
                  onClick={() => onFocusNode?.(asset.uniqueId)}
                  style={{
                    position: 'absolute',
                    top: idx * itemHeight,
                    left: 0,
                    right: 0,
                    height: itemHeight,
                  }}
                  className="flex flex-col justify-center px-4 py-2 text-left w-full transition-colors border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  {/* Row 1: icon + name */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ItemIcon className="w-3 h-3 shrink-0" />
                    <span className="text-xs truncate text-gray-800 dark:text-gray-200 font-medium">
                      {asset.name}
                    </span>
                  </div>

                  {/* Row 2: type badges */}
                  <div className="flex items-center gap-1 mt-0.5">
                    {asset.isSrc ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400">
                        source
                      </span>
                    ) : (
                      <>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                          model
                        </span>
                        <MaterialBadge materialized={asset.node?.materialized} />
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
      )}

      {/* Help text when no result */}
      {!result && !isActive && (
        <div className="px-4 mt-2">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-500 dark:text-gray-400">Syntax guide:</p>
            <div className="space-y-0.5 font-mono">
              <p><span className="text-blue-500">model_name</span> — select by name</p>
              <p><span className="text-blue-500">+model+</span> — with ancestors &amp; descendants</p>
              <p><span className="text-blue-500">2+model+3</span> — with depth limits</p>
              <p><span className="text-blue-500">tag:nightly</span> — by tag</p>
              <p><span className="text-blue-500">source:raw.events</span> — specific source</p>
              <p><span className="text-blue-500">A B</span> — union (space)</p>
              <p><span className="text-blue-500">A,B</span> — intersection (comma)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
