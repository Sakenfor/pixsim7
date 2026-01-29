import { IDs, ApiComponents } from '@pixsim7/shared.types';

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
  NpcSurfacePackage,
  GameWorldSummary,
  GameWorldDetail,
  GameSessionDTO,
  SessionUpdatePayload,
  PickpocketRequest,
  PickpocketResponse,
  SensualTouchRequest,
  SensualTouchResponse,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  WorldManifest,
  ResolveTemplateResponse,
  ResolveBatchResponse,
  TemplateKind,
} from '@lib/registries';

import { pixsimClient } from './client';

// OpenAPI-generated types
export type PaginatedWorldsResponse = ApiComponents['schemas']['PaginatedWorldsResponse'];
export type WorldConfigResponse = ApiComponents['schemas']['WorldConfigResponse'];
export type InventoryStatsResponse = ApiComponents['schemas']['InventoryStatsResponse'];
export type MessageResponse = ApiComponents['schemas']['MessageResponse'];

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
  NpcSurfacePackage,
  GameWorldSummary,
  GameWorldDetail,
  GameSessionDTO,
  SessionUpdatePayload,
  PickpocketRequest,
  PickpocketResponse,
  SensualTouchRequest,
  SensualTouchResponse,
  QuestObjectiveDTO,
  QuestDTO,
  InventoryItemDTO,
  WorldManifest,
  ResolveTemplateResponse,
  ResolveBatchResponse,
  TemplateKind,
};

export async function listGameLocations(): Promise<GameLocationSummary[]> {
  return pixsimClient.get<GameLocationSummary[]>('/game/locations');
}

export async function getGameLocation(locationId: IDs.LocationId): Promise<GameLocationDetail> {
  return pixsimClient.get<GameLocationDetail>(`/game/locations/${locationId}`);
}

export async function saveGameLocationHotspots(
  locationId: IDs.LocationId,
  hotspots: GameHotspotDTO[],
): Promise<GameLocationDetail> {
  return pixsimClient.put<GameLocationDetail>(`/game/locations/${locationId}/hotspots`, {
    hotspots,
  });
}

