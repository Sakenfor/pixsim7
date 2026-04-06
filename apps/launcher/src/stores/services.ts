import { create } from 'zustand'
import * as api from '../api/client'
import type { ServiceState } from '../api/client'

interface ServicesStore {
  services: ServiceState[]
  selectedKey: string | null
  selectedSection: string | null
  loading: boolean
  error: string | null

  loadServices: () => Promise<void>
  refreshService: (key: string) => Promise<void>
  selectService: (key: string) => void
  selectSection: (section: string | null) => void
  startService: (key: string) => Promise<void>
  stopService: (key: string) => Promise<void>
  restartService: (key: string) => Promise<void>
  startAll: () => Promise<void>
  stopAll: () => Promise<void>

  // Called by WebSocket store to patch real-time updates
  patchServiceHealth: (key: string, health: string) => void
  patchServiceStatus: (key: string, status: string) => void
}

export const useServicesStore = create<ServicesStore>((set, get) => ({
  services: [],
  selectedKey: null,
  selectedSection: null,
  loading: false,
  error: null,

  loadServices: async () => {
    set({ loading: true, error: null })
    try {
      const res = await api.getServices()
      set({ services: res.services, loading: false })
      // Auto-select first if none selected
      if (!get().selectedKey && res.services.length > 0) {
        set({ selectedKey: res.services[0].key })
      }
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  refreshService: async (key) => {
    try {
      const svc = await api.getService(key)
      set((s) => ({
        services: s.services.map((x) => (x.key === key ? svc : x)),
      }))
    } catch {}
  },

  selectService: (key) => set({ selectedKey: key, selectedSection: null }),

  selectSection: (section) => set({ selectedSection: section }),

  startService: async (key) => {
    try {
      await api.startService(key)
      await get().refreshService(key)
    } catch (e: any) {
      set({ error: `Failed to start ${key}: ${e.message}` })
    }
  },

  stopService: async (key) => {
    try {
      await api.stopService(key)
      await get().refreshService(key)
    } catch (e: any) {
      set({ error: `Failed to stop ${key}: ${e.message}` })
    }
  },

  restartService: async (key) => {
    try {
      await api.restartService(key)
      await get().refreshService(key)
    } catch (e: any) {
      set({ error: `Failed to restart ${key}: ${e.message}` })
    }
  },

  startAll: async () => {
    try {
      await api.startAllServices()
      await get().loadServices()
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  stopAll: async () => {
    try {
      await api.stopAllServices()
      await get().loadServices()
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  patchServiceHealth: (key, health) =>
    set((s) => ({
      services: s.services.map((x) =>
        x.key === key ? { ...x, health: health as ServiceState['health'] } : x,
      ),
    })),

  patchServiceStatus: (key, status) =>
    set((s) => ({
      services: s.services.map((x) =>
        x.key === key ? { ...x, status: status as ServiceState['status'] } : x,
      ),
    })),
}))
