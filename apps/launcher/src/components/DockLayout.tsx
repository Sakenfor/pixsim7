/**
 * Dockable panel layout using flexlayout-react.
 *
 * Panels: Services, Console, DB Logs, Codegen, Migrations, Buildables, Settings, Trace.
 * Users can drag tabs, split panes, resize, and rearrange.
 */

import { useCallback, useRef, useState } from 'react'
import { Layout, Model, Actions, IJsonModel, TabNode } from 'flexlayout-react'
import 'flexlayout-react/style/dark.css'

import { ServiceCard } from './ServiceCard'
import { LogViewer } from './LogViewer'
import { DbLogViewer } from './DbLogViewer'
import { ToolsPage } from './ToolsPage'
import { TracePanel } from './TracePanel'
import { StatusBar } from './StatusBar'
import { useServicesStore } from '../stores/services'

// ── Panel components registry ──

function ServicesPanel() {
  const {
    services, selectedKey, loading,
    selectService, startService, stopService, restartService,
    startAll, stopAll,
  } = useServicesStore()

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">Services</span>
        <div className="flex gap-1">
          <button onClick={startAll} className="px-1.5 py-0.5 text-[9px] rounded bg-green-700 hover:bg-green-600 text-white">All</button>
          <button onClick={stopAll} className="px-1.5 py-0.5 text-[9px] rounded bg-red-700 hover:bg-red-600 text-white">Stop</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {loading && services.length === 0 && <div className="text-[11px] text-gray-500 p-2">Loading...</div>}
        {services.map((svc) => (
          <ServiceCard key={svc.key} service={svc} selected={svc.key === selectedKey}
            onSelect={() => selectService(svc.key)}
            onStart={() => startService(svc.key)}
            onStop={() => stopService(svc.key)}
            onRestart={() => restartService(svc.key)} />
        ))}
      </div>
    </div>
  )
}

function ConsolePanel({ onFieldClick }: { onFieldClick?: (n: string, v: string) => void }) {
  return <LogViewer onFieldClick={onFieldClick} />
}

function DbLogsPanel({ onFieldClick }: { onFieldClick?: (n: string, v: string) => void }) {
  return <DbLogViewer onFieldClick={onFieldClick} />
}

// ── Default layout ──

const DEFAULT_LAYOUT: IJsonModel = {
  global: {
    tabEnableClose: false,
    tabSetEnableMaximize: true,
    tabSetEnableDrop: true,
    tabSetEnableDrag: true,
    tabSetEnableDivide: true,
    splitterSize: 4,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset',
        weight: 20,
        children: [
          { type: 'tab', name: 'Services', component: 'services' },
        ],
      },
      {
        type: 'tabset',
        weight: 55,
        children: [
          { type: 'tab', name: 'Console', component: 'console' },
          { type: 'tab', name: 'DB Logs', component: 'db-logs' },
        ],
      },
      {
        type: 'tabset',
        weight: 25,
        children: [
          { type: 'tab', name: 'Tools', component: 'tools' },
          { type: 'tab', name: 'Trace', component: 'trace' },
        ],
      },
    ],
  },
}

// Persistence
const LAYOUT_KEY = 'pixsim7-launcher-layout'

function loadSavedLayout(): IJsonModel {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_LAYOUT
}

// ── Main layout component ──

export function DockLayout() {
  const modelRef = useRef(Model.fromJson(loadSavedLayout()))
  const [traceTarget, setTraceTarget] = useState<{ fieldName: string; fieldValue: string } | null>(null)

  const handleFieldClick = useCallback((fieldName: string, fieldValue: string) => {
    setTraceTarget({ fieldName, fieldValue })
    // Try to select the Trace tab
    try {
      const model = modelRef.current
      model.doAction(Actions.selectTab('trace-tab'))
    } catch {}
  }, [])

  const factory = useCallback((node: TabNode) => {
    const component = node.getComponent()
    switch (component) {
      case 'services':
        return <ServicesPanel />
      case 'console':
        return <ConsolePanel onFieldClick={handleFieldClick} />
      case 'db-logs':
        return <DbLogsPanel onFieldClick={handleFieldClick} />
      case 'tools':
        return <ToolsPage />
      case 'trace':
        return traceTarget ? (
          <TracePanel fieldName={traceTarget.fieldName} fieldValue={traceTarget.fieldValue} onClose={() => setTraceTarget(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-[11px]">
            Click a field badge in logs to trace
          </div>
        )
      default:
        return <div className="p-4 text-gray-500">Unknown panel: {component}</div>
    }
  }, [handleFieldClick, traceTarget])

  const handleModelChange = useCallback((model: Model) => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(model.toJson()))
    } catch {}
  }, [])

  const resetLayout = useCallback(() => {
    localStorage.removeItem(LAYOUT_KEY)
    modelRef.current = Model.fromJson(DEFAULT_LAYOUT)
    // Force re-render
    setTraceTarget(null)
    window.location.reload()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      <div className="flex-1 relative">
        <Layout
          model={modelRef.current}
          factory={factory}
          onModelChange={handleModelChange}
        />
      </div>
      <div className="flex items-center border-t border-border">
        <StatusBar />
        <button
          onClick={resetLayout}
          className="px-2 py-0.5 text-[9px] text-gray-500 hover:text-gray-300 mr-2"
          title="Reset panel layout to default"
        >
          Reset Layout
        </button>
      </div>
    </div>
  )
}
