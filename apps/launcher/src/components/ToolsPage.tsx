/**
 * Tools page — Codegen, Migrations, Buildables, Settings.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Badge, Button, Checkbox, DisclosureSection, EmptyState, Input, LoadingSpinner, SectionHeader,
  SidebarContentLayout, StatusPill,
  useSidebarNav,
  type SidebarContentLayoutSection, type StatusTone,
} from '@pixsim7/shared.ui'
import { CollapsiblePanel } from './CollapsiblePanel'
import {
  getCodegenTasks, runCodegenTask, getCodegenOpenapiStats, getCodegenOutputStats,
  getBuildables, buildPackage,
  getMigrationDatabases, getMigrationStatus, runMigrationAction, invalidateMigrationStatus,
  listDbBackups, backupDatabase, getBackupInfo,
  getSquashStatus, generateSquashBaseline, verifySquashBaseline, discardSquashBaseline,
  archiveOldMigrations, getDbHealth, inspectTable,
  getSettings, saveSettings,
  type CodegenTask, type CodegenRunResult, type CodegenOpenapiStats, type CodegenOutputStats,
  type Buildable, type BuildResult, type BuildStatus,
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
  // Pending-migration count across all databases, lifted out of DatabasesSection
  // so the top-level "Databases" tab can flag it without the user drilling in.
  const [dbPending, setDbPending] = useState(0)

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
            {s.id === 'databases' && dbPending > 0 && <TabPendingBadge count={dbPending} />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full overflow-auto ${activeSection === 'codegen' ? '' : 'hidden'}`}><CodegenSection /></div>
        <div className={`h-full overflow-auto ${activeSection === 'databases' ? '' : 'hidden'}`}><DatabasesSection onPendingCountChange={setDbPending} /></div>
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

/** Amber count chip on the Databases tab when any DB has pending migrations. */
function TabPendingBadge({ count }: { count: number }) {
  return (
    <span
      className="text-[10px] font-mono text-amber-300 bg-amber-500/15 ring-1 ring-amber-400/30 rounded px-1 py-0.5 leading-none"
      title={`${count} pending migration${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  )
}

// ── Codegen ──

/** IDs that act as parent rows with expandable children (children use `{parentId}-*` naming). */
const EXPANDABLE_PARENTS = ['openapi', 'cue'] as const

// Inline stroke-icon set for codegen task rows. Matches the launcher's existing
// pattern (see ServiceIcon.tsx / DockLayout.tsx) — no external icon library.
const codegenIcoProps = {
  width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, stroke: 'currentColor',
}
const Ico = {
  Cloud: () => <svg {...codegenIcoProps}><path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.74A6 6 0 0 0 4 12a4 4 0 0 0 1 7h12.5z" /></svg>,
  Image: () => <svg {...codegenIcoProps}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>,
  Message: () => <svg {...codegenIcoProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  Gamepad: () => <svg {...codegenIcoProps}><path d="M6 11h4" /><path d="M8 9v4" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="10" r="1" fill="currentColor" stroke="none" /><rect x="2" y="6" width="20" height="12" rx="4" /></svg>,
  Activity: () => <svg {...codegenIcoProps}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  Wrench: () => <svg {...codegenIcoProps}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  Tag: () => <svg {...codegenIcoProps}><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" /></svg>,
  Upload: () => <svg {...codegenIcoProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  FileCode: () => <svg {...codegenIcoProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="10 13 8 15 10 17" /><polyline points="14 13 16 15 14 17" /></svg>,
  Beaker: () => <svg {...codegenIcoProps}><path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3" /><path d="M8 3h8" /><path d="M7 14h10" /></svg>,
  Map: () => <svg {...codegenIcoProps}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>,
  Grid: () => <svg {...codegenIcoProps}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  Plug: () => <svg {...codegenIcoProps}><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0z" /><path d="M12 18v4" /></svg>,
  Cog: () => <svg {...codegenIcoProps}><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M17.66 17.66l1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M4.93 19.07l1.41-1.41" /><path d="M17.66 6.34l1.41-1.41" /></svg>,
} as const

/** Per-task-id icon. Falls back to GROUP_ICONS[task.groups[0]], then Cog. */
const TASK_ICONS: Record<string, () => React.ReactNode> = {
  'openapi':            Ico.Cloud,
  'openapi-assets':     Ico.Image,
  'openapi-prompts':    Ico.Message,
  'openapi-game':       Ico.Gamepad,
  'openapi-runtime':    Ico.Activity,
  'openapi-dev':        Ico.Wrench,
  'composition-roles':  Ico.Tag,
  'prompt-roles':       Ico.Tag,
  'branded':            Ico.Tag,
  'upload-context':     Ico.Upload,
  'cue':                Ico.FileCode,
  'cue-projection-corpus': Ico.Beaker,
  'app-map':            Ico.Map,
  'ui-catalog':         Ico.Grid,
  'plugin-codegen':     Ico.Plug,
}
const GROUP_ICONS: Record<string, () => React.ReactNode> = {
  openapi:  Ico.Cloud,
  prompt:   Ico.Message,
  cue:      Ico.FileCode,
  tests:    Ico.Beaker,
  docs:     Ico.Map,
  plugins:  Ico.Plug,
  types:    Ico.Tag,
}

function pickTaskIcon(task: CodegenTask): () => React.ReactNode {
  const direct = TASK_ICONS[task.id]
  if (direct) return direct
  for (const g of task.groups ?? []) {
    if (GROUP_ICONS[g]) return GROUP_ICONS[g]
  }
  return Ico.Cog
}

/** Per-task run history kept in launcher session memory so tab-switches don't lose it. */
type CodegenResultEntry = {
  result: CodegenRunResult
  ranAt: number
  checkMode: boolean
}

const CODEGEN_GROUP_FILTER_ALL = '__all__'
const CODEGEN_GROUP_ORDER = [
  'openapi',
  'cue',
  'types',
  'ontology',
  'prompt',
  'plugins',
  'tests',
  'docs',
] as const

function CodegenSection() {
  const [tasks, setTasks] = useState<CodegenTask[]>([])
  const [results, setResults] = useState<Record<string, CodegenResultEntry>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [openapiStats, setOpenapiStats] = useState<CodegenOpenapiStats | null>(null)
  const [groupFilter, setGroupFilter] = useState<string>(CODEGEN_GROUP_FILTER_ALL)
  // Per-task output filesystem stats; keyed by task id, refreshed on selection
  // and after a Run completes.
  const [outputStats, setOutputStats] = useState<Record<string, CodegenOutputStats>>({})

  const groupTaskCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      for (const group of task.groups) {
        counts.set(group, (counts.get(group) ?? 0) + 1)
      }
    }
    return counts
  }, [tasks])

  const groupFilterOptions = useMemo(() => {
    const groups = [...groupTaskCounts.keys()]
    groups.sort((a, b) => {
      const ai = CODEGEN_GROUP_ORDER.indexOf(a as (typeof CODEGEN_GROUP_ORDER)[number])
      const bi = CODEGEN_GROUP_ORDER.indexOf(b as (typeof CODEGEN_GROUP_ORDER)[number])
      const aKnown = ai !== -1
      const bKnown = bi !== -1
      if (aKnown && bKnown) return ai - bi
      if (aKnown) return -1
      if (bKnown) return 1
      return a.localeCompare(b)
    })
    return [CODEGEN_GROUP_FILTER_ALL, ...groups]
  }, [groupTaskCounts])

  useEffect(() => {
    if (groupFilter === CODEGEN_GROUP_FILTER_ALL) return
    if (!groupTaskCounts.has(groupFilter)) setGroupFilter(CODEGEN_GROUP_FILTER_ALL)
  }, [groupFilter, groupTaskCounts])

  const filteredTasks = useMemo(
    () => (groupFilter === CODEGEN_GROUP_FILTER_ALL
      ? tasks
      : tasks.filter((t) => t.groups.includes(groupFilter))),
    [tasks, groupFilter],
  )

  const tasksById = useMemo(() => {
    const map = new Map<string, CodegenTask>()
    for (const task of tasks) map.set(task.id, task)
    return map
  }, [tasks])

  useEffect(() => {
    getCodegenTasks().then(setTasks)
    const interval = setInterval(() => getCodegenTasks().then(setTasks), 15_000)
    return () => clearInterval(interval)
  }, [])

  // Build SidebarContentLayout sections from tasks. EXPANDABLE_PARENTS items
  // (`openapi`, `cue`) become parent sections with their `${parentId}-*`
  // siblings as children; every other task is a top-level section. The icon
  // flips to a spinner while a task is running — canonical pattern from
  // `MaintenanceDashboard.tsx:1493` (rail stays purely nav, run-state badge
  // moves into the detail header).
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const childIds = new Set<string>()
    const childrenByParent = new Map<string, CodegenTask[]>()
    for (const parentId of EXPANDABLE_PARENTS) {
      const children = filteredTasks.filter((t) => t.id.startsWith(`${parentId}-`))
      if (children.length) {
        childrenByParent.set(parentId, children)
        children.forEach((c) => childIds.add(c.id))
      }
    }

    const taskIcon = (t: CodegenTask) => {
      if (running === t.id) return <LoadingSpinner size="xs" />
      const Icon = pickTaskIcon(t)
      return <Icon />
    }

    const out: SidebarContentLayoutSection[] = []
    // Pass 1: emit EXPANDABLE_PARENTS at the top, matching the legacy rail order
    // (openapi + cue with their indented children grouped above the flat tasks).
    // Mixing them inline with manifest order made the next sibling visually read
    // as a child of the previous task.
    const parentIdSet = new Set<string>(EXPANDABLE_PARENTS)
    for (const parentId of EXPANDABLE_PARENTS) {
      const t = filteredTasks.find((tt) => tt.id === parentId) ?? tasksById.get(parentId)
      const children = childrenByParent.get(parentId)
      if (!t) continue
      if (!filteredTasks.some((tt) => tt.id === parentId) && (!children || children.length === 0)) continue
      out.push({
        id: `task:${parentId}`,
        label: children ? `${parentId} (${children.length})` : parentId,
        icon: taskIcon(t),
        // Keep parent rows selectable without forcing expand/collapse. Chevron
        // remains the explicit expand/collapse affordance.
        toggleOnClickIfExpandable: false,
        children: children?.map((c) => ({
          id: `task:${c.id}`,
          label: c.id.replace(new RegExp(`^${parentId}-`), ''),
          icon: taskIcon(c),
        })),
      })
    }
    // Pass 2: every other task in manifest order, skipping children + parents.
    for (const t of filteredTasks) {
      if (childIds.has(t.id) || parentIdSet.has(t.id)) continue
      out.push({
        id: `task:${t.id}`,
        label: t.id,
        icon: taskIcon(t),
      })
    }
    return out
  }, [filteredTasks, tasksById, running])

  const nav = useSidebarNav({ sections, storageKey: 'launcher-codegen-active' })
  const visibleRailIds = useMemo(() => {
    const ids = new Set<string>()
    for (const section of sections) {
      ids.add(section.id)
      for (const child of section.children ?? []) ids.add(child.id)
    }
    return ids
  }, [sections])

  // Keep selected rail id valid when the group filter changes.
  useEffect(() => {
    if (sections.length === 0) return
    const current = nav.activeChildId ?? nav.activeSectionId
    if (!visibleRailIds.has(current)) nav.navigate(sections[0].id)
  }, [sections, visibleRailIds, nav.activeSectionId, nav.activeChildId, nav.navigate])

  // Resolve the active task from the rail state (`task:<id>` namespace). Falls
  // back to section id when no child is selected.
  const activeRailId = nav.activeChildId ?? nav.activeSectionId
  const activeTaskId = activeRailId.startsWith('task:') ? activeRailId.slice(5) : null
  const selected = activeTaskId && visibleRailIds.has(`task:${activeTaskId}`)
    ? tasksById.get(activeTaskId) ?? null
    : null
  const selectedEntry = activeTaskId ? results[activeTaskId] ?? null : null
  const selectedIsOpenapi = !!activeTaskId && activeTaskId.startsWith('openapi')

  // Fetch openapi stats lazily — only when the user looks at an openapi-* task.
  // Backend caches for 30s; the api-client caches for 30s too, so this is cheap.
  useEffect(() => {
    if (!selectedIsOpenapi) return
    let cancelled = false
    getCodegenOpenapiStats().then((s) => { if (!cancelled) setOpenapiStats(s) })
    return () => { cancelled = true }
  }, [selectedIsOpenapi])

  // Fetch output stats whenever a task is selected (small, fast endpoint).
  useEffect(() => {
    if (!activeTaskId) return
    let cancelled = false
    getCodegenOutputStats(activeTaskId).then((s) => {
      if (!cancelled) setOutputStats((prev) => ({ ...prev, [activeTaskId]: s }))
    })
    return () => { cancelled = true }
  }, [activeTaskId])

  const navigate = nav.navigate
  const run = useCallback(async (taskId: string, check: boolean) => {
    setRunning(taskId)
    navigate(`task:${taskId}`)  // focus the right pane on the task being run
    try {
      const r = await runCodegenTask(taskId, check)
      setResults((prev) => ({ ...prev, [taskId]: { result: r, ranAt: Date.now(), checkMode: check } }))
      // Re-fetch output stats — file mtimes changed if regen succeeded.
      // (Skipped in check mode: --check writes to a tempdir and doesn't touch the canonical output.)
      if (!check && r.ok) {
        const s = await getCodegenOutputStats(taskId)
        setOutputStats((prev) => ({ ...prev, [taskId]: s }))
      }
    } finally {
      setRunning(null)
    }
  }, [navigate])

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-3 pb-0 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-gray-500 mr-1">Group:</span>
          {groupFilterOptions.map((group) => {
            const isAll = group === CODEGEN_GROUP_FILTER_ALL
            const count = isAll ? tasks.length : (groupTaskCounts.get(group) ?? 0)
            const active = groupFilter === group
            const label = isAll ? 'all' : group
            return (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(group)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  active
                    ? 'bg-blue-900/40 border-blue-700/60 text-blue-200'
                    : 'bg-surface-raised border-border text-gray-400 hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      <SidebarContentLayout
        sections={sections}
        activeSectionId={nav.activeSectionId}
        activeChildId={nav.activeChildId}
        // Use `navigate` instead of `selectSection`: the latter auto-routes to
        // the first child of any section that has children, which prevents the
        // user from ever selecting an EXPANDABLE_PARENT (e.g., `openapi`) itself.
        // `navigate` clears `activeChildId` for top-level ids, so the parent
        // task lands in the detail pane as expected.
        onSelectSection={nav.navigate}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle="Codegen tasks"
        sidebarWidth="w-52"
        variant="dark"
        resizable
        persistKey="launcher-codegen-sidebar"
        contentClassName="overflow-auto p-3 min-w-0"
        className="flex-1 min-h-0"
      >
        {sections.length === 0 ? (
          <EmptyState message={groupFilter === CODEGEN_GROUP_FILTER_ALL ? 'No codegen tasks found.' : `No codegen tasks in group "${groupFilter}".`} />
        ) : !selected ? (
          <EmptyState message="Select a codegen task on the left." />
        ) : (
          <CodegenTaskDetail
            task={selected}
            entry={selectedEntry}
            running={running === selected.id}
            onRun={(check) => run(selected.id, check)}
            openapiStats={selectedIsOpenapi ? openapiStats : null}
            output={outputStats[selected.id] ?? null}
          />
        )}
      </SidebarContentLayout>
    </div>
  )
}

// ── Codegen subcomponents ──

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

/** Round timeouts to a coarse human label (e.g. "5m", "30s", "2.5m"). */
function formatTimeout(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const mins = ms / 60_000
  return Number.isInteger(mins) ? `${mins}m` : `${mins.toFixed(1)}m`
}

function formatAgo(epochMs: number, now: number): string {
  const diff = Math.max(0, now - epochMs)
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Date(epochMs).toLocaleDateString()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** Parse `--include-tags`/`--exclude-tags` CSV from a task's args list. */
function parseTagFilters(args?: string[]): { include: string[]; exclude: string[] } {
  const out = { include: [] as string[], exclude: [] as string[] }
  if (!args) return out
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === '--include-tags') {
      out.include = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    } else if (args[i] === '--exclude-tags') {
      out.exclude = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return out
}

/** Reconstruct the `pnpm codegen` invocation for copy-paste. */
function cliCommand(task: CodegenTask, check: boolean): string {
  const parts = ['pnpm', 'codegen', '--', '--only', task.id]
  if (check && task.supports_check) parts.push('--check')
  return parts.join(' ')
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore — clipboard may be unavailable in some contexts
    }
  }, [text])
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised hover:bg-surface-raised/70 text-gray-400 hover:text-gray-200 border border-border shrink-0"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function CodegenTaskDetail({
  task, entry, running, onRun, openapiStats, output,
}: {
  task: CodegenTask
  entry: CodegenResultEntry | null
  running: boolean
  onRun: (check: boolean) => void
  openapiStats: CodegenOpenapiStats | null
  output: CodegenOutputStats | null
}) {
  const dep = task.requires_service
  const depOk = task.service_running !== false
  const disabled = running || !depOk
  const tagFilters = parseTagFilters(task.args)
  const isOpenapiScoped = task.id.startsWith('openapi-') && tagFilters.include.length > 0
  const TitleIcon = pickTaskIcon(task)

  // For openapi-scoped tasks, fold in op counts when available.
  const tagCount = (tag: string): number | undefined => openapiStats?.per_tag?.[tag]
  const totalScopedOps = isOpenapiScoped && openapiStats?.per_tag
    ? tagFilters.include.reduce((sum, t) => sum + (openapiStats.per_tag![t] ?? 0), 0)
    : null
  // Sort tags by op count desc, with unknown tags at the end.
  const orderedIncludeTags = isOpenapiScoped && openapiStats?.per_tag
    ? [...tagFilters.include].sort((a, b) => (tagCount(b) ?? -1) - (tagCount(a) ?? -1))
    : tagFilters.include

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-blue-300 shrink-0 [&>svg]:w-4 [&>svg]:h-4">
            <TitleIcon />
          </span>
          <span className="text-sm font-semibold text-gray-100 font-mono">{task.id}</span>
          {task.groups.map((g) => (
            <Badge key={g} color="blue" className="text-[9px]">{g}</Badge>
          ))}
          {task.check_only && (
            <Badge color="yellow" className="text-[9px]">check-only</Badge>
          )}
        </div>
        <div className="text-[11px] text-gray-400">{task.description}</div>
        <div className="text-[10px] text-gray-500 font-mono truncate select-text">{task.script}</div>
        {/* Live OpenAPI schema summary — shown on the unscoped `openapi` parent
            task (and any future openapi child without --include-tags). For
            tag-scoped children, the per-tag breakdown is in the "Covers tags"
            panel below, so we skip it here. */}
        {task.id.startsWith('openapi') && tagFilters.include.length === 0 && openapiStats?.ok && (
          <div className="text-[10px] text-gray-500">
            Live schema: <span className="text-gray-300">{openapiStats.total_ops ?? '?'}</span> ops
            {openapiStats.per_tag && (
              <> · <span className="text-gray-300">{Object.keys(openapiStats.per_tag).length}</span> tags</>
            )}
            {openapiStats.fetched_at && (
              <> · fetched {formatAgo(openapiStats.fetched_at * 1000, Date.now())}</>
            )}
          </div>
        )}
      </div>

      {dep && (
        <StatusPill tone={depOk ? 'success' : 'warning'} dot size="xs">
          Requires {dep.label}
          {!depOk && <span className="ml-1 text-[10px] opacity-70">— start it first</span>}
        </StatusPill>
      )}

      {/* Output filesystem stats (A1+A2+symbol-count). Surfaces only when the
          task has a declared output path. Local-FS introspection — answers
          "is my generated code there and is it fresh?" */}
      {output && output.ok && output.output_path && (
        <div className="border border-border rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Output</span>
            {!output.exists && (
              <Badge color="orange" className="text-[9px]">not built</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
              {output.output_path}
            </code>
            <CopyButton text={output.output_path} />
          </div>
          {output.exists && (
            <>
              <div className="text-[10px] text-gray-400">
                {output.kind === 'directory' ? (
                  <>
                    {output.file_count ?? 0} files
                    {typeof output.total_bytes === 'number' && (
                      <> · {formatFileSize(output.total_bytes)}</>
                    )}
                    {typeof output.symbol_count === 'number' && (
                      <> · <span className="text-gray-300">{output.symbol_count.toLocaleString()} generated symbols</span></>
                    )}
                  </>
                ) : (
                  typeof output.total_bytes === 'number' && formatFileSize(output.total_bytes)
                )}
              </div>
              {output.last_modified && (
                <div className="text-[10px] text-gray-500">
                  Last modified {formatAgo(output.last_modified * 1000, Date.now())}
                  {output.most_recent_file && output.kind === 'directory' && (
                    <> · <span className="font-mono text-gray-400">{output.most_recent_file}</span></>
                  )}
                  {/* Pair build mtime with live-schema fetch time so a fresh
                      schema against an older build reads as a stale signal. */}
                  {task.id.startsWith('openapi') && openapiStats?.ok && openapiStats.fetched_at && (
                    <>
                      {' '}· schema fetched {formatAgo(openapiStats.fetched_at * 1000, Date.now())}
                      {openapiStats.fetched_at > output.last_modified && (
                        <span className="ml-1 text-amber-400">(newer than build)</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {isOpenapiScoped && output.exists && (
            <div className="text-[10px] text-gray-500 italic">
              Shares the canonical <span className="font-mono">openapi</span> output. Generate merges
              just this slice (overwrites/adds its DTO files, no clobber); it won&apos;t prune DTOs
              deleted upstream — run full <span className="font-mono">openapi</span> for that.
            </div>
          )}
        </div>
      )}

      {/* What this task covers — parsed from args (#1, with op-counts from #6). */}
      {(tagFilters.include.length > 0 || tagFilters.exclude.length > 0) && (
        <div className="border border-border rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">
              Covers {tagFilters.include.length > 0 ? 'tags' : 'all except'}
            </span>
            {isOpenapiScoped && (
              <span className="text-[10px] text-gray-500">
                {openapiStats?.ok && totalScopedOps !== null ? (
                  <>
                    {tagFilters.include.length} tags · {totalScopedOps} ops
                    {openapiStats.total_ops ? (
                      <span className="text-gray-600"> / {openapiStats.total_ops} total</span>
                    ) : null}
                  </>
                ) : openapiStats && !openapiStats.ok ? (
                  <span className="text-amber-500" title={openapiStats.error}>op-counts unavailable</span>
                ) : (
                  <span className="text-gray-600">loading op counts…</span>
                )}
              </span>
            )}
          </div>
          {orderedIncludeTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {orderedIncludeTags.map((tag) => {
                const c = tagCount(tag)
                const known = openapiStats?.per_tag ? c !== undefined : true
                return (
                  <span
                    key={tag}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      known
                        ? 'bg-surface-raised text-gray-300 border border-border'
                        : 'bg-amber-900/30 text-amber-300 border border-amber-800/50'
                    }`}
                    title={!known ? 'Tag listed in manifest but not seen in live OpenAPI schema' : undefined}
                  >
                    {tag}
                    {c !== undefined && <span className="ml-1 text-gray-500">{c}</span>}
                  </span>
                )
              })}
            </div>
          )}
          {tagFilters.exclude.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tagFilters.exclude.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-red-900/20 text-red-300 border border-red-800/40">
                  −{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {task.supports_check && (
          <Button
            size="xs"
            className="bg-amber-700 hover:bg-amber-600 text-white"
            onClick={() => onRun(true)}
            disabled={disabled}
          >
            {running ? 'Checking…' : 'Check'}
          </Button>
        )}
        {!task.check_only && (
          <Button
            size="xs"
            className="bg-green-700 hover:bg-green-600 text-white"
            onClick={() => onRun(false)}
            disabled={disabled}
            title={isOpenapiScoped ? 'Merge just this slice into the canonical openapi output (no clobber)' : undefined}
          >
            {running
              ? (isOpenapiScoped ? 'Merging…' : 'Running…')
              : (isOpenapiScoped ? 'Merge' : 'Run')}
          </Button>
        )}
        {task.check_only && (
          <span className="text-[10px] text-gray-500 italic">
            Check-only — verifies an invariant; it doesn&apos;t generate output.
          </span>
        )}
        {task.timeout_ms && (
          <span className="text-[10px] text-gray-500 italic">
            · times out after {formatTimeout(task.timeout_ms)}
          </span>
        )}
      </div>

      {/* Last-run line (#5) — only shown if this task has been run in the session. */}
      {entry && (
        <div className="text-[10px] text-gray-500">
          Last {entry.checkMode ? 'check' : 'run'}: {formatAgo(entry.ranAt, Date.now())}
          {' · '}
          {formatDuration(entry.result.duration_ms)}
          {entry.result.exit_code !== undefined && entry.result.exit_code !== null && (
            <> {' · '} exit={entry.result.exit_code}</>
          )}
        </div>
      )}

      {/* CLI snippet (#2) — what to type in a terminal. */}
      <div className="border border-border rounded p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">CLI</div>
        {task.supports_check && (
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
              {cliCommand(task, true)}
            </code>
            <CopyButton text={cliCommand(task, true)} />
          </div>
        )}
        {!task.check_only && (
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
              {cliCommand(task, false)}
            </code>
            <CopyButton text={cliCommand(task, false)} />
          </div>
        )}
        {/* Manifest args — flags the runner appends to `script` invocation that
            aren't visible from the user-facing CLI invocation above. Skipped
            when there's nothing to show beyond the CLI itself. */}
        {task.args && task.args.length > 0 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-gray-500 shrink-0">args</span>
            <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
              {task.args.join(' ')}
            </code>
          </div>
        )}
      </div>

      {entry?.result && <ResultBox result={entry.result} />}
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

function DatabasesSection({ onPendingCountChange }: { onPendingCountChange?: (n: number) => void }) {
  const [databases, setDatabases] = useState<MigrationDatabase[]>([])
  const [statuses, setStatuses] = useState<Record<string, MigrationStatus>>({})
  const [backupInfo, setBackupInfo] = useState<Record<string, DbBackupInfo>>({})
  const [backups, setBackups] = useState<DbBackupEntry[]>([])
  const [busy, setBusy] = useState<{ dbId: string; kind: 'migration' | 'backup' } | null>(null)
  const [statusRefreshing, setStatusRefreshing] = useState(false)
  const [lastMigResult, setLastMigResult] = useState<MigrationResult | null>(null)
  const [lastBackupResult, setLastBackupResult] = useState<DbBackupResult | null>(null)

  const refreshStatus = useCallback(async (dbId: string) => {
    setStatusRefreshing(true)
    try {
      invalidateMigrationStatus(dbId)
      const s = await getMigrationStatus(dbId, true)
      setStatuses((prev) => ({ ...prev, [dbId]: s }))
    } catch {
      // ignore — detail panel will show '—'
    } finally {
      setStatusRefreshing(false)
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
      // useSidebarNav auto-selects the first section once `sections` populates.
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

  // SCL sections — flat list (databases have no children). Status dot in the
  // icon slot mirrors the per-row colored pill: amber when there are pending
  // migrations, green when up-to-date, gray when status hasn't loaded yet.
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    return databases.map((db) => {
      const status = statuses[db.id]
      const pending = status?.pending?.length ?? 0
      const state = !status ? undefined : pending > 0 ? 'stale' : 'fresh'
      return {
        id: `db:${db.id}`,
        label: pending > 0 ? `${db.label} (${pending} pending)` : db.label,
        icon: <StatusDot state={state} />,
      }
    })
  }, [databases, statuses])

  // Report the total pending count up so the parent tab can badge it.
  const totalPending = useMemo(
    () => Object.values(statuses).reduce((sum, s) => sum + (s.pending?.length ?? 0), 0),
    [statuses],
  )
  useEffect(() => { onPendingCountChange?.(totalPending) }, [totalPending, onPendingCountChange])

  const nav = useSidebarNav({ sections, storageKey: 'launcher-databases-active' })

  // Resolve the active database from the rail state (`db:<id>` namespace).
  const selectedId = nav.activeSectionId.startsWith('db:') ? nav.activeSectionId.slice(3) : null
  const selected = selectedId ? databases.find((db) => db.id === selectedId) ?? null : null
  const selectedStatus = selected ? statuses[selected.id] : undefined
  const selectedInfo = selected ? backupInfo[selected.id] : undefined
  const selectedBackups = selected ? backups.filter((b) => b.db_id === selected.id) : []
  const dbBusy = busy?.dbId === selected?.id

  // Migration verdict — `alembic current` appends "(head)" only when the DB is
  // at head, so it's a robust at-head signal even if the verbose-history parse
  // (which feeds `pending`) ever fails. Pending count wins when present.
  const selectedPendingCount = selectedStatus?.pending?.length ?? 0
  const selectedAtHead = !!selectedStatus?.current_revision?.includes('(head)')
  const migVerdict: { tone: StatusTone; label: string } | null =
    !selectedStatus ? null :
    selectedPendingCount > 0 ? { tone: 'warning', label: `⬆ ${selectedPendingCount} behind` } :
    selectedAtHead ? { tone: 'success', label: '✓ up to date' } :
    { tone: 'muted', label: 'unknown' }

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
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      onSelectSection={nav.selectSection}
      sidebarTitle="Databases"
      sidebarWidth="w-52"
      variant="dark"
      resizable
      persistKey="launcher-databases-sidebar"
      contentClassName="overflow-auto p-3 space-y-4 min-w-0"
      className="h-full"
    >
      {!selected ? (
        <EmptyState message="Select a database on the left." />
      ) : (
          <>
            {/* Header */}
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-gray-100">{selected.label}</div>
              <div className="flex items-center gap-1.5">
                <span className="flex-1 text-[10px] text-gray-500 font-mono truncate select-text">{selected.db_url}</span>
                <CopyButton text={selected.db_url} />
              </div>
            </div>

            {/* Health panel */}
            <HealthPanel dbId={selected.id} />

            {/* Migrations panel */}
            <div className="border border-border rounded p-2 space-y-2">
              <SectionHeader
                trailing={
                  <span className="flex items-center gap-1.5">
                    {migVerdict && <StatusPill tone={migVerdict.tone} dot size="xs">{migVerdict.label}</StatusPill>}
                    <Button size="xs" variant="ghost" disabled={statusRefreshing} onClick={() => refreshStatus(selected.id)} className="text-gray-400" title="Refresh status">
                      <span className={statusRefreshing ? 'inline-block animate-spin' : 'inline-block'}>&#x21bb;</span>
                    </Button>
                  </span>
                }
              >
                Migrations
              </SectionHeader>
              <div className="text-[11px]">
                <span className="text-gray-500">Current:</span>{' '}
                <span className="text-gray-200 font-mono">{selectedStatus?.current_revision ?? '…'}</span>
                {selectedStatus?.current_message && (
                  <div className="text-gray-400 font-mono truncate" title={selectedStatus.current_message}>
                    {selectedStatus.current_message}
                  </div>
                )}
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
                <Button size="xs" className="bg-green-700 hover:bg-green-600 text-white" disabled={dbBusy || (selectedAtHead && selectedPendingCount === 0)} title={selectedAtHead && selectedPendingCount === 0 ? 'Already at head — nothing to upgrade' : undefined} onClick={() => runMigration('upgrade', selected.id)}>Upgrade</Button>
                <Button size="xs" className="bg-amber-700 hover:bg-amber-600 text-white" disabled={dbBusy} onClick={() => runMigration('downgrade', selected.id)}>Down</Button>
                <Button size="xs" className="bg-blue-700 hover:bg-blue-600 text-white" disabled={dbBusy} onClick={() => runMigration('stamp', selected.id)}>Stamp</Button>
                <Button size="xs" className="bg-purple-700 hover:bg-purple-600 text-white" disabled={dbBusy} onClick={() => runMigration('merge', selected.id)}>Merge</Button>
              </div>
              {lastMigResult && busy?.kind !== 'backup' && <ResultBox result={lastMigResult} />}
            </div>

            {/* Squash wizard */}
            <SquashPanel dbId={selected.id} />

            {/* Backups panel */}
            <div className="border border-border rounded p-2 space-y-2">
              <SectionHeader
                trailing={
                  <span className="flex items-center gap-1.5">
                    <StatusPill tone={backupModeTone} dot size="xs">{backupModeLabel}</StatusPill>
                    <Button size="xs" variant="ghost" onClick={refreshBackupsList} className="text-gray-400" title="Refresh list">&#x21bb;</Button>
                  </span>
                }
              >
                Backups
              </SectionHeader>
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
                <SectionHeader className="mb-1">Existing ({selectedBackups.length})</SectionHeader>
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
          </>
        )}
    </SidebarContentLayout>
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
    <DisclosureSection
      size="sm"
      isOpen={expanded}
      onToggle={setExpanded}
      className="border border-border rounded"
      headerClassName="px-2 py-1.5 text-[11px] font-medium text-gray-300 hover:bg-surface-raised/30"
      label="Health"
      badge={
        <span className="flex items-center gap-1.5">
          <StatusPill tone={health?.ok ? 'success' : (health ? 'warning' : 'muted')} dot size="xs">
            {loading ? 'loading…' : sizeLabel}
          </StatusPill>
          {tableLabel && <span className="text-[10px] text-gray-500">· {tableLabel}</span>}
        </span>
      }
    >
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
    </DisclosureSection>
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
    <DisclosureSection
      size="sm"
      isOpen={expanded}
      onToggle={setExpanded}
      className="border border-border rounded"
      headerClassName="px-2 py-1.5 text-[11px] font-medium text-gray-300 hover:bg-surface-raised/30"
      label="Squash wizard"
      badge={hasBaseline ? <StatusPill tone="warning" dot size="xs">baseline ready</StatusPill> : undefined}
    >
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
    </DisclosureSection>
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

/** Per-buildable run history (mirrors codegen's `results` map at line 174). */
type BuildableResultEntry = { result: BuildResult; ranAt: number }

/**
 * Small colored dot used as the rail-row icon (left of label). Replaces the
 * launcher-local pattern of a `StatusPill` on the right of each row, because
 * `HierarchicalSidebarNav` keeps the rail purely nav (icon + label) — per-row
 * state badges are the canonical pixsim7 anti-pattern. See
 * `apps/main/src/features/settings/components/shared/MaintenanceDashboard.tsx`
 * line 1530 for the same reasoning.
 */
function StatusDot({ state, building }: { state?: string; building?: boolean }) {
  const cls = building
    ? 'bg-blue-400 animate-pulse'
    : state === 'fresh' ? 'bg-green-500'
    // `stale` gets an amber halo + pulse so it reads as "needs attention" at a
    // glance — a flat 8px amber dot is nearly indistinguishable from the green
    // `fresh` dot. Used for pending migrations and stale buildables alike.
    : state === 'stale' ? 'bg-amber-400 ring-2 ring-amber-400/40 shadow-[0_0_4px_rgba(251,191,36,0.7)] animate-pulse'
    : state === 'not_built' ? 'bg-red-500'
    : 'bg-gray-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
}

function BuildablesSection({
  progress, setProgress,
}: { progress: BuildProgress; setProgress: (p: BuildProgress) => void }) {
  const [buildables, setBuildables] = useState<Buildable[]>([])
  const [results, setResults] = useState<Record<string, BuildableResultEntry>>({})
  const [lastBuiltPkg, setLastBuiltPkg] = useState<string | null>(null)
  const [batch, setBatch] = useState<{ running: boolean; done: number; total: number; failed: string[] } | null>(null)

  // Derive "currently building single pkg" from lifted progress state
  const buildingPkg = progress.kind === 'single' || progress.kind === 'batch' ? progress.pkg ?? null : null
  const anyBusy = progress.kind !== 'idle'

  useEffect(() => { getBuildables().then(setBuildables) }, [])

  const groups = useMemo(() => buildGroups(buildables), [buildables])
  const totalStale = useMemo(() => countNeedsBuild(buildables), [buildables])

  // Map groups → SidebarContentLayout sections. SCL is two-level (sections
  // + children), so sub-grouped categories (packages ≥ PACKAGE_SUBGROUP_THRESHOLD)
  // get split into virtual top-level sections labeled `category · prefix`.
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const buildSection = (g: BuildableGroup, label: string): SidebarContentLayoutSection => {
      const items = sortItems(g.items)
      const stale = countNeedsBuild(g.items)
      const sectionLabel = stale > 0
        ? `${label} (${g.items.length} · ${stale} stale)`
        : `${label} (${g.items.length})`
      return {
        id: g.id,
        label: sectionLabel,
        children: items.map((b) => ({
          id: `b:${b.id}`,
          label: b.title,
          icon: <StatusDot state={b.build_status?.state} building={buildingPkg === b.package} />,
        })),
      }
    }
    const out: SidebarContentLayoutSection[] = []
    for (const g of groups) {
      if (g.subgroups) {
        for (const sg of g.subgroups) out.push(buildSection(sg, `${g.label} · ${sg.label}`))
      } else {
        out.push(buildSection(g, g.label))
      }
    }
    return out
  }, [groups, buildingPkg])

  const nav = useSidebarNav({
    sections,
    storageKey: 'launcher-buildables-active',
  })

  const handleBuild = useCallback(async (pkg: string) => {
    setProgress({ kind: 'single', pkg })
    setLastBuiltPkg(pkg)
    try {
      const r = await buildPackage(pkg)
      setResults((prev) => ({ ...prev, [pkg]: { result: r, ranAt: Date.now() } }))
      // Force-refresh to get updated build_status
      getBuildables(true).then(setBuildables)
    } finally {
      setProgress({ kind: 'idle' })
    }
  }, [setProgress])

  const rebuildAllStale = useCallback(async () => {
    const pool = buildables.filter(isNeedsBuild)
    if (!pool.length) return
    setBatch({ running: true, done: 0, total: pool.length, failed: [] })
    const failed: string[] = []
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i]
      setProgress({ kind: 'batch', pkg: b.package, done: i, total: pool.length })
      try {
        const res = await buildPackage(b.package)
        setResults((prev) => ({ ...prev, [b.package]: { result: res, ranAt: Date.now() } }))
        if (!res.ok) failed.push(b.package)
      } catch {
        failed.push(b.package)
      }
      setBatch({ running: i < pool.length - 1, done: i + 1, total: pool.length, failed: [...failed] })
    }
    setProgress({ kind: 'idle' })
    getBuildables(true).then(setBuildables)
  }, [buildables, setProgress])

  const lastEntry = lastBuiltPkg ? results[lastBuiltPkg] : null
  const justBuiltLauncher = !!lastEntry?.result.ok && lastBuiltPkg === '@pixsim7/launcher'

  // Resolve the active buildable from the rail child id (`b:<id>` namespace).
  const selectedBuildableId = nav.activeChildId?.startsWith('b:') ? nav.activeChildId.slice(2) : null
  const selected = selectedBuildableId ? buildables.find((b) => b.id === selectedBuildableId) ?? null : null
  const selectedEntry = selected ? results[selected.package] ?? null : null

  return (
    <div className="h-full flex flex-col">
      {/* Sticky toolbar — spans both panes (parity with codegen/databases). */}
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
            onClick={rebuildAllStale}
            disabled={anyBusy || totalStale === 0}
          >
            {batch?.running ? `Building ${batch.done}/${batch.total}...` : `Rebuild stale (${totalStale})`}
          </Button>
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

        {justBuiltLauncher && (
          <div className="flex items-center gap-2 p-2 rounded border border-blue-800/50 bg-blue-900/20 text-[11px] text-blue-200">
            <span className="flex-1">Launcher UI rebuilt - reload to apply. (Tab state will reset.)</span>
            <Button size="xs" variant="primary" onClick={() => window.location.reload()}>Reload now</Button>
          </div>
        )}
      </div>

      {/* Master-detail via the canonical shared.ui layout (used by 26+ files
          in main-app, incl. CodegenDevPage). The rail collapse + drag-resize
          + active-id persistence come for free. */}
      <SidebarContentLayout
        sections={sections}
        activeSectionId={nav.activeSectionId}
        activeChildId={nav.activeChildId}
        onSelectSection={nav.selectSection}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle="Buildables"
        sidebarWidth="w-52"
        variant="dark"
        resizable
        persistKey="launcher-buildables-sidebar"
        contentClassName="overflow-auto p-3 min-w-0"
        className="flex-1 min-h-0"
      >
        {!selected ? (
          <EmptyState message="Select a buildable on the left." />
        ) : (
          <BuildableDetail
            b={selected}
            entry={selectedEntry}
            building={buildingPkg === selected.package}
            anyBusy={anyBusy}
            onBuild={() => handleBuild(selected.package)}
          />
        )}
      </SidebarContentLayout>
    </div>
  )
}

