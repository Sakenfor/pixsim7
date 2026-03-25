/**
 * Tools page — Codegen, Migrations, Buildables, Settings.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getCodegenTasks, runCodegenTask, getBuildables,
  getMigrationStatus, runMigrationAction, getMigrationHistory,
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type Buildable,
  type MigrationStatus, type MigrationResult,
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
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [actionResult, setActionResult] = useState<MigrationResult | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setStatus(await getMigrationStatus()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [])

  const runAction = useCallback(async (action: 'upgrade' | 'downgrade' | 'stamp' | 'merge') => {
    setLoading(true)
    setActionResult(null)
    try {
      const result = await runMigrationAction(action)
      setActionResult(result)
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [refresh])

  return (
    <div className="p-3 space-y-3">
      {/* Status */}
      <div className="bg-surface-secondary rounded border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-gray-200">Database Migration Status</h3>
          <button onClick={refresh} disabled={loading} className="px-2 py-0.5 text-[10px] rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300">
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
        {status ? (
          <div className="space-y-1 text-[11px]">
            <div><span className="text-gray-500">Current:</span> <span className="text-gray-200 font-mono">{status.current_revision}</span></div>
            <div><span className="text-gray-500">Heads:</span> <span className="text-gray-200 font-mono">{status.heads}</span></div>
            {status.pending.length > 0 && (
              <div>
                <span className="text-amber-400">Pending migrations ({status.pending.length}):</span>
                <div className="mt-1 space-y-0.5 pl-2">
                  {status.pending.map((m) => (
                    <div key={m.revision} className="text-[10px] font-mono">
                      <span className="text-gray-400">{m.revision.slice(0, 12)}</span>
                      <span className="text-gray-300 ml-1">{m.message}</span>
                      {m.is_head && <span className="text-green-400 ml-1">(head)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {status.pending.length === 0 && <div className="text-green-400 text-[10px]">Up to date</div>}
            {status.pending_error && <div className="text-red-400 text-[10px]">{status.pending_error}</div>}
          </div>
        ) : (
          <div className="text-gray-500 text-[10px]">{loading ? 'Loading...' : 'Failed to load status'}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => runAction('upgrade')} disabled={loading} className="px-3 py-1.5 text-xs rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white">Upgrade Head</button>
        <button onClick={() => runAction('downgrade')} disabled={loading} className="px-3 py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white">Downgrade -1</button>
        <button onClick={() => runAction('stamp')} disabled={loading} className="px-3 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white">Stamp Head</button>
        <button onClick={() => runAction('merge')} disabled={loading} className="px-3 py-1.5 text-xs rounded bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-white">Merge Heads</button>
      </div>

      {actionResult && <ResultBox result={actionResult} />}
    </div>
  )
}

// ── Buildables ──

function BuildablesSection() {
  const [buildables, setBuildables] = useState<Buildable[]>([])
  useEffect(() => { getBuildables().then(setBuildables) }, [])

  return (
    <div className="p-3 grid grid-cols-2 gap-1.5">
      {buildables.map((b) => (
        <div key={b.id} className="px-3 py-2 bg-surface-secondary rounded border border-border">
          <div className="text-xs font-medium text-gray-200">{b.title}</div>
          <div className="text-[10px] text-gray-500 truncate">{b.description}</div>
          <div className="text-[10px] text-gray-600 mt-1 font-mono">{b.command} {b.args.join(' ')}</div>
          {b.category && <span className="text-[9px] px-1 rounded bg-purple-900/30 text-purple-400 mt-1 inline-block">{b.category}</span>}
        </div>
      ))}
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
