import { useEffect, useState, useRef } from 'react';

interface ToastEntry {
  id: number;
  text: string;
  label: string;
}

let nextId = 0;

/**
 * Global listener for `almanac:copied` custom events.
 * Shows a brief floating toast at the bottom-center confirming the copy.
 * Auto-dismisses after 2 seconds.  Stacks if multiple copies happen fast.
 */
export function CopiedToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (e: Event) => {
      const { text, label } = (e as CustomEvent).detail;
      const id = nextId++;

      setToasts((prev) => [...prev, { id, text, label }]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 2000);

      timersRef.current.set(id, timer);
    };

    window.addEventListener('almanac:copied', handler);
    return () => {
      window.removeEventListener('almanac:copied', handler);
      // Cleanup all pending timers
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-1.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-fade-in-up bg-green-50 dark:bg-green-950/80 border border-green-200 dark:border-green-800 text-xs font-medium px-3.5 py-2 rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto"
        >
          <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-800 dark:text-green-200 font-semibold">
            {toast.label} copied
          </span>
        </div>
      ))}
    </div>
  );
}
