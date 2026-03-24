import { create } from 'zustand'
import { useServicesStore } from './services'

interface WsStore {
  connected: boolean
  connect: () => void
  disconnect: () => void
}

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// WebSocket URL — in dev Vite proxies /events/ws, in prod same origin
function getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/events/ws`
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,

  connect: () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    const url = getWsUrl()
    ws = new WebSocket(url)

    ws.onopen = () => {
      set({ connected: true })
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        const { patchServiceHealth, patchServiceStatus } = useServicesStore.getState()

        if (msg.event_type === 'health.update') {
          patchServiceHealth(msg.data.service_key, msg.data.status)
        } else if (msg.event_type === 'process.started') {
          patchServiceStatus(msg.data.service_key, 'running')
        } else if (msg.event_type === 'process.stopped') {
          patchServiceStatus(msg.data.service_key, 'stopped')
        }
      } catch {}
    }

    ws.onclose = () => {
      set({ connected: false })
      reconnectTimer = setTimeout(() => useWsStore.getState().connect(), 3000)
    }

    ws.onerror = () => set({ connected: false })
  },

  disconnect: () => {
    ws?.close()
    ws = null
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    set({ connected: false })
  },
}))
