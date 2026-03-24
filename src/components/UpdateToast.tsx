import { useState, useEffect, useRef } from 'react';
import { UpdateInfo } from '../types';

const AUTO_DISMISS_MS = 10_000;

interface UpdateToastProps {
  info: UpdateInfo | null;
  onViewDetails: () => void;
}

/**
 * A toast notification that slides in from the top-right when a new app
 * version is available.  Shows version number and a button to open Settings.
 * Auto-dismisses after 10 seconds.
 */
export function UpdateToast({ info, onViewDetails }: UpdateToastProps) {
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownVersionRef = useRef<string | null>(null);

  useEffect(() => {
    // Only trigger once per version
    if (info && info.version !== shownVersionRef.current) {
      shownVersionRef.current = info.version;

      if (timerRef.current) clearTimeout(timerRef.current);

      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });

      timerRef.current = setTimeout(() => {
        setShow(false);
        setTimeout(() => setVisible(false), 300);
        timerRef.current = null;
      }, AUTO_DISMISS_MS);
    }
  }, [info]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const dismiss = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setShow(false);
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible || !info) return null;

  return (
    <div
      className={`
        absolute top-16 right-4 z-50 max-w-xs
        transition-all duration-300 ease-out
        ${show
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none'}
      `}
    >
      <div className="bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg px-3.5 py-2.5 flex items-start gap-2.5">
        {/* Download icon */}
        <svg
          className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
          />
        </svg>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            Almanac v{info.version} available
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5 leading-snug">
            A new version is ready to install.
          </p>
          <button
            onClick={() => { dismiss(); onViewDetails(); }}
            className="mt-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
          >
            View in Settings &rarr;
          </button>
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="shrink-0 mt-0.5 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
