/**
 * Single-column mobile layout.
 *
 * The desktop DockLayout (flexlayout-react) renders three side-by-side
 * columns, which collapse into unusable slivers on a phone. On narrow
 * viewports App swaps in this shell instead: a top bar with a dropdown
 * that picks ONE panel to show full-screen at a time. It reuses the exact
 * same panel components as the dock layout — only the chrome differs.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@pixsim7/shared.ui'

import { ServicesPanel, ServiceInfoPanel } from './DockLayout'
import { LogViewer } from './LogViewer'
import { DbLogViewer } from './DbLogViewer'
import { ToolsPage } from './ToolsPage'
import { TracePanel } from './TracePanel'
import { DebugPanel } from './DebugPanel'
import { WorkersPanel } from './WorkersPanel'
import { AccountPanel } from './AccountPanel'
import { StatusBar } from './StatusBar'
import { useServicesStore } from '../stores/services'

type PanelId =
  | 'services' | 'console' | 'db-logs' | 'service-detail'
  | 'tools' | 'workers' | 'debug' | 'trace' | 'account'

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'console', label: 'Console' },
  { id: 'db-logs', label: 'DB Logs' },
  { id: 'service-detail', label: 'Service Detail' },
  { id: 'tools', label: 'Tools' },
  { id: 'workers', label: 'Workers' },
  { id: 'debug', label: 'Debug' },
  { id: 'trace', label: 'Trace' },
  { id: 'account', label: 'Account' },
]

export function MobileLayout({ onIdentityCreated }: { onIdentityCreated?: () => void }) {
  const [active, setActive] = useState<PanelId>('services')
  const [traceTarget, setTraceTarget] = useState<{ fieldName: string; fieldValue: string } | null>(null)

  // A ServiceCard tapping "details" should jump to the Service Detail panel.
  useEffect(() => {
    useServicesStore.getState().setFocusServiceTab(() => setActive('service-detail'))
    return () => { useServicesStore.getState().setFocusServiceTab(null) }
  }, [])

  // Clicking a field badge in either log viewer opens the Trace panel for it.
  const handleFieldClick = useCallback((fieldName: string, fieldValue: string) => {
    setTraceTarget({ fieldName, fieldValue })
    setActive('trace')
  }, [])

  const renderPanel = () => {
    switch (active) {
      case 'services':
        return <ServicesPanel onServiceOpen={() => setActive('service-detail')} />
      case 'console':
        return <LogViewer onFieldClick={handleFieldClick} />
      case 'db-logs':
        return <DbLogViewer onFieldClick={handleFieldClick} />
      case 'service-detail':
        return <ServiceInfoPanel />
      case 'tools':
        return <ToolsPage />
      case 'workers':
        return <WorkersPanel />
      case 'debug':
        return <DebugPanel />
      case 'trace':
        return traceTarget ? (
          <TracePanel fieldName={traceTarget.fieldName} fieldValue={traceTarget.fieldValue} onClose={() => setTraceTarget(null)} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-[11px] px-6 text-center">
            Tap a field badge in Console or DB Logs to trace it.
          </div>
        )
      case 'account':
        return <AccountPanel onIdentityCreated={onIdentityCreated} />
      default:
        return null
    }
  }

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      {/* Top bar: panel picker */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <select
          value={active}
          onChange={(e) => setActive(e.target.value as PanelId)}
          className="flex-1 bg-surface-secondary border border-border rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-cyan-700"
          aria-label="Select panel"
        >
          {PANELS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => window.location.reload()}
          className="text-gray-500 hover:text-gray-300 shrink-0"
          title="Reload the launcher UI"
        >
          Refresh
        </Button>
      </div>

      {/* Active panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderPanel()}
      </div>

      {/* Footer status bar */}
      <div className="flex items-center border-t border-border shrink-0 h-7 bg-surface-secondary">
        <StatusBar onShowSetup={() => setActive('account')} />
      </div>
    </div>
  )
}
