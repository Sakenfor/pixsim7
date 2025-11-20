import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Toast as ToastType } from './useToast';
import { useToastStore } from './useToast';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const TOAST_COLORS = {
  success: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
  error: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
  info: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  warning: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  'cube-message': 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false);

  // Handle exit animation
  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  // Auto-dismiss on duration
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => handleDismiss(), toast.duration - 200);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex items-start gap-2 p-3 rounded border shadow-lg text-sm transition-all duration-200 min-w-[250px] max-w-md',
        TOAST_COLORS[toast.type],
        exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      )}
    >
      {/* Icon */}
      {toast.icon && (
        <span className="text-lg flex-shrink-0" aria-hidden="true">
          {toast.icon}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        {toast.title && (
          <div className="font-semibold mb-1">
            {toast.title}
          </div>
        )}

        {/* Message */}
        <div className="break-words">
          {toast.message}
        </div>

        {/* Cube message metadata */}
        {toast.type === 'cube-message' && toast.fromCubeId && toast.toCubeId && (
          <div className="text-xs opacity-70 mt-1 font-mono">
            {toast.fromCubeId} → {toast.toCubeId}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Toast notification container.
 * Place this component at the root of your app to display toast notifications.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  );
}