export async function saveGameLocationMeta(
  locationId: IDs.LocationId,
  meta: Record<string, unknown>,
): Promise<GameLocationDetail> {
  return pixsimClient.patch<GameLocationDetail>(`/game/locations/${locationId}`, {
    meta,
  });
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

export async function getGameScene(sceneId: IDs.SceneId): Promise<Scene> {
  return pixsimClient.get<Scene>(`/game/scenes/${sceneId}`);
}

export async function attemptPickpocket(req: PickpocketRequest): Promise<PickpocketResponse> {
  return pixsimClient.post<PickpocketResponse>('/game/stealth/pickpocket', req);
}

export async function attemptSensualTouch(req: SensualTouchRequest): Promise<SensualTouchResponse> {
  return pixsimClient.post<SensualTouchResponse>('/game/romance/sensual-touch', req);
}

export interface GameSessionSummary {
  id: IDs.SessionId;
  scene_id: IDs.SceneId;
  world_time: number;
  created_at: string;
}

export async function listGameSessions(): Promise<GameSessionSummary[]> {
  // TODO: Implement backend endpoint for listing sessions
  return [];
}

export async function createGameSession(
  sceneId: IDs.SceneId,
  flags?: Record<string, unknown>
): Promise<GameSessionDTO> {
  return pixsimClient.post<GameSessionDTO>('/game/sessions', {
    scene_id: sceneId,
    flags,
  });
}

export async function getGameSession(sessionId: IDs.SessionId): Promise<GameSessionDTO> {
  return pixsimClient.get<GameSessionDTO>(`/game/sessions/${sessionId}`);
}

export interface SessionUpdateResponse {
  session?: GameSessionDTO;
  conflict?: boolean;
  serverSession?: GameSessionDTO;
}

export async function updateGameSession(
  sessionId: IDs.SessionId,
  payload: SessionUpdatePayload,
): Promise<SessionUpdateResponse> {
  try {
    const session = await pixsimClient.patch<GameSessionDTO>(`/game/sessions/${sessionId}`, payload);
    return { session, conflict: false };
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
  const response = await pixsimClient.get<PaginatedWorldsResponse>('/game/worlds');
  return [...response.worlds];
}

export async function createGameWorld(
  name: string,
  meta?: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return pixsimClient.post<GameWorldDetail>('/game/worlds', { name, meta });
}

export async function getGameWorld(worldId: number): Promise<GameWorldDetail> {
  return pixsimClient.get<GameWorldDetail>(`/game/worlds/${worldId}`);
}

/**
 * Get unified world configuration with merged stat definitions.
 * Backend is the source of truth - includes pre-computed ordering.
 */
export async function getWorldConfig(worldId: number): Promise<WorldConfigResponse> {
  return pixsimClient.get<WorldConfigResponse>(`/game/worlds/${worldId}/config`);
}

export async function saveGameWorldMeta(
  worldId: number,
  meta: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return pixsimClient.patch<GameWorldDetail>(`/game/worlds/${worldId}`, {
    meta,
  });
}

export async function advanceGameWorldTime(
  worldId: number,
  deltaSeconds: number,
): Promise<GameWorldDetail> {
  return pixsimClient.post<GameWorldDetail>(`/game/worlds/${worldId}/advance`, {
    delta_seconds: deltaSeconds,
  });
}

/**
 * Update GameWorld metadata
 */
export async function updateGameWorldMeta(
  worldId: number,
  meta: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return pixsimClient.put<GameWorldDetail>(`/game/worlds/${worldId}/meta`, { meta });
}

export async function listGameNpcs(): Promise<GameNpcSummary[]> {
  return pixsimClient.get<GameNpcSummary[]>('/game/npcs');
}

export async function getNpcExpressions(npcId: number): Promise<NpcExpressionDTO[]> {
  return pixsimClient.get<NpcExpressionDTO[]>(`/game/npcs/${npcId}/expressions`);
}

export async function saveNpcExpressions(
  npcId: number,
  expressions: NpcExpressionDTO[],
): Promise<NpcExpressionDTO[]> {
  return pixsimClient.put<NpcExpressionDTO[]>(`/game/npcs/${npcId}/expressions`, {
    expressions,
  });
}

export async function getNpcDetail(npcId: number): Promise<GameNpcDetail> {
  return pixsimClient.get<GameNpcDetail>(`/game/npcs/${npcId}`);
}

export async function saveNpcMeta(
  npcId: number,
  meta: Record<string, unknown>
): Promise<GameNpcDetail> {
  return pixsimClient.put<GameNpcDetail>(`/game/npcs/${npcId}/meta`, { meta });
}

export async function listNpcSurfacePackages(): Promise<NpcSurfacePackage[]> {
  return pixsimClient.get<NpcSurfacePackage[]>('/game/npcs/surface-packages');
}

export async function getNpcPresence(params: {
  world_time: number;
  world_id?: number | null;
  location_id?: number | null;
}): Promise<NpcPresenceDTO[]> {
  return pixsimClient.get<NpcPresenceDTO[]>('/game/npcs/presence', {
    params: {
      world_time: params.world_time,
      world_id: params.world_id ?? undefined,
      location_id: params.location_id ?? undefined,
    },
  });
}

// Quest API
export async function listSessionQuests(
  sessionId: number,
  status?: string
): Promise<QuestDTO[]> {
  return pixsimClient.get<QuestDTO[]>(`/game/quests/sessions/${sessionId}/quests`, {
    params: status ? { status } : undefined,
  });
}

export async function getSessionQuest(
  sessionId: number,
  questId: string
): Promise<QuestDTO> {
  return pixsimClient.get<QuestDTO>(`/game/quests/sessions/${sessionId}/quests/${questId}`);
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
  return pixsimClient.post<QuestDTO>(`/game/quests/sessions/${sessionId}/quests`, questData);
}

export async function updateQuestStatus(
  sessionId: number,
  questId: string,
  status: string
): Promise<QuestDTO> {
  return pixsimClient.patch<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/status`,
    { status }
  );
}

export async function updateObjectiveProgress(
  sessionId: number,
  questId: string,
  objectiveId: string,
  progress: number,
  completed?: boolean
): Promise<QuestDTO> {
  return pixsimClient.patch<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/objectives`,
    { objective_id: objectiveId, progress, completed }
  );
}

export async function completeObjective(
  sessionId: number,
  questId: string,
  objectiveId: string
): Promise<QuestDTO> {
  return pixsimClient.post<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/objectives/${objectiveId}/complete`
  );
}

// Inventory API
export async function listInventoryItems(sessionId: number): Promise<InventoryItemDTO[]> {
  return pixsimClient.get<InventoryItemDTO[]>(`/game/inventory/sessions/${sessionId}/items`);
}

export async function getInventoryItem(sessionId: number, itemId: string): Promise<InventoryItemDTO> {
  return pixsimClient.get<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items/${itemId}`);
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
  return pixsimClient.post<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items`, itemData);
}

export async function removeInventoryItem(
  sessionId: number,
  itemId: string,
  quantity: number = 1
): Promise<MessageResponse> {
  return pixsimClient.delete<MessageResponse>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, {
    data: { quantity },
  });
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
  return pixsimClient.patch<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, updates);
}

export async function clearInventory(sessionId: number): Promise<MessageResponse> {
  return pixsimClient.delete<MessageResponse>(`/game/inventory/sessions/${sessionId}/clear`);
}

export async function getInventoryStats(sessionId: number): Promise<InventoryStatsResponse> {
  return pixsimClient.get<InventoryStatsResponse>(`/game/inventory/sessions/${sessionId}/stats`);
}

// =============================================================================
// Template Resolution API (ObjectLink system)
// =============================================================================

/**
 * Resolve a template entity to its linked runtime entity.
 * Uses the ObjectLink system with activation conditions based on context.
 *
 * @param templateKind - Template entity kind (e.g., 'characterInstance')
 * @param templateId - Template entity ID (usually UUID)
 * @param context - Optional runtime context for activation-based resolution
 * @returns Resolution result with runtimeId if found
 */
export async function resolveTemplate(
  templateKind: TemplateKind,
  templateId: string,
  context?: Record<string, unknown>
): Promise<ResolveTemplateResponse> {
  return pixsimClient.post<ResolveTemplateResponse>('/game/links/resolve', {
    template_kind: templateKind,
    template_id: templateId,
    context,
  });
}

/**
 * Batch resolve multiple template references in one call.
 * More efficient than multiple single resolveTemplate calls.
 *
 * @param refs - Array of template references to resolve
 * @param sharedContext - Context applied to all refs (merged with per-ref context)
 * @returns Batch resolution result keyed by "templateKind:templateId"
 */
export async function resolveTemplateBatch(
  refs: Array<{
    templateKind: TemplateKind;
    templateId: string;
    context?: Record<string, unknown>;
  }>,
  sharedContext?: Record<string, unknown>
): Promise<ResolveBatchResponse> {
  return pixsimClient.post<ResolveBatchResponse>('/game/links/resolve-batch', {
    refs: refs.map((ref) => ({
      template_kind: ref.templateKind,
      template_id: ref.templateId,
      context: ref.context,
    })),
    shared_context: sharedContext,
  });
}
