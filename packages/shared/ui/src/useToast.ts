import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'cube-message';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  title?: string;
  description?: string;
  icon?: string;
  fromCubeId?: string;
  toCubeId?: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let toastIdCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`;
    const newToast: Toast = { ...toast, id };

    set((s) => ({
      toasts: [...s.toasts, newToast],
    }));

    // Auto-remove after duration (default 4s)
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({
          toasts: s.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
  clearAll: () => set({ toasts: [] }),
}));

export interface ToastOptions {
  title?: string;
  description?: string;
  message?: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

/**
 * Hook for easy toast usage
 * Supports both object-based and string-based APIs
 */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  // Function-style API: toast({ title, description, variant })
  const toast = (options: ToastOptions) => {
    const message = options.description || options.message || options.title || '';
    const type = options.variant || 'info';
    return addToast({
      message,
      type,
      duration: options.duration,
      title: options.title,
      description: options.description,
    });
  };

  // Method-style API: toast.success(message)
  toast.success = (message: string, duration?: number) =>
    addToast({ message, type: 'success', duration });
  toast.error = (message: string, duration?: number) =>
    addToast({ message, type: 'error', duration });
  toast.info = (message: string, duration?: number) =>
    addToast({ message, type: 'info', duration });
  toast.warning = (message: string, duration?: number) =>
    addToast({ message, type: 'warning', duration });

  return toast;
}
