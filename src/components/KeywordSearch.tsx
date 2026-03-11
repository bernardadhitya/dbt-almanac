import { useState, useCallback } from 'react';

interface KeywordSearchProps {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  matchCount: number;
  totalVisible: number;
}

export function KeywordSearch({ keyword, onKeywordChange, matchCount, totalVisible }: KeywordSearchProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = useCallback(() => {
    onKeywordChange('');
  }, [onKeywordChange]);

  return (
    <div className="absolute top-3 left-3 z-10">
      <div className={`flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border ${
        isFocused ? 'border-blue-400 dark:border-blue-500' : 'border-gray-300 dark:border-gray-600'
      } transition-colors`}>
        {/* Search icon */}
        <div className="pl-3 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search in queries..."
          className="py-2 pr-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none w-48"
        />

        {/* Match count badge */}
        {keyword && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            matchCount > 0
              ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
            {matchCount}/{totalVisible}
          </span>
        )}

        {/* Clear button */}
        {keyword && (
          <button
            onClick={handleClear}
            className="pr-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
