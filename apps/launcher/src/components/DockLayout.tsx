/**
 * Dockable panel layout using flexlayout-react.
 *
 * Panels: Services, Console, DB Logs, Codegen, Migrations, Buildables, Settings, Trace.
 * Users can drag tabs, split panes, resize, and rearrange.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layout, Model, Actions, IJsonModel, TabNode } from 'flexlayout-react'
import { Button } from '@pixsim7/shared.ui'
import 'flexlayout-react/style/dark.css'

import { ServiceCard } from './ServiceCard'
import { LogViewer } from './LogViewer'
import { DbLogViewer } from './DbLogViewer'
import { ToolsPage } from './ToolsPage'
import { TracePanel } from './TracePanel'
import { DebugPanel } from './DebugPanel'
import { StatusBar } from './StatusBar'
import { ServiceSettingsPanel } from './ServiceSettingsPanel'
import { useServicesStore } from '../stores/services'
import { checkWindowAvailable, applyHookConfig } from '../api/client'
import type { ServiceState } from '../api/client'

// ── Panel components registry ──

const CATEGORY_ORDER = ['core', 'apps', 'services', 'launcher']
const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  apps: 'Apps',
  services: 'Services',
  launcher: 'Launcher',
}

function groupByCategory(services: ServiceState[]): { category: string; label: string; services: ServiceState[] }[] {
  const groups = new Map<string, ServiceState[]>()
  for (const svc of services) {
    const cat = svc.category || 'core'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(svc)
  }
  return CATEGORY_ORDER
    .filter((cat) => groups.has(cat))
    .map((cat) => ({ category: cat, label: CATEGORY_LABELS[cat] || cat, services: groups.get(cat)! }))
    // Append any categories not in CATEGORY_ORDER
    .concat(
      [...groups.entries()]
        .filter(([cat]) => !CATEGORY_ORDER.includes(cat))
        .map(([cat, svcs]) => ({ category: cat, label: CATEGORY_LABELS[cat] || cat, services: svcs }))
    )
}

function ServicesPanel() {
  const {
    services, selectedKey, loading,
    selectService, startService, stopService, restartService,
    startAll, stopAll,
  } = useServicesStore()
  const [desktopAvailable, setDesktopAvailable] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['launcher']))

  useEffect(() => {
    checkWindowAvailable().then((r) => setDesktopAvailable(r.available)).catch(() => {})
  }, [])

  const groups = useMemo(() => groupByCategory(services), [services])

  const toggleGroup = useCallback((cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">Services</span>
        <div className="flex gap-1">
          <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={startAll}>All</Button>
          <Button size="xs" variant="danger" onClick={stopAll}>Stop</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {loading && services.length === 0 && <div className="text-[11px] text-gray-500 p-2">Loading...</div>}
        {groups.map(({ category, label, services: groupServices }) => {
          const isCollapsed = collapsed.has(category)
          const runningCount = groupServices.filter((s) => s.status === 'running' || s.status === 'starting').length
          return (
            <div key={category} className="mb-1.5">
              <button
                onClick={() => toggleGroup(category)}
                className="flex items-center gap-1.5 w-full px-1 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span className={`text-[8px] transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>&#9654;</span>
                <span className="font-semibold uppercase tracking-wide">{label}</span>
                <span className="text-gray-600">{runningCount}/{groupServices.length}</span>
              </button>
              {!isCollapsed && (
                <div className="space-y-1 mt-0.5">
                  {groupServices.map((svc) => (
                    <ServiceCard key={svc.key} service={svc} services={services} selected={svc.key === selectedKey}
                      desktopAvailable={desktopAvailable}
                      onSelect={() => selectService(svc.key)}
                      onStart={() => startService(svc.key)}
                      onStop={() => stopService(svc.key)}
                      onRestart={() => restartService(svc.key)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConsolePanel({ onFieldClick }: { onFieldClick?: (n: string, v: string) => void }) {
  return <LogViewer onFieldClick={onFieldClick} />
}

function ServiceInfoPanel() {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const services = useServicesStore((s) => s.services)
  const service = services.find((s) => s.key === selectedKey)

  if (!service) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-500">Select a service</div>
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full text-xs">
      <div className="bg-surface-secondary rounded border border-border p-3 space-y-1.5">
        <div className="text-[11px] font-semibold text-gray-300 mb-2">{service.title}</div>
        <SvcInfoRow label="Key" value={service.key} />
        <SvcInfoRow label="Status" value={service.status} />
        <SvcInfoRow label="Health" value={service.health} />
        {service.pid && <SvcInfoRow label="PID" value={String(service.pid)} />}
        {service.url && <SvcInfoRow label="URL" value={service.url} mono />}
        {service.category && <SvcInfoRow label="Category" value={service.category} />}
        {service.dev_peer_of && <SvcInfoRow label="Dev peer of" value={service.dev_peer_of} />}
      </div>

      <ServiceSettingsPanel
        serviceKey={service.key}
        title={service.key === 'ai-client' ? 'Bridge & Hook Settings' : undefined}
      >
        {service.key === 'ai-client' ? (values) => <HookConfigOutput values={values} hookPort={service.extras?.hook_port as number | undefined} /> : undefined}
      </ServiceSettingsPanel>

      {service.key === 'ai-client' && !!service.extras?.bridge_status && (
        <BridgeSessionsPanel bridgeStatus={service.extras.bridge_status as Record<string, unknown>} />
      )}

      {service.last_error && (
        <div className="bg-red-900/20 rounded border border-red-800/50 p-3">
          <div className="text-[10px] text-red-400 font-medium mb-1">Last Error</div>
          <div className="text-[10px] text-red-300 font-mono select-text whitespace-pre-wrap break-words">{service.last_error}</div>
        </div>
      )}

      {!service.tool_available && service.tool_check_message && (
        <div className="bg-amber-900/20 rounded border border-amber-800/50 p-3">
          <div className="text-[10px] text-amber-400">{service.tool_check_message}</div>
        </div>
      )}
    </div>
  )
}

function SvcInfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-gray-500 w-20 shrink-0">{label}</span>
      <span className={`text-gray-300 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function HookConfigOutput({ values, hookPort }: { values: Record<string, unknown>; hookPort?: number }) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saved' | 'error'>('idle')
  const [mcpAllowed, setMcpAllowed] = useState(true)
  const hookTools = (values.hook_tools as string[] | undefined) ?? ['Bash', 'Write', 'Edit']

  const hasHooks = hookTools.length > 0
  const matcher = hookTools.join('|')
  const hookConfig = hasHooks ? JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher,
        command: 'python -m pixsim7.client.hook_pretool',
      }],
    },
  }, null, 2) : null

  const copyConfig = () => {
    navigator.clipboard.writeText(hookConfig || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const saveToClaudeSettings = () => {
    setSaved('idle')
    applyHookConfig(hookTools, mcpAllowed)
      .then((res) => {
        setSaved('saved')
        setTimeout(() => setSaved('idle'), 3000)
      })
      .catch(() => {
        setSaved('error')
        setTimeout(() => setSaved('idle'), 3000)
      })
  }

  return (
    <div className="pt-2 border-t border-gray-800 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-gray-400">Claude Code Config</span>
        {hookPort && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-900/40 text-cyan-400 border border-cyan-700/50 font-mono">
            :{hookPort}
          </span>
        )}
      </div>
      {hookConfig && (
        <pre className="text-[9px] font-mono text-gray-400 bg-gray-900/50 rounded p-2 overflow-x-auto select-text whitespace-pre leading-relaxed">
          {hookConfig}
        </pre>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-[9px] text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mcpAllowed}
            onChange={(e) => setMcpAllowed(e.target.checked)}
            className="w-3 h-3 rounded border-gray-600 accent-cyan-500"
          />
          Allow MCP tools
        </label>
        {hookConfig && (
          <button
            onClick={copyConfig}
            className="px-2 py-0.5 text-[9px] rounded border border-gray-700 text-gray-400 hover:text-cyan-400 hover:border-cyan-700 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy hook config'}
          </button>
        )}
        <button
          onClick={saveToClaudeSettings}
          className="px-2 py-0.5 text-[9px] rounded border border-gray-700 text-gray-400 hover:text-cyan-400 hover:border-cyan-700 transition-colors"
          title="Save hook config and MCP permissions to Claude Code settings"
        >
          {saved === 'saved' ? 'Saved!' : saved === 'error' ? 'Failed to save' : 'Save to Claude settings'}
        </button>
      </div>
      <div className="text-[9px] text-gray-600 leading-relaxed">
        Saves hook config to <code className="text-gray-500">~/.claude/settings.json</code> and MCP permissions to <code className="text-gray-500">settings.local.json</code>.
      </div>
    </div>
  )
}

function BridgeSessionsPanel({ bridgeStatus }: { bridgeStatus: Record<string, unknown> }) {
  const pool = bridgeStatus.pool as Record<string, unknown> | undefined
  const sessions = (pool?.sessions ?? []) as Array<Record<string, unknown>>
  const connected = bridgeStatus.connected as boolean
  const bridgeId = bridgeStatus.bridge_client_id as string | undefined
  const tasksHandled = bridgeStatus.tasks_handled as number | undefined

  return (
    <div className="bg-surface-secondary rounded border border-border p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="text-[11px] font-semibold text-gray-300">Bridge Sessions</div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
          connected ? 'bg-green-900/40 text-green-400 border border-green-700/50' : 'bg-gray-800 text-gray-500 border border-gray-700'
        }`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Bridge summary */}
      <div className="space-y-0.5 text-[10px]">
        {bridgeId && (
          <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Bridge ID</span><span className="text-gray-400 font-mono truncate">{bridgeId}</span></div>
        )}
        {tasksHandled != null && (
          <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Tasks handled</span><span className="text-gray-400">{tasksHandled}</span></div>
        )}
        {pool && (
          <div className="flex gap-2"><span className="text-gray-500 w-24 shrink-0">Pool</span><span className="text-gray-400">{String(pool.ready ?? 0)} ready / {String(pool.busy ?? 0)} busy / {String(pool.total ?? 0)} total</span></div>
        )}
      </div>

      {/* Session list */}
      {sessions.length > 0 && (
        <div className="space-y-1.5">
          {sessions.map((s, i) => {
            const state = s.state as string
            const model = s.cli_model as string | null
            const contextPct = s.context_pct as number | null
            const cost = s.cost_usd as number | null
            const msgSent = s.messages_sent as number
            const msgRecv = s.messages_received as number
            const errors = s.errors as number
            const lastActivity = s.last_activity as string | null
            const busyDetail = s.busy_detail as string | null
            const pid = s.pid as number | null

            return (
              <div key={i} className={`rounded border p-2 space-y-1 ${
                state === 'busy' ? 'border-amber-700/50 bg-amber-900/10' : 'border-gray-700/50 bg-gray-900/30'
              }`}>
                {/* Header row */}
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    state === 'ready' ? 'bg-green-400' : state === 'busy' ? 'bg-amber-400 animate-pulse' : state === 'starting' ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'
                  }`} />
                  <span className="text-[10px] text-gray-300 font-medium">{state}</span>
                  {model && <span className="text-[9px] text-gray-500 font-mono">{model}</span>}
                  {pid && <span className="text-[9px] text-gray-600">PID {pid}</span>}
                  {contextPct != null && (
                    <span className={`text-[9px] font-mono ml-auto ${contextPct > 80 ? 'text-red-400' : contextPct > 50 ? 'text-amber-400' : 'text-gray-500'}`}>
                      {contextPct}% ctx
                    </span>
                  )}
                </div>
                {/* Detail row */}
                <div className="flex items-center gap-3 text-[9px] text-gray-500">
                  <span>{msgSent}↑ {msgRecv}↓</span>
                  {errors > 0 && <span className="text-red-400">{errors} err</span>}
                  {cost != null && cost > 0 && <span>${cost.toFixed(3)}</span>}
                  {lastActivity && <span className="ml-auto">{_relativeTime(lastActivity)}</span>}
                </div>
                {/* Busy detail */}
                {state === 'busy' && busyDetail && (
                  <div className="text-[9px] text-amber-400/80 truncate">{busyDetail}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function _relativeTime(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
    return `${Math.round(ms / 3_600_000)}h ago`
  } catch { return iso }
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
          { type: 'tab', name: 'Service', component: 'service-detail' },
        ],
      },
      {
        type: 'tabset',
        weight: 25,
        children: [
          { type: 'tab', name: 'Tools', component: 'tools' },
          { type: 'tab', name: 'Debug', component: 'debug' },
          { type: 'tab', name: 'Trace', component: 'trace' },
        ],
      },
    ],
  },
}

// Persistence
const LAYOUT_KEY = 'pixsim7-launcher-layout'

/** All component IDs that should exist in the layout. */
function getDefaultComponents(): Set<string> {
  const components = new Set<string>()
  function walk(node: any) {
    if (node.component) components.add(node.component)
    for (const child of node.children ?? []) walk(child)
    for (const row of node.layout?.children ?? []) walk(row)
  }
  walk(DEFAULT_LAYOUT)
  return components
}

/** Find component IDs present in a saved layout. */
function getSavedComponents(layout: any): Set<string> {
  const components = new Set<string>()
  function walk(node: any) {
    if (node.component) components.add(node.component)
    for (const child of node.children ?? []) walk(child)
  }
  walk(layout)
  return components
}

/** Inject missing tabs into the first tabset of the saved layout. */
function injectMissingTabs(layout: IJsonModel): IJsonModel {
  const defaults = getDefaultComponents()
  const existing = getSavedComponents(layout)
  const missing = [...defaults].filter((c) => !existing.has(c))
  if (missing.length === 0) return layout

  // Find default tab definitions for the missing components
  const defaultTabs: Record<string, { name: string; component: string }> = {}
  function walkDefaults(node: any) {
    if (node.component && missing.includes(node.component)) {
      defaultTabs[node.component] = { name: node.name, component: node.component }
    }
    for (const child of node.children ?? []) walkDefaults(child)
  }
  walkDefaults(DEFAULT_LAYOUT)

  // Find first tabset in saved layout and append missing tabs
  function injectIntoFirstTabset(node: any): boolean {
    if (node.type === 'tabset' && Array.isArray(node.children)) {
      for (const comp of missing) {
        const def = defaultTabs[comp]
        if (def) node.children.push({ type: 'tab', name: def.name, component: def.component })
      }
      return true
    }
    for (const child of node.children ?? []) {
      if (injectIntoFirstTabset(child)) return true
    }
    return false
  }

  const patched = JSON.parse(JSON.stringify(layout))
  injectIntoFirstTabset(patched)
  return patched
}

function loadSavedLayout(): IJsonModel {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) return injectMissingTabs(JSON.parse(saved))
  } catch {}
  return DEFAULT_LAYOUT
}

// ── Main layout component ──

export function DockLayout({ onShowSetup }: { onShowSetup?: () => void }) {
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
      case 'service-detail':
        return <ServiceInfoPanel />
      case 'tools':
        return <ToolsPage />
      case 'debug':
        return <DebugPanel />
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
      <div className="flex-1 relative min-h-0">
        <Layout
          model={modelRef.current}
          factory={factory}
          onModelChange={handleModelChange}
        />
      </div>
      <div className="flex items-center border-t border-border shrink-0 h-7 bg-surface-secondary">
        <StatusBar onShowSetup={onShowSetup} />
        <Button size="xs" variant="ghost" onClick={() => window.location.reload()} className="mr-2 text-gray-500 hover:text-gray-300" title="Reload the launcher UI">
          Refresh
        </Button>
        <Button size="xs" variant="ghost" onClick={resetLayout} className="mr-2 text-gray-500 hover:text-gray-300" title="Reset panel layout to default">
          Reset Layout
        </Button>
      </div>
    </div>
  )
}
