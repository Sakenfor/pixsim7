import { create } from 'zustand'
import * as api from '../api/client'

interface LogsStore {
  lines: string[]
  loading: boolean
  fetchLogs: (key: string) => Promise<void>
  clearLogs: (key: string) => Promise<void>
  appendLine: (line: string) => void
}

const MAX_LINES = 500

export const useLogsStore = create<LogsStore>((set) => ({
  lines: [],
  loading: false,

  fetchLogs: async (key) => {
    set({ loading: true })
    try {
      const res = await api.getLogs(key, 300)
      set({ lines: res.lines, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  clearLogs: async (key) => {
    try {
      await api.clearLogs(key)
      set({ lines: [] })
    } catch {}
  },

  appendLine: (line) =>
    set((s) => {
      const next = [...s.lines, line]
      return { lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next }
    }),
}))
