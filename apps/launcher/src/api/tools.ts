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

// ── Database tools (backup/restore/health) ──

export interface DbBackupEntry {
  filename: string
  path: string
  db_id: string
  size_bytes: number
  created_at: string
}

export type DbBackupMode = 'docker' | 'local' | 'unavailable'

export interface DbBackupInfo {
  db_id: string
  mode: DbBackupMode
  container?: string
  pg_dump_path?: string
  reason?: string
}

export interface DbBackupResult {
  ok: boolean
  db_id?: string
  mode?: DbBackupMode
  filename?: string
  path?: string
  size_bytes?: number
  warnings?: string | null
  error?: string
}

export async function listDbBackups(): Promise<DbBackupEntry[]> {
  const res = await fetch('/databases/backups')
  if (!res.ok) return []
  return (await res.json()).backups ?? []
}

export interface DbHealthTable {
  schema: string
  name: string
  total_bytes: number
  heap_bytes: number
  row_estimate: number
}

export interface DbHealth {
  ok: boolean
  db_id: string
  size_bytes?: number
  size_pretty?: string
  table_count?: number | null
  top_tables?: DbHealthTable[]
  recent_migrations?: { line: string }[]
  recent_migrations_error?: string | null
  error?: string
}

export async function getDbHealth(dbId: string): Promise<DbHealth> {
  try {
    const res = await fetch(`/databases/${encodeURIComponent(dbId)}/health`)
    if (!res.ok) {
      return { ok: false, db_id: dbId, error: `HTTP ${res.status} — restart the launcher backend?` }
    }
    return await res.json()
  } catch (e) {
    return { ok: false, db_id: dbId, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface DbTableColumn {
  name: string
  type: string
  nullable: boolean
  default?: string | null
}

export interface DbTableIndex {
  name: string
  definition: string
}

export interface DbTableDetail {
  ok: boolean
  schema?: string
  name?: string
  columns?: DbTableColumn[]
  indexes?: DbTableIndex[]
  exact_row_count?: number | null
  estimated_row_count?: number | null
  total_bytes?: number
  heap_bytes?: number
  error?: string
}

export async function inspectTable(dbId: string, schema: string, name: string): Promise<DbTableDetail> {
  try {
    const res = await fetch(
      `/databases/${encodeURIComponent(dbId)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(name)}`,
    )
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} — restart the launcher backend?` }
    }
    return await res.json()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getBackupInfo(dbId: string): Promise<DbBackupInfo> {
  try {
    const res = await fetch(`/databases/${encodeURIComponent(dbId)}/backup-info`)
    if (!res.ok) {
      return {
        db_id: dbId,
        mode: 'unavailable',
        reason: `probe failed (HTTP ${res.status}) — restart the launcher backend?`,
      }
    }
    return await res.json()
  } catch (e) {
    return {
      db_id: dbId,
      mode: 'unavailable',
      reason: `probe failed (${e instanceof Error ? e.message : String(e)})`,
    }
  }
}

export async function backupDatabase(dbId: string): Promise<DbBackupResult> {
  try {
    const res = await fetch(`/databases/${encodeURIComponent(dbId)}/backup`, { method: 'POST' })
    if (!res.ok) {
      return { ok: false, db_id: dbId, error: `HTTP ${res.status} — is the launcher backend up-to-date?` }
    }
    return await res.json()
  } catch (e) {
    return { ok: false, db_id: dbId, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Squash wizard ──

export interface SquashStatus {
  db_id: string
  exists: boolean
  path?: string
  size_bytes?: number
  created_at?: string
  reason?: string
}

export interface SquashGenerateResult {
  db_id: string
  ok: boolean
  revision?: string
  path?: string
  size_bytes?: number
  schema_size_bytes?: number
  warnings?: string | null
  error?: string
}

export interface SquashVerifyResult {
  db_id: string
  ok: boolean
  identical?: boolean
  throwaway_dbname?: string
  live_schema_lines?: number
  baseline_schema_lines?: number
  diff_preview?: string[]
  error?: string
}

export async function getSquashStatus(dbId: string): Promise<SquashStatus> {
  try {
    const res = await fetch(`/squash/${encodeURIComponent(dbId)}/status`)
    if (!res.ok) {
      return { db_id: dbId, exists: false, reason: `HTTP ${res.status} — restart the launcher backend?` }
    }
    return await res.json()
  } catch (e) {
    return { db_id: dbId, exists: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function generateSquashBaseline(dbId: string): Promise<SquashGenerateResult> {
  try {
    const res = await fetch(`/squash/${encodeURIComponent(dbId)}/generate`, { method: 'POST' })
    if (!res.ok) {
      return { db_id: dbId, ok: false, error: `HTTP ${res.status} — is the launcher backend up-to-date?` }
    }
    return await res.json()
  } catch (e) {
    return { db_id: dbId, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function verifySquashBaseline(dbId: string): Promise<SquashVerifyResult> {
  try {
    const res = await fetch(`/squash/${encodeURIComponent(dbId)}/verify`, { method: 'POST' })
    if (!res.ok) {
      return { db_id: dbId, ok: false, error: `HTTP ${res.status} — is the launcher backend up-to-date?` }
    }
    return await res.json()
  } catch (e) {
    return { db_id: dbId, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function discardSquashBaseline(dbId: string): Promise<{ ok: boolean; deleted?: boolean; path?: string; error?: string }> {
  try {
    const res = await fetch(`/squash/${encodeURIComponent(dbId)}/baseline`, { method: 'DELETE' })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} — is the launcher backend up-to-date?` }
    }
    return await res.json()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface SquashArchiveResult {
  db_id: string
  ok: boolean
  archive_dir?: string
  moved_count?: number
  skipped_count?: number
  sample_moved?: string[]
  errors?: { file: string; error: string }[]
  stamp_ok?: boolean
  stamp_revision?: string
  stamp_output?: string
  error?: string
}

export async function archiveOldMigrations(dbId: string): Promise<SquashArchiveResult> {
  try {
    const res = await fetch(`/squash/${encodeURIComponent(dbId)}/archive-old`, { method: 'POST' })
    if (!res.ok) {
      return { db_id: dbId, ok: false, error: `HTTP ${res.status} — is the launcher backend up-to-date?` }
    }
    return await res.json()
  } catch (e) {
    return { db_id: dbId, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
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
