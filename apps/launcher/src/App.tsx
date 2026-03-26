import { useEffect } from 'react'
import { useServicesStore } from './stores/services'
import { useWsStore } from './stores/websocket'
import { DockLayout } from './components/DockLayout'

export function App() {
  const { loadServices } = useServicesStore()
  const { connect } = useWsStore()
  const connected = useWsStore((s) => s.connected)

  useEffect(() => {
    loadServices()
    connect()
    const poll = setInterval(() => loadServices(), 3000)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    if (connected) loadServices()
  }, [connected])

  return <DockLayout />
}
