import { useRef, useCallback, useState, useEffect } from 'react';
import { Filters } from './Filters';
import { ModelList } from './ModelList';
import { AdvancedSearch } from './AdvancedSearch';
import { AirflowIcon } from './Icons';
import { FilterState, SlimNode, ParsedManifest } from '../types';
import type { SelectorResult } from '../utils/selector';

const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 288;

interface HiddenNodeInfo {
  nodeId: string;
  nodeName: string;
  descendantCount: number;
}

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
  hiddenNodes?: HiddenNodeInfo[];
  onUnhideNode?: (nodeId: string) => void;
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
  hiddenNodes = [],
  onUnhideNode,
}: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [selectorResult, setSelectorResult] = useState<SelectorResult | null>(null);
  const [assetTypeFilter, setAssetTypeFilter] = useState<Set<string>>(new Set(['model', 'source']));
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

      {/* Hidden nodes cards */}
      {hiddenNodes.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 512 512">
              <path d="M71.294,335.13c8.333,8.33,21.84,8.328,30.17-0.005c8.33-8.333,8.328-21.84-0.005-30.17l-48.953-48.936l74.001-74.001 c44.668-44.668,108.079-62.868,168.762-50.082c11.529,2.429,22.844-4.948,25.273-16.477s-4.948-22.844-16.477-25.273 c-74.65-15.728-152.755,6.688-207.729,61.662L7.248,240.936c-8.332,8.332-8.331,21.842,0.003,30.172L71.294,335.13z"/>
              <path d="M506.77,240.913l-64.043-64.021c-8.333-8.33-21.84-8.328-30.17,0.005c-8.33,8.333-8.328,21.84,0.005,30.17l48.953,48.936 l-74.001,74.001c-44.668,44.669-108.079,62.868-168.762,50.082c-11.529-2.429-22.844,4.948-25.273,16.477 c-2.429,11.529,4.948,22.844,16.477,25.273c74.65,15.728,152.755-6.688,207.729-61.662l89.088-89.088 C515.105,262.753,515.104,249.243,506.77,240.913z"/>
              <path d="M150.344,256.011c0,11.782,9.551,21.333,21.333,21.333c11.782,0,21.333-9.551,21.333-21.333c0-35.343,28.657-64,64-64 c11.782,0,21.333-9.551,21.333-21.333c0-11.782-9.551-21.333-21.333-21.333C198.103,149.344,150.344,197.103,150.344,256.011z"/>
              <path d="M321.011,256.011c0,35.343-28.657,64-64,64c-11.782,0-21.333,9.551-21.333,21.333c0,11.782,9.551,21.333,21.333,21.333 c58.907,0,106.667-47.759,106.667-106.667c0-11.782-9.551-21.333-21.333-21.333C330.562,234.677,321.011,244.229,321.011,256.011z"/>
              <path d="M506.762,6.259c-8.331-8.331-21.839-8.331-30.17,0L7.259,475.592c-8.331,8.331-8.331,21.839,0,30.17 c8.331,8.331,21.839,8.331,30.17,0L506.762,36.429C515.094,28.098,515.094,14.59,506.762,6.259z"/>
            </svg>
            Hidden Nodes
          </div>
          {hiddenNodes.map((hn) => (
            <div
              key={hn.nodeId}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-700 dark:text-gray-300 truncate">{hn.nodeName}</div>
                {hn.descendantCount > 0 && (
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">
                    +{hn.descendantCount} downstream
                  </div>
                )}
              </div>
              <button
                onClick={() => onUnhideNode?.(hn.nodeId)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
                title="Unhide node"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
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
            assetTypeFilter={assetTypeFilter}
            onAssetTypeFilterChange={setAssetTypeFilter}
          />
        ) : (
          <ModelList
            modelNames={modelNames}
            sourceNames={sourceNames}
            allNodes={allNodes}
            selectedModel={filters.selectedModel}
            onSelect={(name) => onFiltersChange({ ...filters, selectedModel: name })}
            listAnimations={listAnimations}
            assetTypeFilter={assetTypeFilter}
            onAssetTypeFilterChange={setAssetTypeFilter}
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
