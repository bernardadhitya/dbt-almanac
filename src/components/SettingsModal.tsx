import { Settings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onChangeSettings: (settings: Partial<Settings>) => void;
  onSelectDirectory: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  onSelectDirectory,
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
