import { useState, useRef, useEffect, useCallback } from 'react';
import { DbtIcon, SourceIcon } from './Icons';

interface AssetTypeFilterProps {
  filter: Set<string>;
  onChange: (filter: Set<string>) => void;
}

const ASSET_TYPES = [
  { key: 'model', label: 'Models', Icon: DbtIcon },
  { key: 'source', label: 'Sources', Icon: SourceIcon },
] as const;

function FilterIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M1.5 3h13M4 8h8M6 13h4" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function AssetTypeFilter({ filter, onChange }: AssetTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allSelected = filter.size === ASSET_TYPES.length;

  const toggle = useCallback((key: string) => {
    const next = new Set(filter);
    if (next.has(key)) {
      // Don't allow deselecting all — keep at least one
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  }, [filter, onChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-1 rounded transition-colors ${
          !allSelected
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            : open
            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
        }`}
        title="Filter by asset type"
      >
        <FilterIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
          <div className="px-3 py-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Asset Type
          </div>
          {ASSET_TYPES.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer w-full text-left"
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                filter.has(key)
                  ? 'bg-blue-600 dark:bg-blue-500 border-transparent'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
              }`}>
                {filter.has(key) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <Icon className="w-3 h-3 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
