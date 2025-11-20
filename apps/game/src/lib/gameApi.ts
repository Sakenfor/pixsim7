import type { Scene } from '@pixsim7/shared.types'
import type { GameLocationDetail } from './gameWorldTypes'

export interface GameSessionDTO {
  id: number
  user_id: number
  scene_id: number
  current_node_id: number
  flags: Record<string, any>
  relationships: Record<string, any>
  world_time: number
}

const getGameApiBase = (): string => {
  // Use unified backend API (Phase 1: Game backend consolidated into main backend)
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined
  return envBase || 'http://localhost:8001'
}

type HttpMethod = 'GET' | 'POST'

async function request<T>(
  path: string,
  options: {
    method?: HttpMethod
    body?: any
    token?: string
    signal?: AbortSignal
  } = {},
): Promise<T> {
  const base = getGameApiBase()
  const url = `${base}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Game API ${res.status} ${res.statusText} at ${path}: ${text}`)
  }
  return (await res.json()) as T
}

export async function createGameSession(params: {
  sceneId: number
  token?: string
  signal?: AbortSignal
}): Promise<GameSessionDTO> {
  return request<GameSessionDTO>('/api/v1/game/sessions', {
    method: 'POST',
    token: params.token,
    signal: params.signal,
    body: {
      scene_id: params.sceneId,
    },
  })
}

export async function getGameSession(params: {
  sessionId: number
  token?: string
  signal?: AbortSignal
}): Promise<GameSessionDTO> {
  return request<GameSessionDTO>(`/api/v1/game/sessions/${params.sessionId}`, {
    method: 'GET',
    token: params.token,
    signal: params.signal,
  })
}

export async function advanceGameSession(params: {
  sessionId: number
  edgeId: number
  token?: string
  signal?: AbortSignal
}): Promise<GameSessionDTO> {
  return request<GameSessionDTO>(`/api/v1/game/sessions/${params.sessionId}/advance`, {
    method: 'POST',
    token: params.token,
    signal: params.signal,
    body: {
      edge_id: params.edgeId,
    },
  })
}

export async function fetchSceneById(params: {
  sceneId: string | number
  token?: string
  signal?: AbortSignal
}): Promise<Scene> {
  return request<Scene>(`/api/v1/game/scenes/${params.sceneId}`, {
    method: 'GET',
    token: params.token,
    signal: params.signal,
  })
}

export async function fetchLocationById(params: {
  locationId: number
  token?: string
  signal?: AbortSignal
}): Promise<GameLocationDetail> {
  return request<GameLocationDetail>(`/api/v1/game/locations/${params.locationId}`, {
    method: 'GET',
    token: params.token,
    signal: params.signal,
  })
}
