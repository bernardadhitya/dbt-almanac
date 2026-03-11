import { Settings } from '../types';
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
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[480px] max-w-[90vw] p-6">
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

        {/* Theme Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Theme
          </label>
          <div className="flex items-center gap-3">
            <span className={`text-sm ${settings.theme === 'light' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>
              Light
            </span>
            <button
              onClick={() => onChangeSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm ${settings.theme === 'dark' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>
              Dark
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
