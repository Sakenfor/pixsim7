/**
 * Tools page — Codegen, Migrations, Buildables, Settings.
 */

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import {
  ActionCard, Badge, Button, DisclosureSection, Input, StatusPill,
  type StatusTone,
} from '@pixsim7/shared.ui'
import {
  getCodegenTasks, runCodegenTask, getBuildables, buildPackage,
  getMigrationDatabases, getMigrationStatus, runMigrationAction, invalidateMigrationStatus,
  listDbBackups, backupDatabase, getBackupInfo,
  getSquashStatus, generateSquashBaseline, verifySquashBaseline, discardSquashBaseline,
  archiveOldMigrations, getDbHealth, inspectTable,
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type Buildable, type BuildResult, type BuildStatus,
  type MigrationDatabase, type MigrationStatus, type MigrationResult,
  type DbBackupEntry, type DbBackupResult, type DbBackupInfo,
  type SquashStatus, type SquashGenerateResult, type SquashVerifyResult, type SquashArchiveResult,
  type DbHealth, type DbTableDetail,
} from '../api/tools'

type Section = 'codegen' | 'databases' | 'buildables' | 'settings'

/**
 * Shared build progress so the tab strip can surface activity even when
 * the user has switched away from the Buildables tab.
 */
export interface BuildProgress {
  kind: 'idle' | 'single' | 'batch'
  pkg?: string
  done?: number
  total?: number
}

