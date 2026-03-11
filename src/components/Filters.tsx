import { FilterState } from '../types';

interface FiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  disabled: boolean;
}

export function Filters({ filters, onChange, disabled }: FiltersProps) {
  return (
    <div className={`space-y-4 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* Direction */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Direction
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.upstream}
              onChange={(e) => onChange({ ...filters, upstream: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            Upstream
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.downstream}
              onChange={(e) => onChange({ ...filters, downstream: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            Downstream
          </label>
        </div>
      </div>

      {/* Level */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Depth Level: {filters.level}
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={filters.level}
          onChange={(e) => onChange({ ...filters, level: parseInt(e.target.value) })}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
        </div>
      </div>
    </div>
  );
}
