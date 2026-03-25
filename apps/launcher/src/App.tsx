import { useEffect, useState, useCallback } from 'react'
import { useServicesStore } from './stores/services'
import { useWsStore } from './stores/websocket'
import { ServiceCard } from './components/ServiceCard'
import { LogViewer } from './components/LogViewer'
import { DbLogViewer } from './components/DbLogViewer'
import { RightSidebar } from './components/RightSidebar'
import { StatusBar } from './components/StatusBar'

type Tab = 'console' | 'db-logs'

interface TraceTarget {
  fieldName: string
  fieldValue: string
}

export function App() {
  const {
    services, selectedKey, loading, error,
    loadServices, selectService,
    startService, stopService, restartService,
    startAll, stopAll,
  } = useServicesStore()
  const { connect } = useWsStore()
  const connected = useWsStore((s) => s.connected)
  const [activeTab, setActiveTab] = useState<Tab>('console')
  const [traceTarget, setTraceTarget] = useState<TraceTarget | null>(null)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)

  useEffect(() => {
    loadServices()
    connect()
    const poll = setInterval(() => loadServices(), 3000)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    if (connected) loadServices()
  }, [connected])

  // When a clickable field is clicked in any log viewer, open trace in right sidebar
  const handleFieldClick = useCallback((fieldName: string, fieldValue: string) => {
    setTraceTarget({ fieldName, fieldValue })
    setRightSidebarOpen(true)
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'console', label: 'Console' },
    { id: 'db-logs', label: 'DB Logs' },
  ]

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: service cards */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <h1 className="text-xs font-bold text-gray-200">Services</h1>
            <div className="flex gap-1">
              <button onClick={startAll} className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-green-700 hover:bg-green-600 text-white">Start All</button>
              <button onClick={stopAll} className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-red-700 hover:bg-red-600 text-white">Stop All</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
            {loading && services.length === 0 && (
              <div className="text-[11px] text-gray-500 px-2 py-4">Loading...</div>
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

        {/* Center: log viewer with tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center border-b border-border shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className={`px-2 py-1 text-[10px] mr-2 rounded ${rightSidebarOpen ? 'text-blue-400 bg-blue-900/20' : 'text-gray-500 hover:text-gray-300'}`}
              title="Toggle tools sidebar"
            >
              {rightSidebarOpen ? 'Tools ▸' : '◂ Tools'}
            </button>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab === 'console' && <LogViewer onFieldClick={handleFieldClick} />}
            {activeTab === 'db-logs' && <DbLogViewer onFieldClick={handleFieldClick} />}
          </div>
        </div>

        {/* Right sidebar: trace + tools */}
        {rightSidebarOpen && (
          <div className="w-80 shrink-0">
            <RightSidebar
              traceTarget={traceTarget}
              onClearTrace={() => setTraceTarget(null)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-1 bg-red-900/40 text-red-300 text-xs border-t border-red-800/50">{error}</div>
      )}
      <StatusBar />
    </div>
  )
}
