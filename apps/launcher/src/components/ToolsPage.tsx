/**
 * Tools page — Codegen, Migrations, Buildables, Settings.
 */

import { useState, useEffect, useCallback } from 'react'
import { Badge, Button, Input } from '@pixsim7/shared.ui'
import {
  getCodegenTasks, runCodegenTask, getBuildables, buildPackage,
  getMigrationDatabases, getMigrationStatus, runMigrationAction, invalidateMigrationStatus,
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type Buildable, type BuildResult, type BuildStatus,
  type MigrationDatabase, type MigrationStatus, type MigrationResult,
} from '../api/tools'

type Section = 'codegen' | 'migrations' | 'buildables' | 'settings'

export function ToolsPage() {
  const [activeSection, setActiveSection] = useState<Section>('codegen')

  const sections: { id: Section; label: string }[] = [
    { id: 'codegen', label: 'Codegen' },
    { id: 'migrations', label: 'Migrations' },
    { id: 'buildables', label: 'Buildables' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="h-full flex flex-col bg-surface text-gray-100">
      {/* Section tabs */}
      <div className="flex border-b border-border shrink-0 px-2">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeSection === s.id
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full overflow-auto ${activeSection === 'codegen' ? '' : 'hidden'}`}><CodegenSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'migrations' ? '' : 'hidden'}`}><MigrationsSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'buildables' ? '' : 'hidden'}`}><BuildablesSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'settings' ? '' : 'hidden'}`}><SettingsSection /></div>
      </div>
    </div>
  )
}

// ── Codegen ──