// ── Buildables — detail pane (mirror CodegenTaskDetail at line 476) ──

function BuildableDetail({
  b, entry, building, anyBusy, onBuild,
}: {
  b: Buildable
  entry: BuildableResultEntry | null
  building: boolean
  anyBusy: boolean
  onBuild: () => void
}) {
  const statusPill = buildStateToPill(b.build_status)
  const tags = b.tags.filter((t) => t !== b.category)
  const status = b.build_status

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-100">{b.title}</span>
          {statusPill}
          <Badge color="blue" className="text-[9px]">{b.category}</Badge>
          {tags.map((t) => (
            <Badge key={t} color="blue" className="text-[9px]">{t}</Badge>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 font-mono select-text break-all">{b.package}</div>
        {b.description && <div className="text-[11px] text-gray-400">{b.description}</div>}
      </div>

      {/* Source / output paths panel — same idiom as codegen Output panel (line 532). */}
      <div className="border border-border rounded p-2 space-y-1.5">
        <SectionHeader>Source</SectionHeader>
        <div className="flex items-center gap-1.5">
          <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
            {b.directory}
          </code>
          <CopyButton text={b.directory} />
        </div>
        {status?.output_dir && (
          <>
            <SectionHeader className="pt-1">Output</SectionHeader>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 text-[10px] font-mono bg-surface-raised border border-border rounded px-1.5 py-1 text-gray-300 select-text break-all">
                {status.output_dir}
              </code>
              <CopyButton text={status.output_dir} />
            </div>
          </>
        )}
        {status?.build_modified && (
          <div className="text-[10px] text-gray-500">
            Last built {formatRelativeTime(status.build_modified)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="xs"
          className="bg-green-700 hover:bg-green-600 text-white"
          onClick={onBuild}
          disabled={anyBusy}
        >
          {building ? 'Building…' : 'Build'}
        </Button>
      </div>

      {/* Last-run line — mirror codegen line 668. */}
      {entry && (
        <div className="text-[10px] text-gray-500">
          Last build: {formatAgo(entry.ranAt, Date.now())}
          {' · '}
          {formatDuration(entry.result.duration_ms)}
          {entry.result.exit_code !== undefined && entry.result.exit_code !== null && (
            <> {' · '} exit={entry.result.exit_code}</>
          )}
        </div>
      )}

      {entry?.result && <ResultBox result={entry.result} />}
    </div>
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
      <Checkbox checked={!!settings[key]} onChange={(e) => update(key, e.target.checked)} />
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
      <CollapsiblePanel
        title="Launcher"
        persistKey="launcher:settings:launcher"
        contentClassName="space-y-2"
      >
        <label className="flex items-center gap-2 text-[11px]">
          <Checkbox checked={isDev} onChange={toggleDevMode} />
          <span className="text-gray-300">Dev mode (Vite HMR on :3100)</span>
          {isDev && <span className="text-amber-400 text-[9px]">DEV</span>}
        </label>

        <div className="border-t border-border my-2" />

        {toggle('stop_services_on_exit', 'Stop services when launcher exits')}
        {toggle('clear_logs_on_restart', 'Clear logs on service start/restart')}
        {toggle('auto_refresh_logs', 'Auto-refresh DB logs')}
        {toggle('window_always_on_top', 'Window always on top')}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Debug (legacy)"
        persistKey="launcher:settings:debug-legacy"
        contentClassName="space-y-1"
      >
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
      </CollapsiblePanel>

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
