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
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type Buildable, type BuildResult, type BuildStatus,
  type MigrationDatabase, type MigrationStatus, type MigrationResult,
} from '../api/tools'

type Section = 'codegen' | 'migrations' | 'buildables' | 'settings'

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
        <div className={`h-full overflow-auto ${activeSection === 'migrations' ? '' : 'hidden'}`}><MigrationsSection /></div>
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

        const tone: StatusTone = !status ? 'muted' : hasPending ? 'warning' : 'success'
        const statusLabel = !status
          ? 'Loading'
          : hasPending
            ? `${status.pending.length} pending`
            : 'Up to date'

        const body = (
          <div className="space-y-0.5 text-[10px] mt-1">
            <div className="text-gray-500 font-mono truncate">{db.db_url}</div>
            {status && (
              <>
                <div>
                  <span className="text-gray-500">Rev:</span>{' '}
                  <span className="text-gray-300 font-mono">{status.current_revision}</span>
                </div>
                {status.pending_error && (
                  <div className="text-red-400 select-text whitespace-pre-wrap break-words">{status.pending_error}</div>
                )}
              </>
            )}
          </div>
        )

        const actions = (
          <>
            <Button size="xs" variant="ghost" onClick={() => refreshDb(db.id)} className="text-gray-400" title="Refresh status">&#x21bb;</Button>
            <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" onClick={() => runAction('upgrade', db.id)} disabled={busy}>Upgrade</Button>
            <Button size="xs" className="bg-amber-700 hover:bg-amber-600 text-white" onClick={() => runAction('downgrade', db.id)} disabled={busy}>Down</Button>
            <Button size="xs" className="bg-blue-700 hover:bg-blue-600 text-white" onClick={() => runAction('stamp', db.id)} disabled={busy}>Stamp</Button>
            <Button size="xs" className="bg-purple-700 hover:bg-purple-600 text-white" onClick={() => runAction('merge', db.id)} disabled={busy}>Merge</Button>
          </>
        )

        return (
          <ActionCard
            key={db.id}
            title={db.label}
            status={<StatusPill tone={tone} dot size="xs">{statusLabel}</StatusPill>}
            body={body}
            actions={actions}
          />
        )
      })}

      {actionResult && <ResultBox result={actionResult} />}
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
