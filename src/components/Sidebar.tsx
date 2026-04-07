import { useRef, useCallback, useState, useEffect } from 'react';
import { Filters } from './Filters';
import { ModelList } from './ModelList';
import { AdvancedSearch } from './AdvancedSearch';
import { AirflowIcon } from './Icons';
import { FilterState, SlimNode, ParsedManifest } from '../types';
import type { SelectorResult } from '../utils/selector';

const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 288;

interface SidebarProps {
  modelNames: string[];
  sourceNames: string[];
  allNodes: Map<string, SlimNode> | null;
  manifest: ParsedManifest | null;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  nodeCount: number;
  edgeCount: number;
  onOpenSettings: () => void;
  hasAirflowDags: boolean;
  showDagGroups: boolean;
  onShowDagGroupsChange: (show: boolean) => void;
  listAnimations?: boolean;
  onFocusNode?: (nodeId: string) => void;
}

export function Sidebar({
  modelNames,
  sourceNames,
  allNodes,
  manifest,
  filters,
  onFiltersChange,
  nodeCount,
  edgeCount,
  onOpenSettings,
  hasAirflowDags,
  showDagGroups,
  onShowDagGroupsChange,
  listAnimations = true,
  onFocusNode,
}: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [selectorResult, setSelectorResult] = useState<SelectorResult | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const maxWidth = () => Math.floor(window.innerWidth / 3);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(MIN_WIDTH, Math.min(e.clientX, maxWidth()));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div
      ref={sidebarRef}
      className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 relative shrink-0"
      style={{ width }}
    >
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-end app-drag">
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors app-no-drag"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Filters */}
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
        <Filters
          filters={filters}
          onChange={onFiltersChange}
          disabled={filters.advancedMode
            ? !filters.focusedNodeIds || filters.focusedNodeIds.length === 0
            : !filters.selectedModel
          }
        />
      </div>

      {/* DAG Groups toggle — only visible when Airflow DAGs are loaded */}
      {hasAirflowDags && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <AirflowIcon className="w-3.5 h-3.5" />
              DAG Groups
            </span>
            <button
              onClick={() => onShowDagGroupsChange(!showDagGroups)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showDagGroups ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  showDagGroups ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>
      )}

      {/* Mode toggle: Assets / Selector */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          <button
            onClick={() => onFiltersChange({ ...filters, advancedMode: false })}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              !filters.advancedMode
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Assets
          </button>
          <button
            onClick={() => onFiltersChange({ ...filters, advancedMode: true })}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              filters.advancedMode
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Selector
          </button>
        </div>
      </div>

      {/* Asset list or Advanced search */}
      <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
        {filters.advancedMode ? (
          <AdvancedSearch
            manifest={manifest}
            selectorExpression={filters.selectorExpression}
            onExpressionChange={(expr) => onFiltersChange({ ...filters, selectorExpression: expr })}
            onResolve={(focusedIds) => onFiltersChange({ ...filters, focusedNodeIds: focusedIds })}
            onClear={() => onFiltersChange({ ...filters, focusedNodeIds: null, selectorExpression: '' })}
            isActive={!!filters.focusedNodeIds && filters.focusedNodeIds.length > 0}
            result={selectorResult}
            onResultChange={setSelectorResult}
            onFocusNode={onFocusNode}
          />
        ) : (
          <ModelList
            modelNames={modelNames}
            sourceNames={sourceNames}
            allNodes={allNodes}
            selectedModel={filters.selectedModel}
            onSelect={(name) => onFiltersChange({ ...filters, selectedModel: name })}
            listAnimations={listAnimations}
          />
        )}
      </div>

      {/* Stats Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
        {nodeCount} nodes &middot; {edgeCount} edges
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors"
      />
    </div>
  );
}
