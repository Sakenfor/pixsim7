import { apiClient } from './api/client';
import type { Scene } from '@pixsim7/types';

export interface GameLocationSummary {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
}

export interface GameHotspotDTO {
  id?: number;
  object_name: string;
  hotspot_id: string;
  linked_scene_id?: number | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcTalkConfig {
  npcId?: number | null; // Optional override; else use assigned NPC
  preferredSceneId?: number | null;
}

export interface PickpocketConfig {
  baseSuccessChance: number;
  detectionChance: number;
  onSuccessFlags?: string[];
  onFailFlags?: string[];
}

export interface NpcSlotInteractions {
  canTalk?: boolean;
  npcTalk?: NpcTalkConfig;
  canPickpocket?: boolean;
  pickpocket?: PickpocketConfig;
}

export interface NpcSlot2d {
  id: string;
  x: number; // Normalized 0-1 position
  y: number; // Normalized 0-1 position
  roles?: string[];
  fixedNpcId?: number | null;
  interactions?: NpcSlotInteractions;
}

export interface GameLocationDetail {
  id: number;
  name: string;
  asset_id?: number | null;
  default_spawn?: string | null;
  meta?: Record<string, unknown> | null;
  hotspots: GameHotspotDTO[];
}

export interface GameNpcSummary {
  id: number;
  name: string;
}

export interface NpcExpressionDTO {
  id?: number;
  state: string;
  asset_id: number;
  crop?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface NpcPresenceDTO {
  npc_id: number;
  location_id: number;
  state: Record<string, unknown>;
}

export interface GameWorldSummary {
  id: number;
  name: string;
}

export interface GameWorldDetail {
  id: number;
  name: string;
  meta?: Record<string, unknown> | null;
  world_time: number;
}

export interface GameSessionDTO {
  id: number;
  user_id: number;
  scene_id: number;
  current_node_id: number;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  world_time: number;
}

export async function listGameLocations(): Promise<GameLocationSummary[]> {
  const res = await apiClient.get<GameLocationSummary[]>('/game/locations');
  return res.data;
}

export async function getGameLocation(locationId: number): Promise<GameLocationDetail> {
  const res = await apiClient.get<GameLocationDetail>(`/game/locations/${locationId}`);
  return res.data;
}

export async function saveGameLocationHotspots(
  locationId: number,
  hotspots: GameHotspotDTO[],
): Promise<GameLocationDetail> {
  const res = await apiClient.put<GameLocationDetail>(`/game/locations/${locationId}/hotspots`, {
    hotspots,
  });
  return res.data;
}

export async function saveGameLocationMeta(
  locationId: number,
  meta: Record<string, unknown>,
): Promise<GameLocationDetail> {
  const res = await apiClient.patch<GameLocationDetail>(`/game/locations/${locationId}`, {
    meta,
  });
  return res.data;
}

// Helper to extract NPC slots from location meta
export function getNpcSlots(location: GameLocationDetail): NpcSlot2d[] {
  const meta = location.meta as any;
  return meta?.npcSlots2d || [];
}

// Helper to set NPC slots in location meta
export function setNpcSlots(location: GameLocationDetail, slots: NpcSlot2d[]): GameLocationDetail {
  return {
    ...location,
    meta: {
      ...(location.meta || {}),
      npcSlots2d: slots,
    },
  };
}

// Helper to get NPC roles from world meta
export function getWorldNpcRoles(world: GameWorldDetail): Record<string, string[]> {
  const meta = world.meta as any;
  return meta?.npcRoles || {};
}

// Helper to set NPC roles in world meta
export function setWorldNpcRoles(world: GameWorldDetail, roles: Record<string, string[]>): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      npcRoles: roles,
    },
  };
}

export async function getGameScene(sceneId: number): Promise<Scene> {
  const res = await apiClient.get<Scene>(`/game/scenes/${sceneId}`);
  return res.data;
}

export interface PickpocketRequest {
  npc_id: number;
  slot_id: string;
  base_success_chance: number;
  detection_chance: number;
  world_id?: number | null;
  session_id: number;
}

export interface PickpocketResponse {
  success: boolean;
  detected: boolean;
  updated_flags: Record<string, unknown>;
  message: string;
}

export async function attemptPickpocket(req: PickpocketRequest): Promise<PickpocketResponse> {
  const res = await apiClient.post<PickpocketResponse>('/game/stealth/pickpocket', req);
  return res.data;
}

export async function createGameSession(sceneId: number): Promise<GameSessionDTO> {
  const res = await apiClient.post<GameSessionDTO>('/game/sessions', {
    scene_id: sceneId,
  });
  return res.data;
}

export async function getGameSession(sessionId: number): Promise<GameSessionDTO> {
  const res = await apiClient.get<GameSessionDTO>(`/game/sessions/${sessionId}`);
  return res.data;
}

export async function updateGameSession(
  sessionId: number,
  payload: {
    world_time?: number;
    flags?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  },
): Promise<GameSessionDTO> {
  const res = await apiClient.patch<GameSessionDTO>(`/game/sessions/${sessionId}`, payload);
  return res.data;
}

export async function listGameWorlds(): Promise<GameWorldSummary[]> {
  const res = await apiClient.get<GameWorldSummary[]>('/game/worlds');
  return res.data;
}

export async function createGameWorld(
  name: string,
  meta?: Record<string, unknown>,
): Promise<GameWorldDetail> {
  const res = await apiClient.post<GameWorldDetail>('/game/worlds', { name, meta });
  return res.data;
}

export async function getGameWorld(worldId: number): Promise<GameWorldDetail> {
  const res = await apiClient.get<GameWorldDetail>(`/game/worlds/${worldId}`);
  return res.data;
}

export async function advanceGameWorldTime(
  worldId: number,
  deltaSeconds: number,
): Promise<GameWorldDetail> {
  const res = await apiClient.post<GameWorldDetail>(`/game/worlds/${worldId}/advance`, {
    delta_seconds: deltaSeconds,
  });
  return res.data;
}

export async function listGameNpcs(): Promise<GameNpcSummary[]> {
  const res = await apiClient.get<GameNpcSummary[]>('/game/npcs');
  return res.data;
}

export async function getNpcExpressions(npcId: number): Promise<NpcExpressionDTO[]> {
  const res = await apiClient.get<NpcExpressionDTO[]>(`/game/npcs/${npcId}/expressions`);
  return res.data;
}

export async function saveNpcExpressions(
  npcId: number,
  expressions: NpcExpressionDTO[],
): Promise<NpcExpressionDTO[]> {
  const res = await apiClient.put<NpcExpressionDTO[]>(`/game/npcs/${npcId}/expressions`, {
    expressions,
  });
  return res.data;
}

export async function getNpcPresence(params: {
  world_time: number;
  world_id?: number | null;
  location_id?: number | null;
}): Promise<NpcPresenceDTO[]> {
  const res = await apiClient.get<NpcPresenceDTO[]>('/game/npcs/presence', {
    params: {
      world_time: params.world_time,
      world_id: params.world_id ?? undefined,
      location_id: params.location_id ?? undefined,
    },
  });
  return res.data;
}
