/**
 * Tools page — Codegen, Migrations, Buildables, Settings.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getCodegenTasks, runCodegenTask, getBuildables, buildPackage,
  getMigrationDatabases, getMigrationStatus, runMigrationAction,
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type Buildable, type BuildResult,
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

      <div className="flex-1 overflow-auto">
        {activeSection === 'codegen' && <CodegenSection />}
        {activeSection === 'migrations' && <MigrationsSection />}
        {activeSection === 'buildables' && <BuildablesSection />}
        {activeSection === 'settings' && <SettingsSection />}
      </div>
    </div>
  )
}

// ── Codegen ──

function CodegenSection() {
  const [tasks, setTasks] = useState<CodegenTask[]>([])
  const [runResult, setRunResult] = useState<CodegenRunResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => { getCodegenTasks().then(setTasks) }, [])

  const run = useCallback(async (taskId: string, check: boolean) => {
    setRunning(taskId)
    setRunResult(null)
    try {
      setRunResult(await runCodegenTask(taskId, check))
    } finally {
      setRunning(null)
    }
  }, [])

  return (
    <div className="p-3 space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-surface-secondary rounded border border-border">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-200">{task.id}</div>
            <div className="text-[10px] text-gray-500 truncate">{task.description}</div>
            {task.groups.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {task.groups.map((g) => <span key={g} className="text-[9px] px-1 rounded bg-blue-900/30 text-blue-400">{g}</span>)}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {task.supports_check && (
              <button onClick={() => run(task.id, true)} disabled={!!running} className="px-2 py-1 text-[10px] rounded bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white">Check</button>
            )}
            <button onClick={() => run(task.id, false)} disabled={!!running} className="px-2 py-1 text-[10px] rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white">
              {running === task.id ? 'Running...' : 'Run'}
            </button>
          </div>
        </div>
      ))}
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

  // Fetch status for all databases on mount
  useEffect(() => {
    databases.forEach((db) => {
      getMigrationStatus(db.id).then((s) =>
        setStatuses((prev) => ({ ...prev, [db.id]: s }))
      ).catch(() => {})
    })
  }, [databases])

  const refreshDb = useCallback(async (dbId: string) => {
    try {
      const s = await getMigrationStatus(dbId)
      setStatuses((prev) => ({ ...prev, [dbId]: s }))
    } catch {}
  }, [])

  const runAction = useCallback(async (action: 'upgrade' | 'downgrade' | 'stamp' | 'merge', dbId: string) => {
    setLoadingDb(dbId)
    setActionResult(null)
    try {
      const result = await runMigrationAction(action, dbId)
      setActionResult(result)
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
            {/* Card header */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-200">{db.label}</div>
                <div className="text-[10px] text-gray-500 font-mono truncate">{db.db_url}</div>
              </div>
              <button onClick={() => refreshDb(db.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-400">↻</button>
            </div>

            {/* Status */}
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

            {/* Actions */}
            <div className="flex gap-1">
              <button onClick={() => runAction('upgrade', db.id)} disabled={busy} className="px-2 py-0.5 text-[9px] rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white">Upgrade</button>
              <button onClick={() => runAction('downgrade', db.id)} disabled={busy} className="px-2 py-0.5 text-[9px] rounded bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white">Down</button>
              <button onClick={() => runAction('stamp', db.id)} disabled={busy} className="px-2 py-0.5 text-[9px] rounded bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white">Stamp</button>
              <button onClick={() => runAction('merge', db.id)} disabled={busy} className="px-2 py-0.5 text-[9px] rounded bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-white">Merge</button>
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
    } finally {
      setBuildingPkg(null)
    }
  }, [])

  return (
    <div className="p-3 space-y-2">
      {/* Toolbar */}
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
        <button onClick={() => setViewMode('cards')} className={`px-1.5 py-0.5 rounded ${viewMode === 'cards' ? 'bg-blue-900/30 text-blue-400' : 'text-gray-500'}`}>Cards</button>
        <button onClick={() => setViewMode('list')} className={`px-1.5 py-0.5 rounded ${viewMode === 'list' ? 'bg-blue-900/30 text-blue-400' : 'text-gray-500'}`}>List</button>
      </div>

      {/* Build result */}
      {buildResult && <ResultBox result={buildResult} />}

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div className="space-y-1.5">
          {filtered.map((b) => (
            <div key={b.id} className="flex items-center gap-2 px-3 py-2 bg-surface-secondary rounded border border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-200">{b.title}</span>
                  {b.category && <span className="text-[9px] px-1 rounded bg-purple-900/30 text-purple-400">{b.category}</span>}
                  {b.tags.filter((t) => t !== b.category).map((t) => (
                    <span key={t} className="text-[9px] px-1 rounded bg-blue-900/20 text-blue-400">{t}</span>
                  ))}
                </div>
                {b.description && <div className="text-[10px] text-gray-500 truncate mt-0.5">{b.description}</div>}
                <div className="text-[10px] text-gray-600 font-mono mt-0.5">{b.directory}</div>
              </div>
              <button
                onClick={() => handleBuild(b.package)}
                disabled={!!buildingPkg}
                className="px-2.5 py-1 text-[10px] rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white shrink-0"
              >
                {buildingPkg === b.package ? 'Building...' : 'Build'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-0.5">
          {filtered.map((b) => (
            <div key={b.id} className="flex items-center gap-2 px-2 py-1 hover:bg-surface-hover rounded text-[11px]">
              <span className="text-gray-200 w-40 truncate font-medium">{b.title}</span>
              <span className="text-gray-500 w-20 truncate">{b.category}</span>
              <span className="text-gray-600 font-mono flex-1 truncate">{b.directory}</span>
              <button
                onClick={() => handleBuild(b.package)}
                disabled={!!buildingPkg}
                className="px-2 py-0.5 text-[9px] rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white shrink-0"
              >
                {buildingPkg === b.package ? '...' : 'Build'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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

  return (
    <div className="p-3 space-y-3">
      <div className="bg-surface-secondary rounded border border-border p-3 space-y-2">
        <h3 className="text-xs font-bold text-gray-200 mb-2">Launcher Settings</h3>
        {toggle('stop_services_on_exit', 'Stop services when launcher exits')}
        {toggle('clear_logs_on_restart', 'Clear logs on service start/restart')}
        {toggle('sql_logging_enabled', 'SQL query logging')}
        {toggle('backend_debug_enabled', 'Backend debug mode (LOG_LEVEL=DEBUG)')}
        {toggle('auto_refresh_logs', 'Auto-refresh DB logs')}
        {toggle('window_always_on_top', 'Window always on top')}

        <div className="flex items-center gap-2 text-[11px] mt-2">
          <span className="text-gray-500">Worker debug flags:</span>
          <input
            type="text"
            value={(settings.worker_debug_flags as string) ?? ''}
            onChange={(e) => update('worker_debug_flags', e.target.value)}
            placeholder="e.g. generation,provider"
            className="bg-surface border border-border rounded px-2 py-0.5 text-gray-300 text-[11px] w-48"
          />
        </div>
      </div>

      <button onClick={save} disabled={saving} className="px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white">
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
      </button>
    </div>
  )
}

// ── Shared result display ──

function ResultBox({ result }: { result: { ok: boolean; result?: string; error?: string; stdout?: string; stderr?: string; duration_ms?: number; exit_code?: number } }) {
  return (
    <div className={`p-3 rounded border text-xs font-mono ${result.ok ? 'bg-green-900/20 border-green-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={result.ok ? 'text-green-400' : 'text-red-400'}>{result.ok ? 'Success' : 'Failed'}</span>
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
