/**
 * Launcher API client.
 *
 * In dev mode Vite proxies /services, /logs, etc. to localhost:8100.
 * In prod the webview shell serves both the static files and the API
 * from the same origin, so relative URLs work directly.
 */

const API_BASE = ''  // relative — works with both Vite proxy and prod

async function request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? body.error ?? 'API request failed')
  }
  return res.json()
}

// ── Services ────────────────────────────────────────────────────────

export interface ServiceState {
  key: string
  title: string
  status: 'stopped' | 'starting' | 'running' | 'stopping'
  health: 'stopped' | 'starting' | 'healthy' | 'unhealthy' | 'unknown'
  pid: number | null
  last_error: string
  tool_available: boolean
  tool_check_message: string
  url: string | null
  dev_peer_of: string | null
  category: string | null
  extras: Record<string, unknown> | null
}

export interface ServicesListResponse {
  services: ServiceState[]
  total: number
}

export interface ActionResponse {
  success: boolean
  message: string
  service_key: string
}

export const getServices = () => request<ServicesListResponse>('/services')
export const getService = (key: string) => request<ServiceState>(`/services/${key}`)
export const startService = (key: string) => request<ActionResponse>(`/services/${key}/start`, { method: 'POST' })
export const stopService = (key: string, graceful = true) =>
  request<ActionResponse>(`/services/${key}/stop`, { method: 'POST', body: JSON.stringify({ graceful }) })
export const restartService = (key: string) => request<ActionResponse>(`/services/${key}/restart`, { method: 'POST' })
export const startAllServices = () => request<ActionResponse>('/services/start-all', { method: 'POST' })
export const stopAllServices = (graceful = true) =>
  request<ActionResponse>('/services/stop-all', { method: 'POST', body: JSON.stringify({ graceful }) })

// ── Service Settings ────────────────────────────────────────────────

export interface ToolOption {
  name: string
  description?: string
}

export interface OptionGroup {
  group: string
  label: string
  tools: ToolOption[]
}

export interface SettingField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select'
  label: string
  description?: string
  default: unknown
  options?: string[]
  option_groups?: OptionGroup[]
  separator?: string
  arg_map?: string
  env_map?: string
  env_export?: string
}

export interface ServiceSettingsResponse {
  service_key: string
  schema: SettingField[]
  values: Record<string, unknown>
}

export const getServiceSettings = (key: string) =>
  request<ServiceSettingsResponse>(`/services/${key}/settings`)

export const updateServiceSettings = (key: string, values: Record<string, unknown>) =>
  request<ServiceSettingsResponse>(`/services/${key}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({ values }),
  })

export const applyHookConfig = (hookTools: string[], mcpAllowed: boolean = true) =>
  request<{ ok: boolean; path: string; message: string }>('/services/ai-client/apply-hook-config', {
    method: 'POST',
    body: JSON.stringify({ hook_tools: hookTools, mcp_allowed: mcpAllowed }),
  })

// ── Logs ────────────────────────────────────────────────────────────

export interface LogsResponse {
  service_key: string
  lines: string[]
  total: number
}

export const getLogs = (key: string, tail = 200) =>
  request<LogsResponse>(`/logs/${key}?tail=${tail}`)
export const clearLogs = (key: string) =>
  request(`/logs/${key}`, { method: 'DELETE' })

// ── Health ──────────────────────────────────────────────────────────

export const getHealth = () => request('/health')

// ── Desktop Window ─────────────────────────────────────────────────

export const checkWindowAvailable = () => request<{ available: boolean }>('/window/available')
export const openWindow = (url: string, title: string) =>
  request<{ ok: boolean; window_id: string | null; message: string }>('/window/open', {
    method: 'POST',
    body: JSON.stringify({ url, title }),
  })

// ── Identity ───────────────────────────────────────────────────────

export interface IdentityStatus {
  exists: boolean
  username: string | null
  email: string | null
  backend_url: string | null
  keypair_id: string | null
  token_expires_at: number | null
  token_valid: boolean
}

export interface SetupCreateRequest {
  username: string
  password: string
  email?: string
}

export interface SetupLinkRequest {
  backend_url: string
  username: string
  password: string
}

export interface SetupResponse {
  ok: boolean
  message: string
  username?: string
}

export interface RefreshTokenResponse {
  ok: boolean
  token_expires_at: number | null
  message: string
}

export interface BackendStatus {
  reachable: boolean
  status: string | null
  database: string | null
  redis: string | null
  providers: string[]
  api_version: string | null
  build_sha: string | null
  server_time: string | null
}

export interface LauncherStatus {
  version: string
  uptime_seconds: number
  managers: Record<string, boolean>
}

export interface SystemInfo {
  launcher: LauncherStatus
  backend: BackendStatus
  identity: IdentityStatus
}

export const getIdentity = () => request<IdentityStatus>('/identity')
export const getSystemInfo = () => request<SystemInfo>('/system-info')
export const refreshToken = () =>
  request<RefreshTokenResponse>('/identity/refresh-token', { method: 'POST' })
export const setupCreate = (body: SetupCreateRequest) =>
  request<SetupResponse>('/identity/setup/create', { method: 'POST', body: JSON.stringify(body) })
export const setupLink = (body: SetupLinkRequest) =>
  request<SetupResponse>('/identity/setup/link', { method: 'POST', body: JSON.stringify(body) })
