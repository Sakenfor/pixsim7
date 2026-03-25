import { useEffect, useState } from 'react'
import { useServicesStore } from './stores/services'
import { useWsStore } from './stores/websocket'
import { ServiceCard } from './components/ServiceCard'
import { LogViewer } from './components/LogViewer'
import { DbLogViewer } from './components/DbLogViewer'
import { ToolsPage } from './components/ToolsPage'
import { StatusBar } from './components/StatusBar'

type Tab = 'console' | 'db-logs' | 'tools'

export function App() {
  const {
    services, selectedKey, loading, error,
    loadServices, selectService,
    startService, stopService, restartService,
    startAll, stopAll,
  } = useServicesStore()
  const { connect } = useWsStore()
  const [activeTab, setActiveTab] = useState<Tab>('console')

  const connected = useWsStore((s) => s.connected)

  useEffect(() => {
    loadServices()
    connect()
    // Poll services until WebSocket is connected (covers startup race)
    const poll = setInterval(() => loadServices(), 3000)
    return () => clearInterval(poll)
  }, [])

  // Stop polling once WebSocket is connected and doing real-time updates
  useEffect(() => {
    if (connected) loadServices() // one final fresh fetch
  }, [connected])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'console', label: 'Console' },
    { id: 'db-logs', label: 'DB Logs' },
    { id: 'tools', label: 'Tools' },
  ]

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: service cards */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h1 className="text-sm font-bold text-gray-200">Services</h1>
            <div className="flex gap-1">
              <button onClick={startAll} className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-700 hover:bg-green-600 text-white transition-colors" title="Start All">Start All</button>
              <button onClick={stopAll} className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-700 hover:bg-red-600 text-white transition-colors" title="Stop All">Stop All</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
            {loading && services.length === 0 && (
              <div className="text-sm text-gray-500 px-2 py-4">Loading services...</div>
            )}
            {services.map((svc) => (
              <ServiceCard
                key={svc.key}
                service={svc}
                selected={svc.key === selectedKey}
                onSelect={() => selectService(svc.key)}
                onStart={() => startService(svc.key)}
                onStop={() => stopService(svc.key)}
                onRestart={() => restartService(svc.key)}
              />
            ))}
          </div>
        </div>

        {/* Right panel: tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="flex border-b border-border shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab === 'console' && <LogViewer />}
            {activeTab === 'db-logs' && <DbLogViewer />}
            {activeTab === 'tools' && <ToolsPage />}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1.5 bg-red-900/40 text-red-300 text-xs border-t border-red-800/50">{error}</div>
      )}

      <StatusBar />
    </div>
  )
}
