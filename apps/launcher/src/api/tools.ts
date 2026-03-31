/**
 * Codegen + Buildables API client.
 * Talks to the launcher API on :8100.
 */

// ── Codegen ──

export interface CodegenServiceDep {
  service: string
  label: string
  reason: string
}

export interface CodegenTask {
  id: string
  description: string
  script: string
  supports_check: boolean
  groups: string[]
  requires_service?: CodegenServiceDep | null
  service_running?: boolean
}

export interface CodegenRunResult {
  task_id: string
  ok: boolean
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

let _codegenCache: { tasks: CodegenTask[]; ts: number } | null = null
const CODEGEN_CACHE_TTL = 15_000  // 15s — service_running status changes

export async function getCodegenTasks(): Promise<CodegenTask[]> {
  if (_codegenCache && Date.now() - _codegenCache.ts < CODEGEN_CACHE_TTL) return _codegenCache.tasks
  const res = await fetch('/codegen/tasks')
  if (!res.ok) return _codegenCache?.tasks ?? []
  const tasks: CodegenTask[] = (await res.json()).tasks ?? []
  _codegenCache = { tasks, ts: Date.now() }
  return tasks
}

export async function runCodegenTask(taskId: string, check = false): Promise<CodegenRunResult> {
  const res = await fetch('/codegen/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, check }),
  })
  return res.json()
}

// ── Buildables ──

export interface BuildStatus {
  state: 'not_built' | 'stale' | 'fresh' | 'unknown'
  output_dir?: string | null
  source_modified?: string | null
  build_modified?: string | null
}

export interface Buildable {
  id: string
  title: string
  package: string
  directory: string
  description: string
  command: string
  args: string[]
  category: string
  tags: string[]
  build_status?: BuildStatus
}

let _buildablesCache: Buildable[] | null = null
let _buildablesCacheTs = 0
const _BUILDABLES_TTL = 30_000 // 30s

export async function getBuildables(force = false): Promise<Buildable[]> {
  const now = Date.now()
  if (!force && _buildablesCache && (now - _buildablesCacheTs) < _BUILDABLES_TTL) return _buildablesCache
  const res = await fetch(force ? '/buildables?refresh=true' : '/buildables')
  if (!res.ok) return []
  const items: Buildable[] = (await res.json()).buildables ?? []
  _buildablesCache = items
  _buildablesCacheTs = now
  return items
}

export interface BuildResult {
  ok: boolean
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

export async function buildPackage(packageName: string): Promise<BuildResult> {
  const res = await fetch(`/buildables/${encodeURIComponent(packageName)}/build`, { method: 'POST' })
  _buildablesCache = null  // invalidate so next fetch gets fresh build_status
  return res.json()
}

// ── Migrations ──

export interface MigrationDatabase {
  id: string
  label: string
  config: string
  db_url: string
  script_location: string
}

export interface MigrationNode {
  revision: string
  message: string
  is_head: boolean
}

export interface MigrationStatus {
  db_id: string
  label: string
  current_revision: string
  heads: string
  pending: MigrationNode[]
  pending_error: string | null
}

export interface MigrationResult {
  ok: boolean
  result?: string
  error?: string
}

let _dbCache: MigrationDatabase[] | null = null

export async function getMigrationDatabases(): Promise<MigrationDatabase[]> {
  if (_dbCache) return _dbCache
  const res = await fetch('/migrations/databases')
  if (!res.ok) return []
  const dbs: MigrationDatabase[] = (await res.json()).databases ?? []
  _dbCache = dbs
  return dbs
}

const _statusCache = new Map<string, MigrationStatus>()

export async function getMigrationStatus(dbId: string = 'main', fresh = false): Promise<MigrationStatus> {
  if (!fresh && _statusCache.has(dbId)) return _statusCache.get(dbId)!
  const res = await fetch(`/migrations/status?db_id=${dbId}`)
  if (!res.ok) throw new Error('Failed to get migration status')
  const status: MigrationStatus = await res.json()
  _statusCache.set(dbId, status)
  return status
}

/** Invalidate cached status for a database (call after running an action). */
export function invalidateMigrationStatus(dbId: string) {
  _statusCache.delete(dbId)
}

export async function runMigrationAction(action: 'upgrade' | 'downgrade' | 'stamp' | 'merge', dbId: string = 'main'): Promise<MigrationResult> {
  const res = await fetch(`/migrations/${action}?db_id=${dbId}`, { method: 'POST' })
  return res.json()
}

// ── Settings ──

export async function getSettings(): Promise<Record<string, unknown>> {
  const res = await fetch('/settings')
  if (!res.ok) return {}
  return res.json()
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await fetch('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}
