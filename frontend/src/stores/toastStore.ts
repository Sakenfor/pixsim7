import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
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

/**
 * Hook for easy toast usage
 */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  return {
    success: (message: string, duration?: number) =>
      addToast({ message, type: 'success', duration }),
    error: (message: string, duration?: number) =>
      addToast({ message, type: 'error', duration }),
    info: (message: string, duration?: number) =>
      addToast({ message, type: 'info', duration }),
    warning: (message: string, duration?: number) =>
      addToast({ message, type: 'warning', duration }),
  };
}