function CodegenSection() {
  const [tasks, setTasks] = useState<CodegenTask[]>([])
  const [runResult, setRunResult] = useState<CodegenRunResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [openapiExpanded, setOpenapiExpanded] = useState(false)

  useEffect(() => {
    getCodegenTasks().then(setTasks)
    const interval = setInterval(() => getCodegenTasks().then(setTasks), 15_000)
    return () => clearInterval(interval)
  }, [])

  const run = useCallback(async (taskId: string, check: boolean) => {
    setRunning(taskId)
    setRunResult(null)
    try {
      setRunResult(await runCodegenTask(taskId, check))
    } finally {
      setRunning(null)
    }
  }, [])

  const isScopedOpenApiTask = useCallback((task: CodegenTask) => task.id.startsWith('openapi-'), [])
  const openapiParent = tasks.find((task) => task.id === 'openapi')
  const openapiChildren = tasks.filter(isScopedOpenApiTask)
  const regularTasks = tasks.filter((task) => task.id !== 'openapi' && !isScopedOpenApiTask(task))

  const renderTask = (task: CodegenTask, nested = false) => {
    const dep = task.requires_service
    const depOk = task.service_running !== false
    const showOpenapiToggle = task.id === 'openapi' && openapiChildren.length > 0
    const titleText = nested ? task.id.replace(/^openapi-/, '') : task.id
    const descriptionText = nested
      ? task.description.replace(/^Scoped OpenAPI merge for\s*/i, '').replace(/\s*tags\s*$/i, '')
      : task.description

    return (
      <div
        key={task.id}
        className={`flex items-center gap-2 px-3 py-2 rounded border border-border ${nested ? 'bg-surface ml-5' : 'bg-surface-secondary'}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {showOpenapiToggle && (
              <button
                type="button"
                onClick={() => setOpenapiExpanded((prev) => !prev)}
                className="text-[10px] text-gray-400 hover:text-gray-200 w-3"
                title={openapiExpanded ? 'Collapse OpenAPI scoped tasks' : 'Expand OpenAPI scoped tasks'}
              >
                {openapiExpanded ? 'v' : '>'}
              </button>
            )}
            {nested && <span className="text-[10px] text-gray-500">-&gt;</span>}
            <span className="text-xs font-medium text-gray-200">{titleText}</span>
            {!nested && task.groups.map((g) => <Badge key={g} color="blue" className="text-[9px]">{g}</Badge>)}
            {showOpenapiToggle && <Badge color="gray" className="text-[9px]">{openapiChildren.length} scoped</Badge>}
          </div>
          <div className="text-[10px] text-gray-500 truncate">{descriptionText}</div>
          {dep && !nested && (
            <div className={`text-[9px] mt-0.5 flex items-center gap-1 ${depOk ? 'text-green-500' : 'text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${depOk ? 'bg-green-500' : 'bg-amber-500'}`} />
              Requires {dep.label}
              {!depOk && <span className="text-gray-500">- start it first</span>}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {task.supports_check && (
            <Button
              size="xs"
              className="bg-amber-700 hover:bg-amber-600 text-white w-8 px-0 text-[11px]"
              onClick={() => run(task.id, true)}
              disabled={!!running || !depOk}
              title={`Check ${task.id}`}
            >
              {"\u2713"}
            </Button>
          )}
          <Button
            size="xs"
            className="bg-green-700 hover:bg-green-600 text-white w-8 px-0 text-[11px]"
            onClick={() => run(task.id, false)}
            disabled={!!running || !depOk}
            title={`Run ${task.id}`}
          >
            {running === task.id ? '...' : "\u25B6"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {openapiParent && renderTask(openapiParent)}
      {openapiParent && openapiExpanded && openapiChildren.map((task) => renderTask(task, true))}
      {!openapiParent && openapiChildren.map((task) => renderTask(task))}
      {regularTasks.map((task) => renderTask(task))}
      {runResult && <ResultBox result={runResult} />}
    </div>
  )
}

// ── Migrations ──

function MigrationsSection() {
  const [databases, setDatabases] = useState<MigrationDatabase[]>([])
  const [statuses, setStatuses] = useState<Record<string, MigrationStatus>>({})
  const [actionResult, setActionResult] = useState<MigrationResult | null>(null)
  const [loadingDb, setLoadingDb] = useState<string | null>(null)

  useEffect(() => { getMigrationDatabases().then(setDatabases) }, [])

  useEffect(() => {
    databases.forEach((db) => {
      getMigrationStatus(db.id).then((s) =>
        setStatuses((prev) => ({ ...prev, [db.id]: s }))
      ).catch(() => {})
    })
  }, [databases])

  const refreshDb = useCallback(async (dbId: string) => {
    try {
      invalidateMigrationStatus(dbId)
      const s = await getMigrationStatus(dbId, true)
      setStatuses((prev) => ({ ...prev, [dbId]: s }))
    } catch {}
  }, [])

  const runAction = useCallback(async (action: 'upgrade' | 'downgrade' | 'stamp' | 'merge', dbId: string) => {
    setLoadingDb(dbId)
    setActionResult(null)
    try {
      const result = await runMigrationAction(action, dbId)
      setActionResult(result)
      invalidateMigrationStatus(dbId)
      await refreshDb(dbId)
    } finally {
      setLoadingDb(null)
    }
  }, [refreshDb])

  return (
    <div className="p-3 space-y-2">
      {databases.map((db) => {
        const status = statuses[db.id]
        const busy = loadingDb === db.id
        const hasPending = (status?.pending?.length ?? 0) > 0
        const dotColor = !status ? 'bg-gray-500' : hasPending ? 'bg-amber-500' : 'bg-green-500'

        return (
          <div key={db.id} className="bg-surface-secondary rounded border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-200">{db.label}</div>
                <div className="text-[10px] text-gray-500 font-mono truncate">{db.db_url}</div>
              </div>
              <Button size="xs" variant="ghost" onClick={() => refreshDb(db.id)} className="text-gray-400">&#x21bb;</Button>
            </div>

            {status ? (
              <div className="space-y-0.5 text-[10px] mb-2">
                <div>
                  <span className="text-gray-500">Rev:</span>{' '}
                  <span className="text-gray-300 font-mono">{status.current_revision}</span>
                </div>
                {hasPending ? (
                  <div className="text-amber-400">
                    {status.pending.length} pending migration{status.pending.length > 1 ? 's' : ''}
                  </div>
                ) : (
                  <div className="text-green-400">Up to date</div>
                )}
                {status.pending_error && <div className="text-red-400">{status.pending_error}</div>}
              </div>
            ) : (
              <div className="text-[10px] text-gray-500 mb-2">Loading...</div>
            )}

            <div className="flex gap-1">
              <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={() => runAction('upgrade', db.id)} disabled={busy}>Upgrade</Button>
              <Button size="xs" className="bg-amber-700 hover:bg-amber-600 text-white" onClick={() => runAction('downgrade', db.id)} disabled={busy}>Down</Button>
              <Button size="xs" className="bg-blue-700 hover:bg-blue-600 text-white" onClick={() => runAction('stamp', db.id)} disabled={busy}>Stamp</Button>
              <Button size="xs" className="bg-purple-700 hover:bg-purple-600 text-white" onClick={() => runAction('merge', db.id)} disabled={busy}>Merge</Button>
            </div>
          </div>
        )
      })}

      {actionResult && <ResultBox result={actionResult} />}
    </div>
  )
}

// ── Buildables ──

function BuildablesSection() {
  const [buildables, setBuildables] = useState<Buildable[]>([])
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [buildingPkg, setBuildingPkg] = useState<string | null>(null)
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null)
  const [filterCategory, setFilterCategory] = useState('')

  useEffect(() => { getBuildables().then(setBuildables) }, [])

  const categories = [...new Set(buildables.map((b) => b.category).filter(Boolean))] as string[]
  const filtered = filterCategory ? buildables.filter((b) => b.category === filterCategory) : buildables

  const handleBuild = useCallback(async (pkg: string) => {
    setBuildingPkg(pkg)
    setBuildResult(null)
    try {
      setBuildResult(await buildPackage(pkg))
      // Force-refresh to get updated build_status
      getBuildables(true).then(setBuildables)
    } finally {
      setBuildingPkg(null)
    }
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Sticky toolbar + result */}
      <div className="shrink-0 p-3 pb-0 space-y-2">
        <div className="flex items-center gap-2 text-[10px]">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-surface-secondary border border-border rounded px-1.5 py-0.5 text-gray-300 text-[11px]"
          >
            <option value="">All ({buildables.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c} ({buildables.filter((b) => b.category === c).length})</option>
            ))}
          </select>
          <div className="flex-1" />
          <Button size="xs" variant={viewMode === 'cards' ? 'secondary' : 'ghost'} onClick={() => setViewMode('cards')}>Cards</Button>
          <Button size="xs" variant={viewMode === 'list' ? 'secondary' : 'ghost'} onClick={() => setViewMode('list')}>List</Button>
        </div>

        {buildResult && <ResultBox result={buildResult} />}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-3 pt-2">
        {viewMode === 'cards' && (
          <div className="space-y-1.5">
            {filtered.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2 bg-surface-secondary rounded border border-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-200">{b.title}</span>
                    <BuildBadge status={b.build_status} />
                    {b.category && <Badge color="purple" className="text-[9px]">{b.category}</Badge>}
                    {b.tags.filter((t) => t !== b.category).map((t) => (
                      <Badge key={t} color="blue" className="text-[9px]">{t}</Badge>
                    ))}
                  </div>
                  {b.description && <div className="text-[10px] text-gray-500 truncate mt-0.5">{b.description}</div>}
                  <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                    {b.directory}
                    {b.build_status?.build_modified && (
                      <span className="ml-2 text-gray-500">built {formatRelativeTime(b.build_status.build_modified)}</span>
                    )}
                  </div>
                </div>
                <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={() => handleBuild(b.package)} disabled={!!buildingPkg}>
                  {buildingPkg === b.package ? 'Building...' : 'Build'}
                </Button>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="space-y-0.5">
            {filtered.map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-2 py-1 hover:bg-surface-hover rounded text-[11px]">
                <span className="text-gray-200 w-40 truncate font-medium">{b.title}</span>
                <BuildBadge status={b.build_status} />
                <span className="text-gray-500 w-20 truncate">{b.category}</span>
                <span className="text-gray-600 font-mono flex-1 truncate">{b.directory}</span>
                <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={() => handleBuild(b.package)} disabled={!!buildingPkg}>
                  {buildingPkg === b.package ? '...' : 'Build'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Build status helpers ──

const BUILD_BADGE: Record<string, { color: 'green' | 'orange' | 'red' | 'gray'; label: string }> = {
  fresh:     { color: 'green', label: 'Fresh' },
  stale:     { color: 'orange', label: 'Stale' },
  not_built: { color: 'red', label: 'Not built' },
}

function BuildBadge({ status }: { status?: BuildStatus }) {
  const state = status?.state ?? 'unknown'
  const style = BUILD_BADGE[state]
  if (!style) return null
  return <Badge color={style.color} className="text-[9px]">{style.label}</Badge>
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  } catch {
    return ''
  }
}

// ── Settings ──

function SettingsSection() {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { getSettings().then(setSettings) }, [])

  const update = (key: string, value: unknown) => {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    try { await saveSettings(settings); setSaved(true) } finally { setSaving(false) }
  }

  const toggle = (key: string, label: string) => (
    <label key={key} className="flex items-center gap-2 text-[11px]">
      <input type="checkbox" checked={!!settings[key]} onChange={(e) => update(key, e.target.checked)} className="rounded" />
      <span className="text-gray-300">{label}</span>
    </label>
  )

  const isDev = location.port === '3100'

  const toggleDevMode = () => {
    if (isDev) {
      window.location.href = 'http://localhost:8100' + window.location.pathname + window.location.hash
      return
    }
    const isEmbedded = navigator.userAgent.includes('QtWebEngine')
    if (isEmbedded) {
      alert('Use Ctrl+Shift+D to toggle dev mode.\nThe launcher checks if Vite is running first.')
    } else {
      window.location.href = 'http://localhost:3100' + window.location.pathname + window.location.hash
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="bg-surface-secondary rounded border border-border p-3 space-y-2">
        <h3 className="text-xs font-bold text-gray-200 mb-2">Launcher</h3>

        <label className="flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={isDev} onChange={toggleDevMode} className="rounded" />
          <span className="text-gray-300">Dev mode (Vite HMR on :3100)</span>
          {isDev && <span className="text-amber-400 text-[9px]">DEV</span>}
        </label>

        <div className="border-t border-border my-2" />

        {toggle('stop_services_on_exit', 'Stop services when launcher exits')}
        {toggle('clear_logs_on_restart', 'Clear logs on service start/restart')}
        {toggle('auto_refresh_logs', 'Auto-refresh DB logs')}
        {toggle('window_always_on_top', 'Window always on top')}
      </div>

      <div className="bg-surface-secondary rounded border border-border p-3 space-y-1">
        <h3 className="text-xs font-bold text-gray-200 mb-1">Debug (legacy)</h3>
        <div className="text-[10px] text-gray-500 mb-2">
          These require a service restart. Use the Debug tab for runtime control instead.
        </div>
        {toggle('sql_logging_enabled', 'SQL query logging (startup)')}
        {toggle('backend_debug_enabled', 'Backend debug mode (startup)')}
        <div className="flex items-center gap-2 text-[11px] mt-2">
          <span className="text-gray-500">Worker debug flags:</span>
          <Input
            value={(settings.worker_debug_flags as string) ?? ''}
            onChange={(e) => update('worker_debug_flags', e.target.value)}
            placeholder="e.g. generation,provider"
            size="sm"
            className="w-48"
          />
        </div>
      </div>

      <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={saved}>
        {saved ? 'Saved' : 'Save Settings'}
      </Button>
    </div>
  )
}

// ── Shared result display ──

function ResultBox({ result }: { result: { ok: boolean; result?: string; error?: string; stdout?: string; stderr?: string; duration_ms?: number; exit_code?: number } }) {
  return (
    <div className={`p-3 rounded border text-xs font-mono ${result.ok ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Badge color={result.ok ? 'green' : 'red'}>{result.ok ? 'Success' : 'Failed'}</Badge>
        {result.exit_code !== undefined && <span className="text-gray-500">exit={result.exit_code}</span>}
        {result.duration_ms !== undefined && <span className="text-gray-500">({result.duration_ms}ms)</span>}
      </div>
      {result.result && <pre className="text-gray-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto">{result.result}</pre>}
      {result.stdout && <pre className="text-gray-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto">{result.stdout}</pre>}
      {result.stderr && <pre className="text-red-400 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto">{result.stderr}</pre>}
      {result.error && <pre className="text-red-400 whitespace-pre-wrap text-[10px]">{result.error}</pre>}
    </div>
  )
}
