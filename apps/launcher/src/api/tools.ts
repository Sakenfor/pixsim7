/**
 * Codegen + Buildables API client.
 * Talks to the launcher API on :8100.
 */

// ── Codegen ──

export interface CodegenTask {
  id: string
  description: string
  script: string
  supports_check: boolean
  groups: string[]
}

export interface CodegenRunResult {
  task_id: string
  ok: boolean
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

let _codegenCache: CodegenTask[] | null = null

export async function getCodegenTasks(): Promise<CodegenTask[]> {
  if (_codegenCache) return _codegenCache
  const res = await fetch('/codegen/tasks')
  if (!res.ok) return []
  const tasks: CodegenTask[] = (await res.json()).tasks ?? []
  _codegenCache = tasks
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
}

let _buildablesCache: Buildable[] | null = null

export async function getBuildables(): Promise<Buildable[]> {
  if (_buildablesCache) return _buildablesCache
  const res = await fetch('/buildables')
  if (!res.ok) return []
  const items: Buildable[] = (await res.json()).buildables ?? []
  _buildablesCache = items
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

export async function getMigrationDatabases(): Promise<MigrationDatabase[]> {
  const res = await fetch('/migrations/databases')
  if (!res.ok) return []
  const data = await res.json()
  return data.databases ?? []
}

export async function getMigrationStatus(dbId: string = 'main'): Promise<MigrationStatus> {
  const res = await fetch(`/migrations/status?db_id=${dbId}`)
  if (!res.ok) throw new Error('Failed to get migration status')
  return res.json()
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
