import { create } from 'zustand';

export type AsyncTaskStatus = 'idle' | 'running' | 'success' | 'error';

export interface AsyncTaskState {
  status: AsyncTaskStatus;
  message?: string;
  startedAt?: number;
}

interface AsyncTaskStore {
  byTask: Record<string, AsyncTaskState>;
  setStatus: (taskId: string, state: AsyncTaskState) => void;
  clear: (taskId: string) => void;
  clearAll: (prefix?: string) => void;
}

export const useAsyncTaskStore = create<AsyncTaskStore>((set) => ({
  byTask: {},
  setStatus: (taskId, state) =>
    set((s) => ({ byTask: { ...s.byTask, [taskId]: state } })),
  clear: (taskId) =>
    set((s) => {
      if (!(taskId in s.byTask)) return s;
      const { [taskId]: _, ...rest } = s.byTask;
      return { byTask: rest };
    }),
  clearAll: (prefix) =>
    set((s) => {
      if (!prefix) return { byTask: {} };
      const next: Record<string, AsyncTaskState> = {};
      for (const [k, v] of Object.entries(s.byTask)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return { byTask: next };
    }),
}));