export function ToolsPage() {
  const [activeSection, setActiveSection] = useState<Section>('codegen')
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({ kind: 'idle' })

  const sections: { id: Section; label: string }[] = [
    { id: 'codegen', label: 'Codegen' },
    { id: 'databases', label: 'Databases' },
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
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeSection === s.id
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            <span>{s.label}</span>
            {s.id === 'buildables' && <TabBuildProgress progress={buildProgress} />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full overflow-auto ${activeSection === 'codegen' ? '' : 'hidden'}`}><CodegenSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'databases' ? '' : 'hidden'}`}><DatabasesSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'buildables' ? '' : 'hidden'}`}>
          <BuildablesSection progress={buildProgress} setProgress={setBuildProgress} />
        </div>
        <div className={`h-full overflow-auto ${activeSection === 'settings' ? '' : 'hidden'}`}><SettingsSection /></div>
      </div>
    </div>
  )
}

function TabBuildProgress({ progress }: { progress: BuildProgress }) {
  if (progress.kind === 'idle') return null
  if (progress.kind === 'batch' && progress.total) {
    return (
      <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 rounded px-1 py-0.5">
        {progress.done ?? 0}/{progress.total}
      </span>
    )
  }
  // single build — just a pulse dot
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"
      title={progress.pkg ? `Building ${progress.pkg}` : 'Building'}
    />
  )
}

// ── Codegen ──

/** IDs that act as parent cards with expandable subcards (children use `{parentId}-*` naming). */
const EXPANDABLE_PARENTS = ['openapi', 'cue'] as const

function CodegenSection() {
  const [tasks, setTasks] = useState<CodegenTask[]>([])
  const [runResult, setRunResult] = useState<CodegenRunResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({})

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

  // Build parent → children map from naming convention
  const parentChildMap = useMemo(() => {
    const childIds = new Set<string>()
    const map: Record<string, { parent: CodegenTask | undefined; children: CodegenTask[] }> = {}
    for (const parentId of EXPANDABLE_PARENTS) {
      const parent = tasks.find((t) => t.id === parentId)
      const children = tasks.filter((t) => t.id.startsWith(`${parentId}-`))
      if (parent || children.length) {
        map[parentId] = { parent, children }
        if (parent) childIds.add(parent.id)
        children.forEach((c) => childIds.add(c.id))
      }
    }
    const regular = tasks.filter((t) => !childIds.has(t.id))
    return { map, regular }
  }, [tasks])

  const renderTaskCard = (task: CodegenTask, opts: { nested?: boolean; parentId?: string } = {}) => {
    const { nested, parentId } = opts
    const dep = task.requires_service
    const depOk = task.service_running !== false
    const titleText = nested && parentId ? task.id.replace(new RegExp(`^${parentId}-`), '') : task.id

    const tags = !nested
      ? task.groups.map((g) => <Badge key={g} color="blue" className="text-[9px]">{g}</Badge>)
      : null

    const depLine = dep && !nested ? (
      <div className="mt-0.5">
        <StatusPill tone={depOk ? 'success' : 'warning'} dot size="xs">
          Requires {dep.label}
          {!depOk && <span className="ml-1 text-[10px] opacity-70">- start it first</span>}
        </StatusPill>
      </div>
    ) : null

    const actions = (
      <>
        {task.supports_check && (
          <Button
            size="xs"
            className="bg-amber-700 hover:bg-amber-600 text-white"
            onClick={() => run(task.id, true)}
            disabled={!!running || !depOk}
          >
            Check
          </Button>
        )}
        <Button
          size="xs"
          className="bg-green-700 hover:bg-green-600 text-white"
          onClick={() => run(task.id, false)}
          disabled={!!running || !depOk}
        >
          {running === task.id ? 'Running...' : 'Run'}
        </Button>
      </>
    )

    return (
      <ActionCard
        key={task.id}
        title={titleText}
        description={task.description}
        body={depLine || undefined}
        tags={tags}
        actions={actions}
        indented={nested}
        className={nested ? 'bg-surface' : undefined}
      />
    )
  }

  return (
    <div className="p-3 space-y-2">
      {EXPANDABLE_PARENTS.map((parentId) => {
        const group = parentChildMap.map[parentId]
        if (!group) return null

        // No explicit parent task — flatten children under no header
        if (!group.parent) {
          return <Fragment key={parentId}>{group.children.map((c) => renderTaskCard(c))}</Fragment>
        }

        const isOpen = !!openParents[parentId]
        const parentBadge = group.children.length > 0
          ? <Badge color="gray" className="text-[9px]">{group.children.length} sub</Badge>
          : null

        return (
          <div key={parentId} className="space-y-1">
            {renderTaskCard(group.parent)}
            {group.children.length > 0 && (
              <DisclosureSection
                label={<span className="text-[10px] text-gray-500">Subtasks</span>}
                badge={parentBadge}
                isOpen={isOpen}
                onToggle={(o) => setOpenParents((p) => ({ ...p, [parentId]: o }))}
                size="sm"
                className="ml-5"
              >
                <div className="space-y-1 mt-1">
                  {group.children.map((c) => renderTaskCard(c, { nested: true, parentId }))}
                </div>
              </DisclosureSection>
            )}
          </div>
        )
      })}
      {parentChildMap.regular.map((task) => renderTaskCard(task))}
      {runResult && <ResultBox result={runResult} />}
    </div>
  )
}

// ── Databases (master-detail: migrations + backups on a selected DB) ──

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function DatabasesSection() {
  const [databases, setDatabases] = useState<MigrationDatabase[]>([])
  const [statuses, setStatuses] = useState<Record<string, MigrationStatus>>({})
  const [backupInfo, setBackupInfo] = useState<Record<string, DbBackupInfo>>({})
  const [backups, setBackups] = useState<DbBackupEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<{ dbId: string; kind: 'migration' | 'backup' } | null>(null)
  const [lastMigResult, setLastMigResult] = useState<MigrationResult | null>(null)
  const [lastBackupResult, setLastBackupResult] = useState<DbBackupResult | null>(null)

  const refreshStatus = useCallback(async (dbId: string) => {
    try {
      invalidateMigrationStatus(dbId)
      const s = await getMigrationStatus(dbId, true)
      setStatuses((prev) => ({ ...prev, [dbId]: s }))
    } catch {
      // ignore — detail panel will show '—'
    }
  }, [])

  const refreshBackupsList = useCallback(async () => {
    try { setBackups(await listDbBackups()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    getMigrationDatabases().then((dbs) => {
      if (cancelled) return
      setDatabases(dbs)
      if (dbs.length > 0) setSelectedId((prev) => prev ?? dbs[0].id)
      dbs.forEach((db) => {
        getMigrationStatus(db.id)
          .then((s) => !cancelled && setStatuses((prev) => ({ ...prev, [db.id]: s })))
          .catch(() => { /* ignore */ })
        getBackupInfo(db.id)
          .then((info) => !cancelled && setBackupInfo((prev) => ({ ...prev, [db.id]: info })))
          .catch(() => { /* ignore */ })
      })
    }).catch(() => { /* ignore */ })
    refreshBackupsList()
    return () => { cancelled = true }
  }, [refreshBackupsList])

  const runMigration = useCallback(async (action: 'upgrade' | 'downgrade' | 'stamp' | 'merge', dbId: string) => {
    setBusy({ dbId, kind: 'migration' })
    setLastMigResult(null)
    try {
      const result = await runMigrationAction(action, dbId)
      setLastMigResult(result)
      await refreshStatus(dbId)
    } finally {
      setBusy(null)
    }
  }, [refreshStatus])

  const runBackup = useCallback(async (dbId: string) => {
    setBusy({ dbId, kind: 'backup' })
    setLastBackupResult(null)
    try {
      const result = await backupDatabase(dbId)
      setLastBackupResult(result)
      if (result.ok) await refreshBackupsList()
    } finally {
      setBusy(null)
    }
  }, [refreshBackupsList])

  const selected = databases.find((db) => db.id === selectedId) ?? null
  const selectedStatus = selected ? statuses[selected.id] : undefined
  const selectedInfo = selected ? backupInfo[selected.id] : undefined
  const selectedBackups = selected ? backups.filter((b) => b.db_id === selected.id) : []
  const dbBusy = busy?.dbId === selected?.id

  const backupModeLabel =
    !selectedInfo ? 'checking…' :
    selectedInfo.mode === 'docker' ? `via ${selectedInfo.container}` :
    selectedInfo.mode === 'local' ? 'local pg_dump' :
    'unavailable'
  const backupModeTone: StatusTone =
    !selectedInfo ? 'muted' :
    selectedInfo.mode === 'unavailable' ? 'warning' :
    'success'
  const canBackup = selectedInfo?.mode === 'docker' || selectedInfo?.mode === 'local'

  return (
    <div className="h-full flex min-h-0">
      {/* Left pane: DB list */}
      <div className="w-44 shrink-0 border-r border-border overflow-auto">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 px-2 py-1.5">Databases</div>
        {databases.map((db) => {
          const status = statuses[db.id]
          const pending = status?.pending?.length ?? 0
          const isSelected = db.id === selectedId
          const tone: StatusTone =
            !status ? 'muted' :
            pending > 0 ? 'warning' :
            'success'
          const label =
            !status ? '—' :
            pending > 0 ? `${pending} pending` :
            'ok'
          return (
            <button
              key={db.id}
              onClick={() => setSelectedId(db.id)}
              className={`w-full text-left px-2 py-1.5 border-l-2 transition-colors ${
                isSelected
                  ? 'bg-surface-raised border-blue-400'
                  : 'border-transparent hover:bg-surface-raised/50'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] text-gray-200 truncate">{db.label}</span>
                <StatusPill tone={tone} dot size="xs">{label}</StatusPill>
              </div>
            </button>
          )
        })}
      </div>

      {/* Right pane: detail */}
      <div className="flex-1 overflow-auto p-3 space-y-4 min-w-0">
        {!selected ? (
          <div className="text-[11px] text-gray-500 italic">Select a database on the left.</div>
        ) : (
          <>
            {/* Header */}
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-gray-100">{selected.label}</div>
              <div className="text-[10px] text-gray-500 font-mono truncate select-text">{selected.db_url}</div>
            </div>

            {/* Health panel */}
            <HealthPanel dbId={selected.id} />

            {/* Migrations panel */}
            <div className="border border-border rounded">
              <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">Migrations</span>
                <Button size="xs" variant="ghost" onClick={() => refreshStatus(selected.id)} className="text-gray-400" title="Refresh status">&#x21bb;</Button>
              </div>
              <div className="p-2 space-y-2">
                <div className="text-[11px]">
                  <span className="text-gray-500">Current:</span>{' '}
                  <span className="text-gray-200 font-mono">{selectedStatus?.current_revision ?? '…'}</span>
                </div>
                {selectedStatus?.pending && selectedStatus.pending.length > 0 && (
                  <div className="text-[11px] space-y-0.5">
                    <div className="text-amber-400">{selectedStatus.pending.length} pending:</div>
                    {selectedStatus.pending.slice(0, 5).map((p) => (
                      <div key={p.revision} className="font-mono text-gray-300 truncate">
                        <span className="text-gray-500">{p.revision.slice(0, 10)}</span>
                        {p.message ? ` — ${p.message}` : ''}
                      </div>
                    ))}
                    {selectedStatus.pending.length > 5 && (
                      <div className="text-gray-500">…and {selectedStatus.pending.length - 5} more</div>
                    )}
                  </div>
                )}
                {selectedStatus?.pending_error && (
                  <div className="text-[11px] text-red-400 whitespace-pre-wrap break-words select-text">
                    {selectedStatus.pending_error}
                  </div>
                )}
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" disabled={dbBusy} onClick={() => runMigration('upgrade', selected.id)}>Upgrade</Button>
                  <Button size="xs" className="bg-amber-700 hover:bg-amber-600 text-white" disabled={dbBusy} onClick={() => runMigration('downgrade', selected.id)}>Down</Button>
                  <Button size="xs" className="bg-blue-700 hover:bg-blue-600 text-white" disabled={dbBusy} onClick={() => runMigration('stamp', selected.id)}>Stamp</Button>
                  <Button size="xs" className="bg-purple-700 hover:bg-purple-600 text-white" disabled={dbBusy} onClick={() => runMigration('merge', selected.id)}>Merge</Button>
                </div>
                {lastMigResult && busy?.kind !== 'backup' && <ResultBox result={lastMigResult} />}
              </div>
            </div>

            {/* Squash wizard */}
            <SquashPanel dbId={selected.id} />

            {/* Backups panel */}
            <div className="border border-border rounded">
              <div className="px-2 py-1.5 border-b border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-gray-300">Backups</span>
                  <StatusPill tone={backupModeTone} dot size="xs">{backupModeLabel}</StatusPill>
                </div>
                <Button size="xs" variant="ghost" onClick={refreshBackupsList} className="text-gray-400" title="Refresh list">&#x21bb;</Button>
              </div>
              <div className="p-2 space-y-2">
                {selectedInfo?.mode === 'unavailable' && selectedInfo.reason && (
                  <div className="text-[11px] text-amber-400 whitespace-pre-wrap">{selectedInfo.reason}</div>
                )}
                <div>
                  <Button
                    size="xs"
                    className="bg-green-700 hover:bg-green-600 text-white"
                    disabled={dbBusy || !canBackup}
                    onClick={() => runBackup(selected.id)}
                  >
                    {busy?.dbId === selected.id && busy.kind === 'backup' ? 'Backing up…' : 'Backup now'}
                  </Button>
                </div>
                {lastBackupResult && (
                  <div
                    className={`p-2 rounded text-[11px] ${
                      lastBackupResult.ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                    }`}
                  >
                    {lastBackupResult.ok ? (
                      <div>
                        <span className="font-mono">{lastBackupResult.filename}</span>
                        {typeof lastBackupResult.size_bytes === 'number' && ` (${formatBytes(lastBackupResult.size_bytes)})`}
                        {lastBackupResult.mode && <span className="text-gray-500"> · {lastBackupResult.mode}</span>}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap select-text">{lastBackupResult.error}</div>
                    )}
                  </div>
                )}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                    Existing ({selectedBackups.length})
                  </div>
                  {selectedBackups.length === 0 ? (
                    <div className="text-[11px] text-gray-500 italic">None yet.</div>
                  ) : (
                    <div className="space-y-1">
                      {selectedBackups.map((b) => (
                        <div
                          key={b.path}
                          className="text-[10px] font-mono bg-surface-raised border border-border rounded px-2 py-1 flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-gray-300">{b.filename}</span>
                          <span className="text-gray-500 shrink-0">
                            {formatBytes(b.size_bytes)} · {b.created_at.replace('T', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Health panel: size, table stats, recent migrations ──

function HealthPanel({ dbId }: { dbId: string }) {
  const [health, setHealth] = useState<DbHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [openTable, setOpenTable] = useState<string | null>(null)
  const [tableDetails, setTableDetails] = useState<Record<string, DbTableDetail | 'loading'>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setHealth(await getDbHealth(dbId))
    } finally {
      setLoading(false)
    }
  }, [dbId])

  const toggleTable = useCallback(async (schema: string, name: string) => {
    const key = `${schema}.${name}`
    if (openTable === key) {
      setOpenTable(null)
      return
    }
    setOpenTable(key)
    if (!tableDetails[key]) {
      setTableDetails((prev) => ({ ...prev, [key]: 'loading' }))
      const detail = await inspectTable(dbId, schema, name)
      setTableDetails((prev) => ({ ...prev, [key]: detail }))
    }
  }, [dbId, openTable, tableDetails])

  useEffect(() => {
    setHealth(null)
    setExpanded(false)
    setOpenTable(null)
    setTableDetails({})
    refresh()
  }, [dbId, refresh])

  const sizeLabel = !health
    ? '—'
    : health.ok
      ? (health.size_pretty || formatBytes(health.size_bytes ?? 0))
      : 'error'
  const tableLabel = health?.ok && health.table_count != null ? `${health.table_count} tables` : ''

  return (
    <div className="border border-border rounded">
      <button
        className="w-full px-2 py-1.5 border-b border-border flex items-center justify-between hover:bg-surface-raised/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-300">Health</span>
          <StatusPill tone={health?.ok ? 'success' : (health ? 'warning' : 'muted')} dot size="xs">
            {loading ? 'loading…' : sizeLabel}
          </StatusPill>
          {tableLabel && <span className="text-[10px] text-gray-500">· {tableLabel}</span>}
        </div>
        <span className="text-gray-500 text-[11px]">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-3 text-[11px]">
          {!health ? (
            <div className="text-gray-500 italic">Loading…</div>
          ) : !health.ok ? (
            <div className="text-red-300 whitespace-pre-wrap select-text">{health.error}</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Total size</div>
                  <div className="font-semibold text-gray-200">{health.size_pretty}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Tables</div>
                  <div className="font-semibold text-gray-200">{health.table_count ?? '—'}</div>
                </div>
                <div className="ml-auto">
                  <Button size="xs" variant="ghost" onClick={refresh} className="text-gray-400" title="Refresh">&#x21bb;</Button>
                </div>
              </div>

              {health.top_tables && health.top_tables.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                    Top tables by size <span className="text-gray-600 normal-case">(click for details)</span>
                  </div>
                  <div className="space-y-0.5">
                    {health.top_tables.map((t) => {
                      const key = `${t.schema}.${t.name}`
                      const isOpen = openTable === key
                      const detail = tableDetails[key]
                      return (
                        <div key={key}>
                          <button
                            onClick={() => toggleTable(t.schema, t.name)}
                            className={`w-full flex items-center justify-between gap-2 font-mono text-[10px] border rounded px-1.5 py-0.5 transition-colors ${
                              isOpen
                                ? 'bg-surface-raised border-blue-400/60'
                                : 'bg-surface-raised/40 border-border hover:border-blue-400/40'
                            }`}
                          >
                            <span className="text-gray-300 truncate">
                              {isOpen ? '▾' : '▸'} {t.schema === 'public' ? t.name : key}
                            </span>
                            <span className="text-gray-500 shrink-0">
                              {formatBytes(t.total_bytes)} · {t.row_estimate.toLocaleString()} rows
                            </span>
                          </button>
                          {isOpen && (
                            <div className="ml-3 mt-1 mb-1.5 border-l-2 border-blue-400/30 pl-2">
                              <TableDetailInline detail={detail} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {health.recent_migrations && health.recent_migrations.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                    Recent migrations
                  </div>
                  <div className="space-y-0.5">
                    {health.recent_migrations.slice(0, 10).map((m, i) => (
                      <div
                        key={i}
                        className="font-mono text-[10px] text-gray-300 bg-surface-raised/40 border border-border rounded px-1.5 py-0.5 truncate select-text"
                        title={m.line}
                      >
                        {m.line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {health.recent_migrations_error && (
                <div className="text-[10px] text-amber-400">
                  Migration history unavailable: {health.recent_migrations_error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TableDetailInline({ detail }: { detail: DbTableDetail | 'loading' | undefined }) {
  if (detail === undefined) return null
  if (detail === 'loading') {
    return <div className="text-[10px] text-gray-500 italic py-1">Loading…</div>
  }
  if (!detail.ok) {
    return (
      <div className="text-[10px] text-red-400 whitespace-pre-wrap py-1 select-text">
        {detail.error ?? 'Inspection failed'}
      </div>
    )
  }

  const exactOrEstimate = detail.exact_row_count != null
    ? `${detail.exact_row_count.toLocaleString()} rows (exact)`
    : detail.estimated_row_count != null
      ? `~${detail.estimated_row_count.toLocaleString()} rows (estimate)`
      : '?'

  return (
    <div className="space-y-2 text-[10px] py-1">
      <div className="flex items-center gap-3 text-gray-400">
        <span>{exactOrEstimate}</span>
        {detail.total_bytes != null && detail.total_bytes > 0 && (
          <span>
            {formatBytes(detail.total_bytes)} total · {formatBytes(detail.heap_bytes ?? 0)} heap
          </span>
        )}
      </div>

      {detail.columns && detail.columns.length > 0 && (
        <div>
          <div className="text-gray-500 uppercase tracking-wide mb-0.5">Columns</div>
          <div className="space-y-px">
            {detail.columns.map((c) => (
              <div key={c.name} className="font-mono flex items-baseline gap-2">
                <span className="text-gray-300 shrink-0">{c.name}</span>
                <span className="text-blue-300">{c.type}</span>
                {!c.nullable && <span className="text-amber-400">NOT NULL</span>}
                {c.default && (
                  <span className="text-gray-500 truncate">
                    default {c.default.length > 60 ? c.default.slice(0, 60) + '…' : c.default}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.indexes && detail.indexes.length > 0 && (
        <div>
          <div className="text-gray-500 uppercase tracking-wide mb-0.5">Indexes ({detail.indexes.length})</div>
          <div className="space-y-px">
            {detail.indexes.map((idx) => (
              <div key={idx.name} className="font-mono text-gray-400 truncate" title={idx.definition}>
                <span className="text-gray-300">{idx.name}</span>
                <span className="text-gray-600"> · </span>
                <span className="text-gray-500">{idx.definition.replace(/^CREATE (UNIQUE )?INDEX [^ ]+ /i, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Squash wizard panel (non-destructive: generate + verify only) ──

function SquashPanel({ dbId }: { dbId: string }) {
  const [status, setStatus] = useState<SquashStatus | null>(null)
  const [generating, setGenerating] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [lastGenerate, setLastGenerate] = useState<SquashGenerateResult | null>(null)
  const [lastVerify, setLastVerify] = useState<SquashVerifyResult | null>(null)
  const [lastArchive, setLastArchive] = useState<SquashArchiveResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [archiveConfirming, setArchiveConfirming] = useState(false)

  const refresh = useCallback(() => {
    getSquashStatus(dbId).then(setStatus).catch(() => {})
  }, [dbId])

  useEffect(() => {
    refresh()
    setLastGenerate(null)
    setLastVerify(null)
    setLastArchive(null)
    setArchiveConfirming(false)
    setExpanded(false)
  }, [dbId, refresh])

  const onGenerate = useCallback(async () => {
    setGenerating(true)
    setLastGenerate(null)
    try {
      const r = await generateSquashBaseline(dbId)
      setLastGenerate(r)
      await refresh()
    } finally {
      setGenerating(false)
    }
  }, [dbId, refresh])

  const onVerify = useCallback(async () => {
    setVerifying(true)
    setLastVerify(null)
    try {
      setLastVerify(await verifySquashBaseline(dbId))
    } finally {
      setVerifying(false)
    }
  }, [dbId])

  const onDiscard = useCallback(async () => {
    setDiscarding(true)
    try {
      const r = await discardSquashBaseline(dbId)
      if (r.ok) {
        setLastGenerate(null)
        setLastVerify(null)
        await refresh()
      }
    } finally {
      setDiscarding(false)
    }
  }, [dbId, refresh])

  const onArchive = useCallback(async () => {
    setArchiving(true)
    setLastArchive(null)
    try {
      setLastArchive(await archiveOldMigrations(dbId))
    } finally {
      setArchiving(false)
      setArchiveConfirming(false)
    }
  }, [dbId])

  const hasBaseline = status?.exists ?? false
  const baselineRev = status?.path?.split(/[\\/]/).pop()?.replace(/_baseline_squash\.py$/, '') ?? lastGenerate?.revision

  return (
    <div className="border border-border rounded">
      <button
        className="w-full px-2 py-1.5 border-b border-border flex items-center justify-between hover:bg-surface-raised/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-300">Squash wizard</span>
          {hasBaseline && <StatusPill tone="warning" dot size="xs">baseline ready</StatusPill>}
        </div>
        <span className="text-gray-500 text-[11px]">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="p-2 space-y-2 text-[11px]">
          <div className="text-gray-400">
            Collapses the migration chain into a single baseline generated from the live schema via
            <span className="font-mono text-gray-300"> pg_dump -s</span>. Non-destructive: writes a file
            you can inspect and discard.  The final "commit" steps (archive old migrations +
            <span className="font-mono text-gray-300"> alembic stamp</span>) stay manual.
          </div>

          {!hasBaseline ? (
            <div>
              <Button
                size="xs"
                className="bg-blue-700 hover:bg-blue-600 text-white"
                disabled={generating}
                onClick={onGenerate}
              >
                {generating ? 'Generating…' : 'Generate baseline'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-gray-400 select-text break-all">
                {status?.path}
                {status?.size_bytes != null && ` · ${formatBytes(status.size_bytes)}`}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <Button
                  size="xs"
                  className="bg-blue-700 hover:bg-blue-600 text-white"
                  disabled={verifying || discarding || archiving}
                  onClick={onVerify}
                >
                  {verifying ? 'Verifying…' : 'Verify (diff vs live)'}
                </Button>
                <Button
                  size="xs"
                  className="bg-amber-700 hover:bg-amber-600 text-white"
                  disabled={generating || verifying || discarding || archiving}
                  onClick={() => setArchiveConfirming(true)}
                >
                  {archiving ? 'Committing…' : 'Archive + stamp…'}
                </Button>
                <Button
                  size="xs"
                  className="bg-red-800 hover:bg-red-700 text-white"
                  disabled={generating || verifying || discarding || archiving}
                  onClick={onDiscard}
                >
                  {discarding ? 'Discarding…' : 'Discard baseline'}
                </Button>
              </div>

              {archiveConfirming && !archiving && (
                <div className="p-2 rounded text-[11px] bg-amber-950/60 text-amber-200 border border-amber-800 space-y-2">
                  <div className="font-medium">This commits the squash in one atomic step:</div>
                  <ol className="list-decimal list-inside space-y-0.5 opacity-90">
                    <li>Move every migration file except the baseline into <span className="font-mono">versions_archive/&lt;timestamp&gt;/</span></li>
                    <li>Run <span className="font-mono">alembic stamp {baselineRev} --purge</span> so the DB points at the new baseline</li>
                  </ol>
                  <div className="opacity-90">
                    Archive is reversible (move files back). The stamp rewrites <span className="font-mono">alembic_version</span> —
                    reverse it by moving files back + stamping to the old head. Did you verify the baseline first? Backup the DB?
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="xs" className="bg-amber-700 hover:bg-amber-600 text-white" onClick={onArchive}>
                      Yes, commit squash
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setArchiveConfirming(false)} className="text-gray-300">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {lastArchive && <SquashArchiveBanner result={lastArchive} />}
              {lastVerify && <SquashVerifyResult result={lastVerify} />}

              {baselineRev && (
                <div className="text-[10px] text-gray-500 border-t border-border pt-2 mt-2 space-y-1">
                  <div className="font-medium text-gray-400">Commit sequence:</div>
                  <div>1. Back up the DB (Backups panel below).</div>
                  <div>2. Verify baseline ↑</div>
                  <div>
                    3. <span className="font-mono text-gray-400">Archive + stamp</span> ↑ — atomic: archives old migration files AND
                    stamps live DB to <span className="font-mono text-gray-400">{baselineRev}</span>.
                  </div>
                </div>
              )}
            </div>
          )}

          {lastGenerate && (
            <div
              className={`p-2 rounded text-[11px] ${
                lastGenerate.ok ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
              }`}
            >
              {lastGenerate.ok ? (
                <div>
                  Generated <span className="font-mono">{lastGenerate.revision}</span>
                  {lastGenerate.schema_size_bytes != null && ` · schema ${formatBytes(lastGenerate.schema_size_bytes)}`}
                </div>
              ) : (
                <div className="whitespace-pre-wrap select-text">{lastGenerate.error}</div>
              )}
              {lastGenerate.warnings && (
                <div className="text-amber-300 mt-1 whitespace-pre-wrap select-text">{lastGenerate.warnings}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SquashArchiveBanner({ result }: { result: SquashArchiveResult }) {
  const archiveHasErrors = (result.errors?.length ?? 0) > 0
  const movedCount = result.moved_count ?? 0
  // Zero-move + zero-error = idempotent re-run, treat as fine.
  const archiveOk = !archiveHasErrors
  const stampOk = result.stamp_ok === true
  const allOk = archiveOk && stampOk

  if (archiveHasErrors && !stampOk && !result.error) {
    // Pure archive failure
    return (
      <div className="p-2 rounded text-[11px] bg-red-900/40 text-red-300 space-y-1">
        <div className="whitespace-pre-wrap select-text">{result.error ?? 'Archive failed'}</div>
        {result.errors && result.errors.length > 0 && (
          <pre className="bg-black/30 text-red-200 rounded p-1.5 text-[10px] font-mono max-h-40 overflow-auto select-text whitespace-pre">
            {result.errors.map((e) => `${e.file}: ${e.error}`).join('\n')}
          </pre>
        )}
      </div>
    )
  }

  const archiveLabel = archiveHasErrors
    ? '✗ Archive step had errors — see below.'
    : movedCount > 0
      ? (
        <>
          ✓ Archived {movedCount} file{movedCount === 1 ? '' : 's'} to{' '}
          <span className="font-mono break-all">{result.archive_dir}</span>
        </>
      )
      : <>✓ Archive step: no files to move (already archived).</>

  return (
    <div
      className={`p-2 rounded text-[11px] space-y-1 ${
        allOk ? 'bg-green-900/40 text-green-300' : 'bg-amber-900/40 text-amber-300'
      }`}
    >
      <div>{archiveLabel}</div>
      {result.sample_moved && result.sample_moved.length > 0 && (
        <div className="text-[10px] opacity-80 font-mono">
          e.g. {result.sample_moved.join(', ')}{(result.moved_count ?? 0) > result.sample_moved.length && ` …+${(result.moved_count ?? 0) - result.sample_moved.length} more`}
        </div>
      )}
      <div>
        {stampOk ? (
          <>
            ✓ Stamped live DB to <span className="font-mono">{result.stamp_revision}</span> (with --purge)
          </>
        ) : (
          <>
            ✗ Stamp step failed — DB may be in an inconsistent state. Run manually:
            <div className="font-mono bg-black/30 rounded px-1.5 py-1 mt-1 select-text break-all">
              alembic -c alembic.ini stamp {result.stamp_revision ?? '<baseline_rev>'} --purge
            </div>
            {result.stamp_output && (
              <pre className="bg-black/30 rounded p-1.5 text-[10px] font-mono max-h-40 overflow-auto select-text whitespace-pre mt-1">
                {result.stamp_output}
              </pre>
            )}
          </>
        )}
      </div>
      {result.errors && result.errors.length > 0 && (
        <pre className="bg-black/30 rounded p-1.5 text-[10px] font-mono max-h-40 overflow-auto select-text whitespace-pre">
          {result.errors.map((e) => `${e.file}: ${e.error}`).join('\n')}
        </pre>
      )}
      {allOk && (
        <div className="text-[10px] opacity-80 border-t border-green-700/40 pt-1 mt-1">
          Squash complete. <span className="font-mono">alembic current</span> should now report{' '}
          <span className="font-mono">{result.stamp_revision}</span>.
        </div>
      )}
    </div>
  )
}

function SquashVerifyResult({ result }: { result: SquashVerifyResult }) {
  if (!result.ok) {
    return (
      <div className="p-2 rounded text-[11px] bg-red-900/40 text-red-300">
        <div className="whitespace-pre-wrap select-text">{result.error}</div>
      </div>
    )
  }
  if (result.identical) {
    return (
      <div className="p-2 rounded text-[11px] bg-green-900/40 text-green-300">
        Schemas match ✓ — baseline produces the same schema as live DB
        {result.live_schema_lines != null && ` (${result.live_schema_lines} lines)`}.
      </div>
    )
  }
  return (
    <div className="p-2 rounded text-[11px] bg-amber-900/40 text-amber-300 space-y-1">
      <div>
        Schemas differ. Most differences are <span className="font-semibold">cosmetic</span>: PostgreSQL
        canonicalizes CHECK constraints / server-side defaults when they round-trip, and psql 17+ emits
        random <span className="font-mono">\restrict</span> tokens on every dump. Safe to proceed if the
        diff is only formatting / whitespace / constraint-normalization.
      </div>
      <div>
        <span className="font-semibold">Not safe</span> if you see missing tables, missing columns,
        missing indexes, or missing foreign keys — those mean the baseline is incomplete.
      </div>
      {result.diff_preview && result.diff_preview.length > 0 && (
        <pre className="bg-black/30 text-amber-200 rounded p-1.5 text-[10px] font-mono max-h-60 overflow-auto select-text whitespace-pre">
          {result.diff_preview.join('\n')}
        </pre>
      )}
    </div>
  )
}

// ── Buildables ──

// Sort order: not_built first (urgent), then stale, then fresh, then unknown.
const STATE_RANK: Record<string, number> = { not_built: 0, stale: 1, fresh: 2, unknown: 3 }
const stateRank = (b: Buildable) => STATE_RANK[b.build_status?.state ?? 'unknown'] ?? 3
const isNeedsBuild = (b: Buildable) => {
  const s = b.build_status?.state
  return s === 'not_built' || s === 'stale'
}

// Category order (known first, unknown last). Within category, packages sub-group
// by first name segment (e.g. "shared.api.client" → "shared").
const CATEGORY_ORDER = ['apps', 'packages', 'chrome-extension']
const PACKAGE_SUBGROUP_THRESHOLD = 10  // sub-group packages only if >= this many items
const PACKAGE_SUBGROUP_OTHER = '(other)'

function packagePrefix(pkg: string): string {
  const name = pkg.includes('/') ? pkg.split('/', 2)[1] : pkg
  const dot = name.indexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

interface BuildableGroup {
  id: string             // unique across all groups (for collapsed state)
  label: string
  items: Buildable[]
  subgroups?: BuildableGroup[]
  depth: number          // 0 = top, 1 = nested
}

function buildGroups(items: Buildable[]): BuildableGroup[] {
  // Top-level by category
  const byCategory = new Map<string, Buildable[]>()
  for (const b of items) {
    const key = b.category || 'uncategorized'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(b)
  }
  const sortedCatKeys = [...byCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const groups: BuildableGroup[] = []
  for (const cat of sortedCatKeys) {
    const catItems = byCategory.get(cat)!
    const group: BuildableGroup = { id: `cat:${cat}`, label: cat, items: catItems, depth: 0 }

    // Sub-group packages by prefix when bulky
    if (cat === 'packages' && catItems.length >= PACKAGE_SUBGROUP_THRESHOLD) {
      const byPrefix = new Map<string, Buildable[]>()
      for (const b of catItems) {
        const pfx = packagePrefix(b.package)
        if (!byPrefix.has(pfx)) byPrefix.set(pfx, [])
        byPrefix.get(pfx)!.push(b)
      }
      // Merge one-off prefixes into "(other)" to avoid 1-item sub-groups
      const main: [string, Buildable[]][] = []
      const other: Buildable[] = []
      for (const [pfx, arr] of byPrefix) {
        if (arr.length >= 2) main.push([pfx, arr])
        else other.push(...arr)
      }
      main.sort((a, b) => b[1].length - a[1].length)
      if (other.length) main.push([PACKAGE_SUBGROUP_OTHER, other])
      group.subgroups = main.map(([pfx, arr]) => ({
        id: `cat:${cat}/${pfx}`, label: pfx, items: arr, depth: 1,
      }))
    }

    groups.push(group)
  }
  return groups
}

function sortItems(items: Buildable[]): Buildable[] {
  return [...items].sort((a, b) => {
    const ra = stateRank(a); const rb = stateRank(b)
    if (ra !== rb) return ra - rb
    return a.title.localeCompare(b.title)
  })
}

function countNeedsBuild(items: Buildable[]): number {
  let n = 0
  for (const b of items) if (isNeedsBuild(b)) n++
  return n
}

function BuildablesSection({
  progress, setProgress,
}: { progress: BuildProgress; setProgress: (p: BuildProgress) => void }) {
  const [buildables, setBuildables] = useState<Buildable[]>([])
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null)
  const [lastBuiltPkg, setLastBuiltPkg] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [batch, setBatch] = useState<{ running: boolean; done: number; total: number; failed: string[] } | null>(null)

  // Derive "currently building single pkg" from lifted progress state
  const buildingPkg = progress.kind === 'single' || progress.kind === 'batch' ? progress.pkg ?? null : null
  const anyBusy = progress.kind !== 'idle'

  useEffect(() => { getBuildables().then(setBuildables) }, [])

  const groups = useMemo(() => buildGroups(buildables), [buildables])
  const totalStale = useMemo(() => countNeedsBuild(buildables), [buildables])

  // Default: top-level groups open; sub-groups closed.
  useEffect(() => {
    if (!groups.length) return
    setOpenGroups((prev) => {
      const next = { ...prev }
      for (const g of groups) {
        if (next[g.id] === undefined) next[g.id] = true
        if (g.subgroups) {
          for (const sg of g.subgroups) {
            if (next[sg.id] === undefined) next[sg.id] = false
          }
        }
      }
      return next
    })
  }, [groups])

  const handleBuild = useCallback(async (pkg: string) => {
    setProgress({ kind: 'single', pkg })
    setBuildResult(null)
    setLastBuiltPkg(pkg)
    try {
      setBuildResult(await buildPackage(pkg))
      // Force-refresh to get updated build_status
      getBuildables(true).then(setBuildables)
    } finally {
      setProgress({ kind: 'idle' })
    }
  }, [setProgress])

  const rebuildAllStale = useCallback(async (scope?: Buildable[]) => {
    const pool = (scope ?? buildables).filter(isNeedsBuild)
    if (!pool.length) return
    setBuildResult(null)
    setBatch({ running: true, done: 0, total: pool.length, failed: [] })
    const failed: string[] = []
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i]
      setProgress({ kind: 'batch', pkg: b.package, done: i, total: pool.length })
      try {
        const res = await buildPackage(b.package)
        if (!res.ok) failed.push(b.package)
      } catch {
        failed.push(b.package)
      }
      setBatch({ running: i < pool.length - 1, done: i + 1, total: pool.length, failed: [...failed] })
    }
    setProgress({ kind: 'idle' })
    getBuildables(true).then(setBuildables)
  }, [buildables, setProgress])

  const justBuiltLauncher = buildResult?.ok && lastBuiltPkg === '@pixsim7/launcher'

  return (
    <div className="h-full flex flex-col">
      {/* Sticky toolbar + result */}
      <div className="shrink-0 p-3 pb-0 space-y-2">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-500">
            {buildables.length} packages
            {totalStale > 0 && (
              <span className="text-amber-400 ml-1">- {totalStale} need build</span>
            )}
          </span>
          <Button
            size="xs"
            className="bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50"
            onClick={() => rebuildAllStale()}
            disabled={anyBusy || totalStale === 0}
          >
            {batch?.running ? `Building ${batch.done}/${batch.total}...` : `Rebuild stale (${totalStale})`}
          </Button>
          <div className="flex-1" />
          <Button size="xs" variant={viewMode === 'cards' ? 'secondary' : 'ghost'} onClick={() => setViewMode('cards')}>Cards</Button>
          <Button size="xs" variant={viewMode === 'list' ? 'secondary' : 'ghost'} onClick={() => setViewMode('list')}>List</Button>
        </div>

        {batch && !batch.running && (
          <div className={`flex items-center gap-2 p-2 rounded border text-[11px] ${batch.failed.length ? 'bg-red-900/20 border-red-800/50 text-red-200' : 'bg-green-900/20 border-green-800/50 text-green-200'}`}>
            <span className="flex-1">
              Batch done: {batch.total - batch.failed.length}/{batch.total} succeeded
              {batch.failed.length > 0 && (
                <span className="ml-2 font-mono text-red-300">(failed: {batch.failed.join(', ')})</span>
              )}
            </span>
            <Button size="xs" variant="ghost" onClick={() => setBatch(null)}>Dismiss</Button>
          </div>
        )}

        {buildResult && !batch?.running && <ResultBox result={buildResult} />}
        {justBuiltLauncher && (
          <div className="flex items-center gap-2 p-2 rounded border border-blue-800/50 bg-blue-900/20 text-[11px] text-blue-200">
            <span className="flex-1">Launcher UI rebuilt - reload to apply. (Tab state will reset.)</span>
            <Button size="xs" variant="primary" onClick={() => window.location.reload()}>Reload now</Button>
          </div>
        )}
      </div>

      {/* Scrollable grouped content */}
      <div className="flex-1 overflow-y-auto p-3 pt-2 space-y-1">
        {groups.map((group) => (
          <GroupNode
            key={group.id}
            group={group}
            openGroups={openGroups}
            setOpen={(id, o) => setOpenGroups((prev) => ({ ...prev, [id]: o }))}
            viewMode={viewMode}
            buildingPkg={buildingPkg}
            anyBusy={anyBusy}
            onBuild={handleBuild}
            onRebuildStale={rebuildAllStale}
          />
        ))}
      </div>
    </div>
  )
}

function GroupNode({
  group, openGroups, setOpen, viewMode, buildingPkg, anyBusy, onBuild, onRebuildStale,
}: {
  group: BuildableGroup
  openGroups: Record<string, boolean>
  setOpen: (id: string, open: boolean) => void
  viewMode: 'cards' | 'list'
  buildingPkg: string | null
  anyBusy: boolean
  onBuild: (pkg: string) => void
  onRebuildStale: (scope?: Buildable[]) => void
}) {
  const isOpen = !!openGroups[group.id]
  const staleCount = countNeedsBuild(group.items)

  const label = (
    <span className="flex items-center gap-1.5">
      <span className={group.depth === 0 ? 'text-xs uppercase tracking-wide' : 'text-[11px]'}>{group.label}</span>
      <span className="text-[10px] text-gray-500">({group.items.length})</span>
      {staleCount > 0 && (
        <span className="text-[10px] text-amber-400">- {staleCount} need build</span>
      )}
    </span>
  )

  const actions = staleCount > 0 ? (
    <Button
      size="xs"
      variant="ghost"
      className="text-amber-400 hover:text-amber-300"
      disabled={anyBusy}
      onClick={(e) => { e.stopPropagation(); onRebuildStale(group.items) }}
    >
      Rebuild stale
    </Button>
  ) : null

  return (
    <DisclosureSection
      label={label}
      actions={actions}
      isOpen={isOpen}
      onToggle={(o) => setOpen(group.id, o)}
      size="sm"
      className={group.depth === 1 ? 'ml-4' : ''}
    >
      {group.subgroups
        ? (
          <div className="space-y-1">
            {group.subgroups.map((sub) => (
              <GroupNode
                key={sub.id}
                group={sub}
                openGroups={openGroups}
                setOpen={setOpen}
                viewMode={viewMode}
                buildingPkg={buildingPkg}
                anyBusy={anyBusy}
                onBuild={onBuild}
                onRebuildStale={onRebuildStale}
              />
            ))}
          </div>
        )
        : (
          <div className="space-y-1">
            {sortItems(group.items).map((b) => (
              <BuildableItem
                key={b.id}
                b={b}
                viewMode={viewMode}
                buildingPkg={buildingPkg}
                anyBusy={anyBusy}
                onBuild={onBuild}
              />
            ))}
          </div>
        )}
    </DisclosureSection>
  )
}

function BuildableItem({
  b, viewMode, buildingPkg, anyBusy, onBuild,
}: { b: Buildable; viewMode: 'cards' | 'list'; buildingPkg: string | null; anyBusy: boolean; onBuild: (pkg: string) => void }) {
  const statusPill = buildStateToPill(b.build_status)
  const tags = b.tags.filter((t) => t !== b.category).map((t) => (
    <Badge key={t} color="blue" className="text-[9px]">{t}</Badge>
  ))

  const buildBtn = (
    <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={() => onBuild(b.package)} disabled={anyBusy}>
      {buildingPkg === b.package ? (viewMode === 'list' ? '...' : 'Building...') : 'Build'}
    </Button>
  )

  if (viewMode === 'list') {
    return (
      <ActionCard
        title={b.title}
        status={statusPill}
        meta={b.directory}
        density="compact"
        actions={buildBtn}
        indented
      />
    )
  }

  const meta = (
    <>
      {b.directory}
      {b.build_status?.build_modified && (
        <span className="ml-2 text-gray-500">built {formatRelativeTime(b.build_status.build_modified)}</span>
      )}
    </>
  )

  return (
    <ActionCard
      title={b.title}
      status={statusPill}
      tags={tags}
      description={b.description}
      meta={meta}
      actions={buildBtn}
      indented
    />
  )
}

// ── Build status helpers ──

const BUILD_STATE_TONE: Record<string, { tone: StatusTone; label: string; dot: boolean }> = {
  fresh:     { tone: 'success', label: 'Fresh',     dot: false },
  stale:     { tone: 'warning', label: 'Stale',     dot: true  },
  not_built: { tone: 'danger',  label: 'Not built', dot: true  },
}

function buildStateToPill(status?: BuildStatus) {
  const state = status?.state ?? 'unknown'
  const cfg = BUILD_STATE_TONE[state]
  if (!cfg) return null
  return <StatusPill tone={cfg.tone} dot={cfg.dot} size="xs">{cfg.label}</StatusPill>
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
      {result.result && <pre className="text-gray-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto select-text">{result.result}</pre>}
      {result.stdout && <pre className="text-gray-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto select-text">{result.stdout}</pre>}
      {result.stderr && <pre className="text-red-400 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto select-text">{result.stderr}</pre>}
      {result.error && <pre className="text-red-400 whitespace-pre-wrap text-[10px] select-text break-words">{result.error}</pre>}
    </div>
  )
}
