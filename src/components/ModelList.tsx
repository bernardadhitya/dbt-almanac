import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { filterByRelevance } from '../utils/search';

interface ModelListProps {
  modelNames: string[];
  selectedModel: string | null;
  onSelect: (name: string | null) => void;
}

const ITEM_HEIGHT = 32;
const OVERSCAN = 10;

export function ModelList({ modelNames, selectedModel, onSelect }: ModelListProps) {
  const [listFilter, setListFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const filtered = useMemo(() => {
    if (!listFilter) return modelNames;
    return filterByRelevance(modelNames, listFilter);
  }, [modelNames, listFilter]);

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
  const totalHeight = filtered.length * ITEM_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  const visibleItems = filtered.slice(startIdx, endIdx);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Models ({filtered.length.toLocaleString()})
        </label>
      </div>

      {/* Filter input for the list */}
      <input
        type="text"
        value={listFilter}
        onChange={(e) => setListFilter(e.target.value)}
        placeholder="Filter models..."
        className="w-full px-2.5 py-1.5 mb-2 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

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
            return (
              <button
                key={name}
                onClick={() => onSelect(isActive ? null : name)}
                style={{
                  position: 'absolute',
                  top: idx * ITEM_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ITEM_HEIGHT,
                }}
                className={`flex items-center px-2.5 text-xs text-left w-full rounded transition-colors ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
