import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

export interface SnippetLine {
  lineNum: number;
  text: string;
  isMatch: boolean;
}

export interface Snippet {
  lines: SnippetLine[];
}

export interface MatchResult {
  nodeId: string;
  modelName: string;
  resourceType: string;
  matchCount: number;
  snippets: Snippet[];
}

interface SearchResultsProps {
  keyword: string;
  results: MatchResult[];
  onFocusModel: (nodeId: string) => void;
  activeResultNodeId?: string | null;
  onActiveResultHandled?: () => void;
}

const CONTEXT_LINES = 3;
const MIN_HEIGHT = 100;
const DEFAULT_HEIGHT = 280;

/** Build snippets with context lines, merging overlapping ranges. */
export function buildSnippets(
  rawCode: string,
  keyword: string
): { matchCount: number; snippets: Snippet[] } {
  const allLines = rawCode.split('\n');
  const kw = keyword.toLowerCase();

  // Find all match line indices (0-based)
  const matchIndices: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].toLowerCase().includes(kw)) {
      matchIndices.push(i);
    }
  }
  if (matchIndices.length === 0) return { matchCount: 0, snippets: [] };

  // Build ranges with context, then merge overlapping
  const ranges: { start: number; end: number }[] = [];
  for (const idx of matchIndices) {
    const start = Math.max(0, idx - CONTEXT_LINES);
    const end = Math.min(allLines.length - 1, idx + CONTEXT_LINES);
    if (ranges.length > 0 && start <= ranges[ranges.length - 1].end + 1) {
      // merge with previous range
      ranges[ranges.length - 1].end = end;
    } else {
      ranges.push({ start, end });
    }
  }

  const matchSet = new Set(matchIndices);
  const snippets: Snippet[] = ranges.map(({ start, end }) => ({
    lines: Array.from({ length: end - start + 1 }, (_, i) => ({
      lineNum: start + i + 1, // 1-based
      text: allLines[start + i],
      isMatch: matchSet.has(start + i),
    })),
  }));

  return { matchCount: matchIndices.length, snippets };
}

function HighlightedLine({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <span>{text}</span>;

  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lower.indexOf(kw, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + kw.length), match: true });
    cursor = idx + kw.length;
  }

  return (
    <span>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="bg-amber-300 dark:bg-amber-600 text-gray-900 dark:text-white rounded-sm px-0.5">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

function SnippetSeparator() {
  return (
    <div className="flex items-center gap-2 px-3 py-0.5 select-none">
      <span className="w-8 text-right text-gray-300 dark:text-gray-600 text-[10px]">⋯</span>
      <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
    </div>
  );
}

export function SearchResults({ keyword, results, onFocusModel, activeResultNodeId, onActiveResultHandled }: SearchResultsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const resultRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-expand all models when results change
  useEffect(() => {
    setExpandedModels(new Set(results.map((r) => r.nodeId)));
  }, [results]);

  // Scroll to active result when a node is clicked on the graph
  useEffect(() => {
    if (!activeResultNodeId) return;
    // Check if the clicked node has matching results
    const hasResult = results.some((r) => r.nodeId === activeResultNodeId);
    if (!hasResult) {
      onActiveResultHandled?.();
      return;
    }
    // Uncollapse the panel if collapsed
    if (collapsed) setCollapsed(false);
    // Expand the model section if collapsed
    setExpandedModels((prev) => {
      if (prev.has(activeResultNodeId)) return prev;
      const next = new Set(prev);
      next.add(activeResultNodeId);
      return next;
    });
    // Scroll into view after a tick (let DOM update)
    requestAnimationFrame(() => {
      const el = resultRefsMap.current.get(activeResultNodeId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Brief highlight flash
        el.classList.add('ring-2', 'ring-blue-400', 'dark:ring-blue-500');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-400', 'dark:ring-blue-500');
        }, 1500);
      }
      onActiveResultHandled?.();
    });
  }, [activeResultNodeId]);

  const maxHeight = () => Math.floor(window.innerHeight * 0.5);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [height]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(startH.current + delta, maxHeight())));
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

  const toggleModel = useCallback((nodeId: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const totalMatches = useMemo(() => results.reduce((sum, r) => sum + r.matchCount, 0), [results]);

  return (
    <div
      className="border-t border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col shrink-0"
      style={{ height: collapsed ? 'auto' : height }}
    >
      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          className="h-1 cursor-row-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors shrink-0"
        />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Search Results
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {results.length} model{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Results list */}
      {!collapsed && (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 text-xs">
          {results.map((result) => {
            const isExpanded = expandedModels.has(result.nodeId);
            return (
              <div
                key={result.nodeId}
                ref={(el) => {
                  if (el) resultRefsMap.current.set(result.nodeId, el);
                  else resultRefsMap.current.delete(result.nodeId);
                }}
              >
                {/* Model header */}
                <div className="flex items-center gap-1 px-3 py-1 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 transition-shadow duration-300">
                  <button
                    onClick={() => toggleModel(result.nodeId)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onFocusModel(result.nodeId)}
                    className="font-semibold text-amber-700 dark:text-amber-400 hover:underline truncate text-left"
                    title={`Focus on ${result.modelName}`}
                  >
                    {result.modelName}
                  </button>
                  <span className={`shrink-0 px-1.5 py-0 rounded text-[10px] font-medium ${
                    result.resourceType === 'source'
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  }`}>
                    {result.resourceType === 'source' ? 'yaml' : 'sql'}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">
                    ({result.matchCount})
                  </span>
                </div>

                {/* Snippets */}
                {isExpanded && (
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    {result.snippets.map((snippet, snippetIdx) => (
                      <div key={snippetIdx}>
                        {/* Separator between snippets */}
                        {snippetIdx > 0 && <SnippetSeparator />}
                        {snippet.lines.map((line) => (
                          <div
                            key={`${result.nodeId}:${line.lineNum}`}
                            className={`flex gap-2 px-3 py-0.5 font-mono ${
                              line.isMatch
                                ? 'bg-amber-50 dark:bg-amber-950/30'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                            }`}
                          >
                            <span className={`select-none shrink-0 w-8 text-right ${
                              line.isMatch
                                ? 'text-amber-500 dark:text-amber-500'
                                : 'text-gray-300 dark:text-gray-600'
                            }`}>
                              {line.lineNum}
                            </span>
                            <span className={`whitespace-pre overflow-x-auto ${
                              line.isMatch
                                ? 'text-gray-800 dark:text-gray-200'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}>
                              {line.isMatch
                                ? <HighlightedLine text={line.text} keyword={keyword} />
                                : line.text
                              }
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
