import { useEffect, useState } from 'react'
import type { ServiceState } from '../api/client'
import { openWindow, getServiceSettings } from '../api/client'
import { getBuildables, buildPackage, type BuildStatus } from '../api/tools'
import { ServiceIcon } from './ServiceIcon'
import { useServicesStore } from '../stores/services'

const healthColor: Record<string, string> = {
  healthy: 'text-green-400',
  unhealthy: 'text-red-400',
  starting: 'text-yellow-400 animate-pulse',
  stopped: 'text-gray-500',
  unknown: 'text-gray-500',
}

const healthLabel: Record<string, string> = {
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  starting: 'Starting...',
  stopped: 'Stopped',
  unknown: 'Unknown',
}

interface Props {
  service: ServiceState
  services: ServiceState[]
  selected: boolean
  desktopAvailable?: boolean
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}

export function ServiceCard({ service, services, selected, desktopAvailable, onSelect, onStart, onStop, onRestart }: Props) {
  const isRunning = service.status === 'running' || service.status === 'starting'
  const isConfigOnly = service.category === 'platform'
  const selectedSection = useServicesStore((s) => s.selectedSection)
  const selectSection = useServicesStore((s) => s.selectSection)
  const focusServiceTab = useServicesStore((s) => s.focusServiceTab)
  const [sections, setSections] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

  // Manual build state (for cards declaring build_before_start_package)
  const buildPkg = service.build_before_start_package ?? null
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null)
  const [building, setBuilding] = useState(false)
  const [lastBuildResult, setLastBuildResult] = useState<{ ok: boolean; duration_ms: number } | null>(null)

  useEffect(() => {
    if (!buildPkg) return
    let cancelled = false
    const refresh = (force = false) => {
      getBuildables(force)
        .then((items) => {
          if (cancelled) return
          const match = items.find((b) => b.package === buildPkg)
          setBuildStatus(match?.build_status ?? null)
        })
        .catch(() => {})
    }
    refresh()
    return () => { cancelled = true }
  }, [buildPkg, lastBuildResult])

  const runBuild = async () => {
    if (!buildPkg || building) return
    setBuilding(true)
    setLastBuildResult(null)
    try {
      const res = await buildPackage(buildPkg)
      setLastBuildResult({ ok: res.ok, duration_ms: res.duration_ms })
    } catch (err) {
      setLastBuildResult({ ok: false, duration_ms: 0 })
    } finally {
      setBuilding(false)
    }
  }

  // Auto-clear success indicator after 4s so the button reverts to freshness colour.
  useEffect(() => {
    if (!lastBuildResult || !lastBuildResult.ok) return
    const t = setTimeout(() => setLastBuildResult(null), 4000)
    return () => clearTimeout(t)
  }, [lastBuildResult])

  const buildButtonTone = (() => {
    if (building) return 'text-blue-400 animate-pulse'
    if (lastBuildResult?.ok === false) return 'text-red-400 hover:text-red-300'
    if (lastBuildResult?.ok === true) return 'text-green-400'
    const state = buildStatus?.state
    if (state === 'fresh') return 'text-gray-400 hover:text-gray-200'
    if (state === 'stale') return 'text-amber-400 hover:text-amber-300'
    if (state === 'not_built') return 'text-amber-400 hover:text-amber-300'
    return 'text-gray-500 hover:text-gray-300'
  })()

  const buildButtonTitle = (() => {
    if (building) return `Building ${buildPkg}...`
    if (lastBuildResult) {
      const secs = (lastBuildResult.duration_ms / 1000).toFixed(1)
      return lastBuildResult.ok
        ? `Build succeeded in ${secs}s. Click to rebuild.`
        : `Build failed after ${secs}s. Click to retry.`
    }
    const stateLabel = buildStatus?.state
      ? ` (${buildStatus.state.replace('_', ' ')})`
      : ''
    return `Build ${buildPkg}${stateLabel}`
  })()

  useEffect(() => {
    getServiceSettings(service.key)
      .then((res) => {
        const names = [...new Map(res.schema.filter((f) => f.section).map((f) => [f.section!, f.section!])).keys()]
        // Add virtual sections for runtime panels
        if (service.key === 'ai-client') names.push('Sessions')
        setSections(names)
      })
      .catch(() => {})
  }, [service.key])

  // Collapse when deselected
  useEffect(() => {
    if (!selected) { setExpanded(false); selectSection(null) }
  }, [selected])
  const color = isConfigOnly ? 'text-gray-500' : (healthColor[service.health] ?? healthColor.unknown)

  // Peer relationships
  const devPeer = service.dev_peer_of
    ? services.find((s) => s.key === service.dev_peer_of)
    : null
  const devChild = services.find((s) => s.dev_peer_of === service.key && s.health === 'healthy')

  return (
    <div
      onClick={() => { onSelect() }}
      onDoubleClick={() => { focusServiceTab?.() }}
      className={`
        rounded-lg border px-3 py-2.5 cursor-pointer transition-colors select-none
        ${selected
          ? service.health === 'unhealthy'
            ? 'border-red-500/60 bg-red-500/10'
            : 'border-blue-500/60 bg-blue-500/10'
          : 'border-border bg-surface-secondary hover:bg-surface-hover'
        }
        ${service.health === 'unhealthy' && !selected ? 'border-red-500/40 bg-red-500/5' : ''}
      `}
    >
      {/* Top row: icon + title + status */}
      <div className="flex items-center gap-2.5">
        <ServiceIcon serviceKey={service.key} className={`shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-100 truncate">{service.title}</span>
            {devPeer && (
              <span className="text-[9px] text-amber-400/70 shrink-0">dev of {devPeer.title}</span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            {isConfigOnly ? 'Config' : (healthLabel[service.health] ?? service.health)}
            {service.pid ? ` | PID ${service.pid}` : ''}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isConfigOnly ? (
            <span className="text-[10px] text-gray-600 italic">settings only</span>
          ) : <>
          {/* Auth indicator */}
          {isRunning && service.health === 'healthy' && service.key === 'ai-client' && (
            <span className="text-green-500/60" title="Authenticated via launcher">
              <IconShield />
            </span>
          )}
          {isRunning && service.health === 'healthy' && service.key === 'main-api' && (
            <span className="text-blue-500/50" title="Trusts launcher signing key">
              <IconShield />
            </span>
          )}
          {buildPkg && (
            <IconButton className={buildButtonTone} title={buildButtonTitle} onClick={runBuild}>
              <IconHammer />
            </IconButton>
          )}
          {!isRunning ? (
            <IconButton className="text-green-400 hover:text-green-300" title="Start service" onClick={onStart}>
              <IconPlay />
            </IconButton>
          ) : (
            <>
              {service.url && service.health === 'healthy' && (
                <a href={service.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                  <IconButton className="text-blue-400 hover:text-blue-300" title="Open in browser">
                    <IconExternalLink />
                  </IconButton>
                </a>
              )}
              {service.url && service.health === 'healthy' && desktopAvailable && (
                <IconButton className="text-purple-400 hover:text-purple-300" title="Open in desktop window" onClick={() => openWindow(service.url!, service.title)}>
                  <IconWindow />
                </IconButton>
              )}
              <IconButton className="text-red-400 hover:text-red-300" title="Stop service" onClick={onStop}>
                <IconStop />
              </IconButton>
              <IconButton className="text-amber-400 hover:text-amber-300" title="Restart service" onClick={onRestart}>
                <IconRestart />
              </IconButton>
            </>
          )}
          </>}
        </div>
      </div>

      {/* Dev peer available */}
      {devChild && (
        <div className="mt-1 text-[10px] pl-[30px]" onClick={(e) => e.stopPropagation()}>
          <a
            href={devChild.url ?? '#'}
            target="_blank"
            rel="noopener"
            className="text-amber-400/70 hover:text-amber-300 transition-colors"
          >
            Dev server available ({devChild.title})
          </a>
        </div>
      )}

      {/* Hook server status (ai-client only) */}
      {service.key === 'ai-client' && isRunning && service.health === 'healthy' && (
        <div className="mt-1 text-[10px] pl-[30px] flex items-center gap-1.5">
          {service.extras?.mcp_port ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-emerald-400/80 font-mono">:{String(service.extras.mcp_port)}</span>
              <span className="text-gray-500">MCP server</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600 shrink-0" />
              <span className="text-gray-500">MCP server not detected</span>
            </>
          )}
          {!!service.extras?.hook_port && (
            <>
              <span className="text-gray-700 mx-0.5">|</span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              <span className="text-cyan-400/80 font-mono">:{String(service.extras.hook_port)}</span>
              <span className="text-gray-500">hooks</span>
            </>
          )}
        </div>
      )}

      {/* Error line */}
      {service.last_error && (
        <div className="mt-1.5 text-[10px] text-red-400 whitespace-pre-wrap break-words select-text pl-[30px]">
          {service.last_error}
        </div>
      )}

      {/* Tool warning */}
      {!service.tool_available && (
        <div className="mt-1.5 text-[10px] text-yellow-400 truncate pl-[30px]">
          {service.tool_check_message}
        </div>
      )}

      {/* Sub-resource sections (expandable) */}
      {sections.length > 0 && (
        <div className="mt-1.5 pl-[26px]">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const next = !expanded
              setExpanded(next)
              if (!next) selectSection(null)
            }}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-400 transition-colors px-1 py-0.5"
          >
            <span className={`text-[8px] transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
            <span>{sections.length} sections</span>
          </button>
          {expanded && (
            <div className="mt-0.5 space-y-0.5">
              {sections.map((name) => (
                <button
                  key={name}
                  onClick={(e) => { e.stopPropagation(); onSelect(); selectSection(selectedSection === name ? null : name); focusServiceTab?.() }}
                  className={`flex items-center gap-1.5 text-[10px] w-full text-left rounded px-1.5 py-0.5 transition-colors ${
                    selectedSection === name
                      ? 'text-blue-300 bg-blue-500/15'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-1 h-1 rounded-full shrink-0 ${
                    selectedSection === name ? 'bg-blue-400' : 'bg-gray-600'
                  }`} />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline icons (no dependency) ──────────────────────────────────

function IconButton({ children, className = '', title, onClick }: { children: React.ReactNode; className?: string; title?: string; onClick?: () => void }) {
  return (
    <button className={`p-1 rounded hover:bg-white/10 transition-colors ${className}`} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

function IconExternalLink() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function IconWindow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <circle cx="6" cy="6" r="0.5" fill="currentColor" />
      <circle cx="9" cy="6" r="0.5" fill="currentColor" />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  )
}

function IconStop() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  )
}

function IconRestart() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function IconHammer() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12l-8.5 8.5a1.5 1.5 0 1 1-2.12-2.12L12 10" />
      <path d="M17.64 15L22 10.64" />
      <path d="M20.91 11.7l-1.25 1.25a2.12 2.12 0 0 1-3-3L14.7 6.98a5.37 5.37 0 0 1 3.2-4.63 5.37 5.37 0 0 1 6.4 6.4 5.37 5.37 0 0 1-4.63 3.2z" />
    </svg>
  )
}
