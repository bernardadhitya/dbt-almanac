import { useState, useCallback } from 'react';

interface CopyButtonProps {
  /** The text to copy to clipboard */
  text: string;
  /** Optional label for the toast (e.g. "Model name", "DAG name") */
  label?: string;
}

/**
 * Small clipboard icon button.  Copies text on click, briefly shows a
 * checkmark, and dispatches a custom event so CopiedToast can show a
 * floating notification.
 */
export function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't trigger parent click handlers
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);

        // Dispatch event for the global CopiedToast listener
        window.dispatchEvent(
          new CustomEvent('almanac:copied', {
            detail: { text, label: label || 'Name' },
          }),
        );
      });
    },
    [text, label],
  );

  return (
    <button
      onClick={handleClick}
      className="shrink-0 p-0.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-600/40 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors cursor-pointer"
      title={`Copy ${label?.toLowerCase() || 'name'}`}
    >
      {copied ? (
        <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2} />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2} />
        </svg>
      )}
    </button>
  );
}
