import { apiClient } from './client';
import type {
  Scene,
  GameLocationSummary,
  GameHotspotDTO,
  NpcSlot2d,
  GameLocationDetail,
  GameNpcSummary,
  GameNpcDetail,
  NpcExpressionDTO,
  NpcPresenceDTO,
  GameWorldSummary,
  GameWorldDetail,
  GameSessionDTO,
  SessionUpdatePayload,
  PickpocketRequest,
  PickpocketResponse,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  WorldManifest,
} from '@pixsim7/types';

// Re-export types for backward compatibility
export type {
  GameLocationSummary,
  GameHotspotDTO,
  NpcSlot2d,
  GameLocationDetail,
  GameNpcSummary,
  GameNpcDetail,
  NpcExpressionDTO,
  NpcPresenceDTO,
  GameWorldSummary,
  GameWorldDetail,
  GameSessionDTO,
  SessionUpdatePayload,
  PickpocketRequest,
  PickpocketResponse,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  WorldManifest,
};

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

// Helper to get world manifest from world meta.manifest
export function getWorldManifest(world: GameWorldDetail): WorldManifest {
  if (!world.meta) {
    return {};
  }
  // The manifest is stored under meta.manifest key
  const meta = world.meta as any;
  return (meta.manifest as WorldManifest) || {};
}

// Helper to set world manifest in world meta.manifest
// Preserves other meta fields (e.g., npcRoles)
export function setWorldManifest(world: GameWorldDetail, manifest: WorldManifest): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      manifest,
    },
  };
}

export async function getGameScene(sceneId: number): Promise<Scene> {
  const res = await apiClient.get<Scene>(`/game/scenes/${sceneId}`);
  return res.data;
}

export async function attemptPickpocket(req: PickpocketRequest): Promise<PickpocketResponse> {
  const res = await apiClient.post<PickpocketResponse>('/game/stealth/pickpocket', req);
  return res.data;
}

export interface GameSessionSummary {
  id: number;
  scene_id: number;
  world_time: number;
  created_at: string;
}

export async function listGameSessions(): Promise<GameSessionSummary[]> {
  // TODO: Implement backend endpoint for listing sessions
  return [];
}

export async function createGameSession(
  sceneId: number,
  flags?: Record<string, unknown>
): Promise<GameSessionDTO> {
  const res = await apiClient.post<GameSessionDTO>('/game/sessions', {
    scene_id: sceneId,
    flags,
  });
  return res.data;
}

export async function getGameSession(sessionId: number): Promise<GameSessionDTO> {
  const res = await apiClient.get<GameSessionDTO>(`/game/sessions/${sessionId}`);
  return res.data;
}

export interface SessionUpdateResponse {
  session?: GameSessionDTO;
  conflict?: boolean;
  serverSession?: GameSessionDTO;
}

export async function updateGameSession(
  sessionId: number,
  payload: SessionUpdatePayload,
): Promise<SessionUpdateResponse> {
  try {
    const res = await apiClient.patch<GameSessionDTO>(`/game/sessions/${sessionId}`, payload);
    return { session: res.data, conflict: false };
  } catch (error: any) {
    // Handle 409 Conflict responses
    if (error.response?.status === 409) {
      const detail = error.response.data?.detail;
      if (detail?.error === 'version_conflict' && detail?.current_session) {
        return {
          conflict: true,
          serverSession: detail.current_session as GameSessionDTO,
        };
      }
    }
    // Re-throw other errors
    throw error;
  }
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

export async function getNpcDetail(npcId: number): Promise<GameNpcDetail> {
  const res = await apiClient.get<GameNpcDetail>(`/game/npcs/${npcId}`);
  return res.data;
}

export async function saveNpcMeta(
  npcId: number,
  meta: Record<string, unknown>
): Promise<GameNpcDetail> {
  const res = await apiClient.put<GameNpcDetail>(`/game/npcs/${npcId}/meta`, { meta });
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

// Quest API
export async function listSessionQuests(
  sessionId: number,
  status?: string
): Promise<QuestDTO[]> {
  const res = await apiClient.get<QuestDTO[]>(`/game/quests/sessions/${sessionId}/quests`, {
    params: status ? { status } : undefined,
  });
  return res.data;
}

export async function getSessionQuest(
  sessionId: number,
  questId: string
): Promise<QuestDTO> {
  const res = await apiClient.get<QuestDTO>(`/game/quests/sessions/${sessionId}/quests/${questId}`);
  return res.data;
}

export async function addQuest(
  sessionId: number,
  questData: {
    quest_id: string;
    title: string;
    description: string;
    objectives: Array<{
      id: string;
      description: string;
      target?: number;
      optional?: boolean;
    }>;
    metadata?: Record<string, unknown>;
  }
): Promise<QuestDTO> {
  const res = await apiClient.post<QuestDTO>(`/game/quests/sessions/${sessionId}/quests`, questData);
  return res.data;
}

export async function updateQuestStatus(
  sessionId: number,
  questId: string,
  status: string
): Promise<QuestDTO> {
  const res = await apiClient.patch<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/status`,
    { status }
  );
  return res.data;
}

export async function updateObjectiveProgress(
  sessionId: number,
  questId: string,
  objectiveId: string,
  progress: number,
  completed?: boolean
): Promise<QuestDTO> {
  const res = await apiClient.patch<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/objectives`,
    { objective_id: objectiveId, progress, completed }
  );
  return res.data;
}

export async function completeObjective(
  sessionId: number,
  questId: string,
  objectiveId: string
): Promise<QuestDTO> {
  const res = await apiClient.post<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/objectives/${objectiveId}/complete`
  );
  return res.data;
}

// Inventory API
export async function listInventoryItems(sessionId: number): Promise<InventoryItemDTO[]> {
  const res = await apiClient.get<InventoryItemDTO[]>(`/game/inventory/sessions/${sessionId}/items`);
  return res.data;
}

export async function getInventoryItem(sessionId: number, itemId: string): Promise<InventoryItemDTO> {
  const res = await apiClient.get<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items/${itemId}`);
  return res.data;
}

export async function addInventoryItem(
  sessionId: number,
  itemData: {
    item_id: string;
    name: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<InventoryItemDTO> {
  const res = await apiClient.post<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items`, itemData);
  return res.data;
}

export async function removeInventoryItem(
  sessionId: number,
  itemId: string,
  quantity: number = 1
): Promise<{ message: string }> {
  const res = await apiClient.delete<{ message: string }>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, {
    data: { quantity },
  });
  return res.data;
}

export async function updateInventoryItem(
  sessionId: number,
  itemId: string,
  updates: {
    name?: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<InventoryItemDTO> {
  const res = await apiClient.patch<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, updates);
  return res.data;
}

export async function clearInventory(sessionId: number): Promise<{ message: string }> {
  const res = await apiClient.delete<{ message: string }>(`/game/inventory/sessions/${sessionId}/clear`);
  return res.data;
}

export async function getInventoryStats(sessionId: number): Promise<{ unique_items: number; total_quantity: number }> {
  const res = await apiClient.get<{ unique_items: number; total_quantity: number }>(`/game/inventory/sessions/${sessionId}/stats`);
  return res.data;
}
