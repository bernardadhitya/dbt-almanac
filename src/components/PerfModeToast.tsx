import { useEffect, useRef, useState } from 'react';

const AUTO_DISMISS_MS = 5_000;

interface PerfModeToastProps {
  /** True when the graph is large enough to trigger performance optimizations */
  active: boolean;
}

/**
 * A small, non-intrusive toast that slides in from the top-right to inform
 * the user that performance mode has kicked in.  Auto-dismisses after 5 s.
 */
export function PerfModeToast({ active }: PerfModeToastProps) {
  // `visible` drives the mount/unmount; `show` drives the enter/exit animation
  const [visible, setVisible] = useState(false);
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveRef = useRef(false);

  useEffect(() => {
    // Only trigger on rising edge (false → true)
    if (active && !prevActiveRef.current) {
      // Clear any pending dismiss from a previous appearance
      if (timerRef.current) clearTimeout(timerRef.current);

      setVisible(true);
      // Small delay so the DOM mounts before the CSS transition starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });

      timerRef.current = setTimeout(() => {
        setShow(false);
        // Wait for exit animation before unmounting
        setTimeout(() => setVisible(false), 300);
        timerRef.current = null;
      }, AUTO_DISMISS_MS);
    }

    // If perf mode deactivates while toast is showing, dismiss early
    if (!active && prevActiveRef.current && visible) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setShow(false);
      setTimeout(() => setVisible(false), 300);
    }

    prevActiveRef.current = active;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`
        absolute top-4 right-4 z-50 max-w-xs
        transition-all duration-300 ease-out
        ${show
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none'}
      `}
    >
      <div className="bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-lg shadow-lg px-3.5 py-2.5 flex items-start gap-2.5">
        {/* Bolt icon */}
        <svg
          className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Large graph detected
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 leading-snug">
            DAG group clustering and drag interactions
            are simplified for smoother rendering.
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
            setShow(false);
            setTimeout(() => setVisible(false), 300);
          }}
          className="shrink-0 mt-0.5 text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
