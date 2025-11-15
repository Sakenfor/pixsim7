import { create } from 'zustand';
import type { ToastProps, ToastType } from './Toast';

interface ToastState {
  toasts: ToastProps[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: ToastProps = {
      id,
      message,
      type,
      duration,
      onClose: () => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearAll: () => set({ toasts: [] }),
}));

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);

  return {
    success: (message: string, duration?: number) => addToast(message, 'success', duration),
    error: (message: string, duration?: number) => addToast(message, 'error', duration),
    warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
    info: (message: string, duration?: number) => addToast(message, 'info', duration),
    toast: addToast,
  };
}
