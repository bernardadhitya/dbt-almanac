import { useState, useEffect, useMemo, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Sidebar } from './components/Sidebar';
import { GraphCanvas } from './components/GraphCanvas';
import { KeywordSearch } from './components/KeywordSearch';
import { SearchResults, MatchResult, buildSnippets } from './components/SearchResults';
import { SettingsModal } from './components/SettingsModal';
import { hydrateManifest } from './utils/manifest';
import { buildGraphData, getFilteredNodeIds, COMPOUND_LAYOUT_MAX_NODES, PERF_MODE_THRESHOLD } from './utils/graph';
import { PerfModeToast } from './components/PerfModeToast';
import { ParsedManifest, FilterState, Settings, LoadingProgress, AirflowDagMap } from './types';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

const AIRFLOW_STEP_ORDER = ['scanning', 'extracting', 'resolving', 'done'];
const AIRFLOW_STEP_LABELS: Record<string, string> = {
  scanning: 'Scanning DAG files',
  extracting: 'Extracting selectors',
  resolving: 'Resolving models',
  done: 'Complete',
};

function AirflowScanBanner({ progress }: { progress: LoadingProgress | null }) {
  const currentIdx = progress ? AIRFLOW_STEP_ORDER.indexOf(progress.step) : 0;
  const percent = Math.min(((currentIdx + 1) / AIRFLOW_STEP_ORDER.length) * 100, 100);

  return (
    <div className="absolute bottom-4 right-4 z-40 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
            Scanning Airflow DAGs
          </span>
        </div>

        {/* Step indicators */}
        <div className="space-y-1 mb-2">
          {AIRFLOW_STEP_ORDER.map((step, stepIdx) => {
            const isDone = stepIdx < currentIdx || progress?.step === 'done';
            const isCurrent = stepIdx === currentIdx && progress?.step !== 'done';
            return (
              <div key={step} className="flex items-center gap-1.5 text-[11px]">
                <div className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-orange-500 text-white animate-pulse'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                }`}>
                  {isDone ? (
                    <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-[7px] font-bold">{stepIdx + 1}</span>
                  )}
                </div>
                <span className={
                  isCurrent ? 'text-gray-900 dark:text-gray-100 font-medium' : isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'
                }>
                  {AIRFLOW_STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Detail text */}
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
          {progress?.detail || 'Initializing...'}
        </p>
      </div>
    </div>
  );
}

const STEP_LABELS: Record<string, string> = {
  reading: 'Reading file',
  parsing: 'Parsing JSON',
  extracting: 'Extracting models',
  mapping: 'Building dependency maps',
  finalizing: 'Finalizing',
  done: 'Complete',
};

const STEP_ORDER = ['reading', 'parsing', 'extracting', 'mapping', 'finalizing', 'done'];

export default function App() {
  const [settings, setSettings] = useState<Settings>({ projectPath: '', airflowDagsPath: '', theme: 'light', edgeAnimations: true, listAnimations: true });
  const [manifest, setManifest] = useState<ParsedManifest | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    selectedModel: null,
    upstreamLevel: 3,
    downstreamLevel: 3,
    locked: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LoadingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [activeResultNodeId, setActiveResultNodeId] = useState<string | null>(null);

  // Airflow DAG state
  const [airflowDagMap, setAirflowDagMap] = useState<AirflowDagMap | null>(null);
  const [airflowScanning, setAirflowScanning] = useState(false);
  const [airflowProgress, setAirflowProgress] = useState<LoadingProgress | null>(null);
  const [showDagGroups, setShowDagGroups] = useState(false);

  // Listen for progress events from main process
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = window.electronAPI.onManifestProgress((data) => {
      setProgress(data);
    });
    return cleanup;
  }, []);

  // Listen for airflow progress events
  useEffect(() => {
    if (!isElectron) return;
    const cleanup = window.electronAPI.onAirflowProgress((data) => {
      setAirflowProgress(data);
    });
    return cleanup;
  }, []);

  // Load settings on mount
  useEffect(() => {
    if (isElectron) {
      window.electronAPI.getSettings().then((s) => {
        setSettings(s);
        if (s.projectPath) loadManifest(s.projectPath, s.airflowDagsPath);
      });
    }
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  const scanAirflowDags = useCallback(async (dagsPath: string, projectPath: string) => {
    if (!isElectron || !dagsPath || !projectPath) return;
    setAirflowScanning(true);
    setAirflowProgress(null);
    try {
      const result = await window.electronAPI.scanAirflowDags(dagsPath, projectPath);
      if (result.success && result.data) {
        setAirflowDagMap(result.data);
      } else {
        console.error('Airflow scan error:', result.error);
      }
    } catch (err: any) {
      console.error('Airflow scan failed:', err.message);
    } finally {
      setAirflowScanning(false);
      setAirflowProgress(null);
    }
  }, []);

  const loadManifest = useCallback(async (projectPath: string, airflowDagsPath?: string) => {
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      if (isElectron) {
        const result = await window.electronAPI.readManifest(projectPath);
        if (result.success && result.data) {
          setProgress({ step: 'hydrating', detail: 'Preparing graph data...' });
          // Small delay so the progress UI renders before hydration blocks the main thread
          await new Promise((r) => setTimeout(r, 50));
          setManifest(hydrateManifest(result.data));
          // After manifest is loaded, scan Airflow DAGs if path is set
          const dagsPath = airflowDagsPath ?? settings.airflowDagsPath;
          if (dagsPath) {
            scanAirflowDags(dagsPath, projectPath);
          }
        } else {
          setError(result.error || 'Failed to read manifest.json');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [scanAirflowDags, settings.airflowDagsPath]);

  const handleChangeSettings = useCallback(async (partial: Partial<Settings>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    if (isElectron) {
      await window.electronAPI.setSettings(partial);
    }
  }, [settings]);

  const handleSelectDirectory = useCallback(async () => {
    if (!isElectron) return;
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      await handleChangeSettings({ projectPath: dir });
      loadManifest(dir);
    }
  }, [handleChangeSettings, loadManifest]);

  const handleSelectAirflowDagsDirectory = useCallback(async () => {
    if (!isElectron || !settings.projectPath) return;
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      await handleChangeSettings({ airflowDagsPath: dir });
      scanAirflowDags(dir, settings.projectPath);
    }
  }, [handleChangeSettings, scanAirflowDags, settings.projectPath]);

  const handleClearAirflowDags = useCallback(async () => {
    setAirflowDagMap(null);
    await handleChangeSettings({ airflowDagsPath: '' });
  }, [handleChangeSettings]);

  // Compute which visible node IDs match the keyword in their raw_code
  const { filteredIds, highlightedIds } = useMemo(() => {
    if (!manifest) return { filteredIds: null, highlightedIds: new Set<string>() };
    const fIds = getFilteredNodeIds(manifest, filters);
    if (!keyword.trim() || !fIds) return { filteredIds: fIds, highlightedIds: new Set<string>() };

    const q = keyword.toLowerCase();
    const hIds = new Set<string>();
    for (const id of fIds) {
      const node = manifest.allNodes.get(id);
      if (node?.raw_code && node.raw_code.toLowerCase().includes(q)) {
        hIds.add(id);
      }
    }
    return { filteredIds: fIds, highlightedIds: hIds };
  }, [manifest, filters, keyword]);

  // Build match results with context snippets for each highlighted node
  const matchResults = useMemo<MatchResult[]>(() => {
    if (!manifest || !keyword.trim() || highlightedIds.size === 0) return [];
    const results: MatchResult[] = [];
    for (const id of highlightedIds) {
      const node = manifest.allNodes.get(id);
      if (!node?.raw_code) continue;
      const { matchCount, snippets } = buildSnippets(node.raw_code, keyword);
      if (matchCount > 0) {
        results.push({ nodeId: id, modelName: node.name, resourceType: node.resource_type, matchCount, snippets });
      }
    }
    results.sort((a, b) => a.modelName.localeCompare(b.modelName));
    return results;
  }, [manifest, keyword, highlightedIds]);

  const { nodes, edges } = useMemo(() => {
    if (!manifest) return { nodes: [], edges: [] };
    // For small graphs with DAG groups enabled, use compound (clustered)
    // Dagre layout so grouped nodes sit together.  For large graphs the
    // compound layout is too expensive and would crash the renderer, so
    // we fall back to regular layout and let GraphCanvas add DAG group
    // containers as a lightweight overlay instead.
    const nodeCount = filteredIds ? filteredIds.size : 0;
    const useCompoundLayout =
      showDagGroups && !!airflowDagMap && nodeCount <= COMPOUND_LAYOUT_MAX_NODES;
    return buildGraphData(
      manifest,
      filteredIds,
      filters.selectedModel,
      highlightedIds,
      useCompoundLayout ? airflowDagMap : null,
    );
  }, [manifest, filteredIds, filters.selectedModel, highlightedIds, showDagGroups, airflowDagMap]);

  // Detect when performance optimizations are active so we can notify the user
  const perfModeActive = showDagGroups && !!airflowDagMap && nodes.length > COMPOUND_LAYOUT_MAX_NODES;

  const progressPercent = progress
    ? Math.min(((STEP_ORDER.indexOf(progress.step) + 1) / STEP_ORDER.length) * 100, 100)
    : 0;

  const airflowDagCount = airflowDagMap ? Object.keys(airflowDagMap).length : null;

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-950">
      <Sidebar
        modelNames={manifest?.modelNames || []}
        models={manifest?.models ?? null}
        filters={filters}
        onFiltersChange={setFilters}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        onOpenSettings={() => setSettingsOpen(true)}
        hasAirflowDags={!!airflowDagMap}
        showDagGroups={showDagGroups}
        onShowDagGroupsChange={setShowDagGroups}
        listAnimations={settings.listAnimations}
      />

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 dark:bg-gray-950/80 z-50">
            <div className="text-center w-80">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />

              {/* Step indicators */}
              <div className="space-y-1.5 mb-4 text-left">
                {STEP_ORDER.map((step) => {
                  const currentIdx = progress ? STEP_ORDER.indexOf(progress.step) : -1;
                  const stepIdx = STEP_ORDER.indexOf(step);
                  const isDone = stepIdx < currentIdx || progress?.step === 'done';
                  const isCurrent = stepIdx === currentIdx && progress?.step !== 'done';

                  return (
                    <div key={step} className="flex items-center gap-2 text-xs">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-blue-500 text-white animate-pulse'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {isDone ? (
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-[8px] font-bold">{stepIdx + 1}</span>
                        )}
                      </div>
                      <span className={`${
                        isCurrent ? 'text-gray-900 dark:text-gray-100 font-medium' : isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'
                      }`}>
                        {STEP_LABELS[step] || step}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Detail text */}
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {progress?.detail || 'Initializing...'}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-50">
            <div className="text-center max-w-md">
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Select Project
              </button>
            </div>
          </div>
        )}

        {!manifest && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Welcome to Almanac
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Select a dbt project directory to get started
              </p>
              <button
                onClick={() => setSettingsOpen(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Open Settings
              </button>
            </div>
          </div>
        )}

        {manifest && !loading && !filters.selectedModel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Select a model from the sidebar or search to view its dependency graph
              </p>
            </div>
          </div>
        )}

        {manifest && !loading && filters.selectedModel && nodes.length > 0 && (
          <div className="absolute inset-0 flex flex-col">
            {/* Graph area */}
            <div className="flex-1 relative min-h-0">
              <KeywordSearch
                keyword={keyword}
                onKeywordChange={setKeyword}
                matchCount={highlightedIds.size}
                totalVisible={nodes.filter((n) => n.type === 'model' && !(n.data as any).isSource).length}
              />
              <ReactFlowProvider>
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedModel={filters.selectedModel}
                  focusNodeId={focusNodeId}
                  onFocusHandled={() => setFocusNodeId(null)}
                  onNodeClick={(nodeId) => setActiveResultNodeId(nodeId)}
                  manifest={manifest}
                  airflowDagMap={airflowDagMap}
                  showDagGroups={showDagGroups}
                  edgeAnimations={settings.edgeAnimations}
                />
              </ReactFlowProvider>
            </div>

            {/* Search results panel */}
            {keyword && matchResults.length > 0 && (
              <SearchResults
                keyword={keyword}
                results={matchResults}
                onFocusModel={(nodeId) => setFocusNodeId(nodeId)}
                activeResultNodeId={activeResultNodeId}
                onActiveResultHandled={() => setActiveResultNodeId(null)}
              />
            )}
          </div>
        )}

        {/* Performance mode toast */}
        <PerfModeToast active={perfModeActive} />

        {/* Airflow DAG scanning progress banner */}
        {airflowScanning && (
          <AirflowScanBanner progress={airflowProgress} />
        )}
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChangeSettings={handleChangeSettings}
        onSelectDirectory={handleSelectDirectory}
        onSelectAirflowDagsDirectory={handleSelectAirflowDagsDirectory}
        onClearAirflowDags={handleClearAirflowDags}
        airflowDagCount={airflowDagCount}
        airflowScanning={airflowScanning}
      />
    </div>
  );
}
