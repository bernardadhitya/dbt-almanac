import { Settings, UpdateStatus } from '../types';
import { DbtIcon, AirflowIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onChangeSettings: (settings: Partial<Settings>) => void;
  onSelectDirectory: () => void;
  onSelectAirflowDagsDirectory: () => void;
  onClearAirflowDags: () => void;
  airflowDagCount: number | null;
  airflowScanning: boolean;
  updateStatus: UpdateStatus;
  appVersion: string;
  onCheckForUpdate: () => void;
  onApplyUpdate: () => void;
  onOpenReleaseUrl: (url: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  onSelectDirectory,
  onSelectAirflowDagsDirectory,
  onClearAirflowDags,
  airflowDagCount,
  airflowScanning,
  updateStatus,
  appVersion,
  onCheckForUpdate,
  onApplyUpdate,
  onOpenReleaseUrl,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw] max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Project Directory */}
        <div className="mb-6">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <DbtIcon className="w-4 h-4" />
            dbt Project Directory
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg truncate">
              {settings.projectPath || 'No directory selected'}
            </div>
            <button
              onClick={onSelectDirectory}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Airflow DAGs Directory */}
        <div className="mb-6">
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <AirflowIcon className="w-4 h-4" />
            Airflow DAGs Directory
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 leading-none">
              Beta
            </span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Point to a folder containing Airflow DAG files to see which DAGs invoke each model.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg truncate">
              {settings.airflowDagsPath || 'No directory selected'}
            </div>
            <button
              onClick={onSelectAirflowDagsDirectory}
              disabled={!settings.projectPath || airflowScanning}
              className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {airflowScanning ? 'Scanning...' : 'Browse'}
            </button>
          </div>
          {!settings.projectPath && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Select a dbt project directory first.
            </p>
          )}
          {settings.airflowDagsPath && airflowDagCount !== null && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-green-600 dark:text-green-400">
                {airflowDagCount} model{airflowDagCount !== 1 ? 's' : ''} mapped to Airflow DAGs
              </p>
              <button
                onClick={onClearAirflowDags}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          {airflowScanning && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Scanning DAGs and resolving selectors...
              </p>
            </div>
          )}
        </div>

        {/* Edge Animations Toggle */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Edge Animations on Hover
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Highlight and animate connected edges when hovering a node. Disable if you experience lag.
          </p>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${!settings.edgeAnimations ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>
              Off
            </span>
            <button
              onClick={() => onChangeSettings({ edgeAnimations: !settings.edgeAnimations })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.edgeAnimations ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.edgeAnimations ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm ${settings.edgeAnimations ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>
              On
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* App Updates Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            App Updates
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Current version: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">v{appVersion}</span>
          </p>

          {/* Auto-Update Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Auto-update</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Automatically download and install updates on launch
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onChangeSettings({ autoUpdate: !settings.autoUpdate })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.autoUpdate ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.autoUpdate ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Update Status Display */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3.5 py-3">
            {updateStatus.state === 'idle' && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Click to check for updates
                </p>
                <button
                  onClick={onCheckForUpdate}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                >
                  Check now
                </button>
              </div>
            )}

            {updateStatus.state === 'checking' && (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-xs text-gray-600 dark:text-gray-400">Checking for updates...</p>
              </div>
            )}

            {updateStatus.state === 'up-to-date' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    Almanac is up to date
                  </p>
                </div>
                <button
                  onClick={onCheckForUpdate}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Recheck
                </button>
              </div>
            )}

            {updateStatus.state === 'available' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    v{updateStatus.info.version} is available
                  </p>
                  <button
                    onClick={onApplyUpdate}
                    className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Update now
                  </button>
                </div>
                {updateStatus.info.releaseNotes && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Release notes:</p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
                      {updateStatus.info.releaseNotes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {updateStatus.state === 'downloading' && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className="text-xs text-gray-600 dark:text-gray-400">Downloading update...</p>
                </div>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${updateStatus.progress}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1 text-right">
                  {updateStatus.progress}%
                </p>
              </div>
            )}

            {updateStatus.state === 'ready' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-400">
                      v{updateStatus.info.version} installed
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Restart the app to use the new version
                    </p>
                  </div>
                </div>
              </div>
            )}

            {updateStatus.state === 'error' && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">
                    Update failed
                  </p>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                  {updateStatus.message}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onCheckForUpdate}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                  >
                    Retry
                  </button>
                  {updateStatus.htmlUrl && (
                    <button
                      onClick={() => onOpenReleaseUrl(updateStatus.htmlUrl!)}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                      Download manually &rarr;
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
