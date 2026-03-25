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

export async function getCodegenTasks(): Promise<CodegenTask[]> {
  const res = await fetch('/codegen/tasks')
  if (!res.ok) return []
  const data = await res.json()
  return data.tasks ?? []
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

export async function getBuildables(): Promise<Buildable[]> {
  const res = await fetch('/buildables')
  if (!res.ok) return []
  const data = await res.json()
  return data.buildables ?? []
}

// ── Migrations ──

export interface MigrationNode {
  revision: string
  message: string
  is_head: boolean
}

export interface MigrationStatus {
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

export async function getMigrationStatus(): Promise<MigrationStatus> {
  const res = await fetch('/migrations/status')
  if (!res.ok) throw new Error('Failed to get migration status')
  return res.json()
}

export async function runMigrationAction(action: 'upgrade' | 'downgrade' | 'stamp' | 'merge'): Promise<MigrationResult> {
  const res = await fetch(`/migrations/${action}`, { method: 'POST' })
  return res.json()
}

export async function getMigrationHistory(): Promise<MigrationResult> {
  const res = await fetch('/migrations/history')
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
