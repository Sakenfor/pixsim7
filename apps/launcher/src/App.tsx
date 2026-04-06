import { useCallback, useEffect, useState } from 'react'
import { useServicesStore } from './stores/services'
import { useWsStore } from './stores/websocket'
import { DockLayout } from './components/DockLayout'
import { SetupPage } from './components/SetupPage'
import { getIdentity } from './api/client'

export function App() {
  const { loadServices } = useServicesStore()
  const { connect } = useWsStore()
  const connected = useWsStore((s) => s.connected)

  const [identityChecked, setIdentityChecked] = useState(false)
  const [identityExists, setIdentityExists] = useState(false)

  // Check identity on mount — retry until API is reachable
  useEffect(() => {
    let cancelled = false
    async function check() {
      while (!cancelled) {
        try {
          const status = await getIdentity()
          if (!cancelled) {
            setIdentityExists(status.exists)
            setIdentityChecked(true)
          }
          return
        } catch {
          // API not ready yet — retry in 500ms
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // Start services polling only after identity is confirmed
  useEffect(() => {
    if (!identityExists) return
    loadServices()
    connect()
    const poll = setInterval(() => loadServices(), 3000)
    return () => clearInterval(poll)
  }, [identityExists])

  useEffect(() => {
    if (connected) loadServices()
  }, [connected])

  const handleIdentityCreated = useCallback(() => {
    setIdentityExists(true)
  }, [])

  // Waiting for API — show minimal loading
  if (!identityChecked) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-sm text-gray-600 animate-pulse">Connecting to launcher...</div>
      </div>
    )
  }

  // No identity — full-screen setup gate
  if (!identityExists) {
    return <SetupPage onComplete={handleIdentityCreated} />
  }

  return <DockLayout onIdentityCreated={handleIdentityCreated} />
}
