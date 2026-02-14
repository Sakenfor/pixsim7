/**
 * Game API Client
 *
 * Wraps the shared domain client with app-specific helpers and additional endpoints.
 */
import { createGameApi } from '@pixsim7/shared.api.client/domains';
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

// Create shared domain API instance
const gameApi = createGameApi(pixsimClient);

// OpenAPI-generated types
export type PaginatedWorldsResponse = ApiComponents['schemas']['PaginatedWorldsResponse'];
export type WorldConfigResponse = ApiComponents['schemas']['WorldConfigResponse'];
export type InventoryStatsResponse = ApiComponents['schemas']['InventoryStatsResponse'];
export type MessageResponse = ApiComponents['schemas']['MessageResponse'];

// Project bundle import/export
export interface GameProjectBundle {
  schema_version: number;
  exported_at: string;
  core: {
    world: Record<string, unknown>;
    locations: unknown[];
    npcs: unknown[];
    scenes: unknown[];
    items: unknown[];
  };
  extensions?: Record<string, unknown>;
}

export interface GameProjectImportResponse {
  schema_version: number;
  world_id: number;
  world_name: string;
  counts: {
    locations: number;
    hotspots: number;
    npcs: number;
    schedules: number;
    expressions: number;
    scenes: number;
    nodes: number;
    edges: number;
    items: number;
  };
  id_maps: {
    locations: Record<string, number>;
    npcs: Record<string, number>;
    scenes: Record<string, number>;
    nodes: Record<string, number>;
    items: Record<string, number>;
  };
  warnings: string[];
}

export interface SavedGameProjectSummary {
  id: number;
  name: string;
  source_world_id: number | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface SavedGameProjectDetail extends SavedGameProjectSummary {
  bundle: GameProjectBundle;
}

export interface SaveGameProjectRequest {
  name: string;
  bundle: GameProjectBundle;
  source_world_id?: number | null;
  overwrite_project_id?: number;
}

export interface RenameSavedGameProjectRequest {
  name: string;
}

export interface DuplicateSavedGameProjectRequest {
  name: string;
}

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

// =============================================================================
// Locations API (delegating to shared client with app-specific extensions)
// =============================================================================

export async function listGameLocations(): Promise<GameLocationSummary[]> {
  return gameApi.listLocations();
}

export async function getGameLocation(locationId: IDs.LocationId): Promise<GameLocationDetail> {
  return gameApi.getLocation(locationId);
}

export async function saveGameLocationHotspots(
  locationId: IDs.LocationId,
  hotspots: GameHotspotDTO[],
): Promise<GameLocationDetail> {
  return gameApi.saveLocationHotspots(locationId, hotspots);
}

// App-specific: meta update endpoint
export async function saveGameLocationMeta(
  locationId: IDs.LocationId,
  meta: Record<string, unknown>,
): Promise<GameLocationDetail> {
  return pixsimClient.patch<GameLocationDetail>(`/game/locations/${locationId}`, {
    meta,
  });
}

// =============================================================================
// Location Helpers (no API calls)
// =============================================================================

export function getNpcSlots(location: GameLocationDetail): NpcSlot2d[] {
  const meta = location.meta as any;
  return meta?.npcSlots2d || [];
}

export function setNpcSlots(location: GameLocationDetail, slots: NpcSlot2d[]): GameLocationDetail {
  return {
    ...location,
    meta: {
      ...(location.meta || {}),
      npcSlots2d: slots,
    },
  };
}

// =============================================================================
// World Helpers (no API calls)
// =============================================================================

export function getWorldNpcRoles(world: GameWorldDetail): Record<string, string[]> {
  const meta = world.meta as any;
  return meta?.npcRoles || {};
}

export function setWorldNpcRoles(world: GameWorldDetail, roles: Record<string, string[]>): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      npcRoles: roles,
    },
  };
}

export function getWorldManifest(world: GameWorldDetail): WorldManifest {
  if (!world.meta) {
    return {};
  }
  const meta = world.meta as any;
  return (meta.manifest as WorldManifest) || {};
}

export function setWorldManifest(world: GameWorldDetail, manifest: WorldManifest): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      manifest,
    },
  };
}

// =============================================================================
// Scenes API
// =============================================================================

export async function getGameScene(sceneId: IDs.SceneId): Promise<Scene> {
  return gameApi.getScene(sceneId);
}

// =============================================================================
// App-specific gameplay endpoints (not in shared client)
// =============================================================================

export async function attemptPickpocket(req: PickpocketRequest): Promise<PickpocketResponse> {
  return pixsimClient.post<PickpocketResponse>('/game/stealth/pickpocket', req);
}

export async function attemptSensualTouch(req: SensualTouchRequest): Promise<SensualTouchResponse> {
  return pixsimClient.post<SensualTouchResponse>('/game/romance/sensual-touch', req);
}

// =============================================================================
// Sessions API
// =============================================================================

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
  return gameApi.createSession(sceneId, flags);
}

export async function getGameSession(sessionId: IDs.SessionId): Promise<GameSessionDTO> {
  return gameApi.getSession(sessionId);
}

// App-specific: conflict-aware session update
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
    const session = await gameApi.updateSession(sessionId, payload);
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
    throw error;
  }
}

// =============================================================================
// Worlds API
// =============================================================================

export async function listGameWorlds(): Promise<GameWorldSummary[]> {
  return gameApi.listWorlds();
}

export async function createGameWorld(
  name: string,
  meta?: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return gameApi.createWorld(name, meta);
}

export async function getGameWorld(worldId: number): Promise<GameWorldDetail> {
  return gameApi.getWorld(worldId);
}

export async function getWorldConfig(worldId: number): Promise<WorldConfigResponse> {
  return gameApi.getWorldConfig(worldId);
}

// App-specific: uses PATCH instead of PUT
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
  return gameApi.advanceWorldTime(worldId, deltaSeconds);
}

export async function updateGameWorldMeta(
  worldId: number,
  meta: Record<string, unknown>,
): Promise<GameWorldDetail> {
  return gameApi.updateWorldMeta(worldId, meta);
}

export async function exportWorldProject(worldId: number): Promise<GameProjectBundle> {
  return pixsimClient.get<GameProjectBundle>(`/game/worlds/${worldId}/project/export`);
}

export async function importWorldProject(
  bundle: GameProjectBundle,
  opts?: { world_name_override?: string }
): Promise<GameProjectImportResponse> {
  return pixsimClient.post<GameProjectImportResponse>('/game/worlds/projects/import', {
    bundle,
    mode: 'create_new_world',
    ...(opts?.world_name_override ? { world_name_override: opts.world_name_override } : {}),
  });
}

export async function listSavedGameProjects(
  opts?: { offset?: number; limit?: number }
): Promise<SavedGameProjectSummary[]> {
  const params = new URLSearchParams();
  if (typeof opts?.offset === 'number') {
    params.set('offset', String(opts.offset));
  }
  if (typeof opts?.limit === 'number') {
    params.set('limit', String(opts.limit));
  }

  const query = params.toString();
  return pixsimClient.get<SavedGameProjectSummary[]>(
    query ? `/game/worlds/projects/snapshots?${query}` : '/game/worlds/projects/snapshots'
  );
}

export async function getSavedGameProject(projectId: number): Promise<SavedGameProjectDetail> {
  return pixsimClient.get<SavedGameProjectDetail>(`/game/worlds/projects/snapshots/${projectId}`);
}

export async function saveGameProject(
  request: SaveGameProjectRequest
): Promise<SavedGameProjectSummary> {
  return pixsimClient.post<SavedGameProjectSummary>('/game/worlds/projects/snapshots', request);
}

export async function renameSavedGameProject(
  projectId: number,
  request: RenameSavedGameProjectRequest,
): Promise<SavedGameProjectSummary> {
  return pixsimClient.patch<SavedGameProjectSummary>(`/game/worlds/projects/snapshots/${projectId}`, request);
}

export async function duplicateSavedGameProject(
  projectId: number,
  request: DuplicateSavedGameProjectRequest,
): Promise<SavedGameProjectSummary> {
  return pixsimClient.post<SavedGameProjectSummary>(
    `/game/worlds/projects/snapshots/${projectId}/duplicate`,
    request,
  );
}

export async function deleteSavedGameProject(projectId: number): Promise<void> {
  await pixsimClient.delete<void>(`/game/worlds/projects/snapshots/${projectId}`);
}

// =============================================================================
// Project Draft API (autosave / recovery)
// =============================================================================

export interface UpsertDraftRequest {
  bundle: GameProjectBundle;
  source_world_id?: number | null;
  draft_source_project_id?: number | null;
}

export interface DraftSummary {
  id: number;
  draft_source_project_id: number | null;
  source_world_id: number | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export async function upsertProjectDraft(
  request: UpsertDraftRequest,
): Promise<DraftSummary> {
  return pixsimClient.put<DraftSummary>('/game/worlds/projects/drafts', request);
}

export async function getProjectDraft(
  draftSourceProjectId?: number | null,
): Promise<SavedGameProjectDetail | null> {
  const params = new URLSearchParams();
  if (draftSourceProjectId != null) {
    params.set('draft_source_project_id', String(draftSourceProjectId));
  }
  const query = params.toString();
  return pixsimClient.get<SavedGameProjectDetail | null>(
    query ? `/game/worlds/projects/drafts?${query}` : '/game/worlds/projects/drafts',
  );
}

export async function deleteProjectDraft(
  draftSourceProjectId?: number | null,
): Promise<void> {
  const params = new URLSearchParams();
  if (draftSourceProjectId != null) {
    params.set('draft_source_project_id', String(draftSourceProjectId));
  }
  const query = params.toString();
  await pixsimClient.delete<void>(
    query ? `/game/worlds/projects/drafts?${query}` : '/game/worlds/projects/drafts',
  );
}

// =============================================================================
// NPCs API
// =============================================================================

export async function listGameNpcs(): Promise<GameNpcSummary[]> {
  return gameApi.listNpcs();
}

export async function getNpcDetail(npcId: number): Promise<GameNpcDetail> {
  return gameApi.getNpc(npcId);
}

export async function saveNpcMeta(
  npcId: number,
  meta: Record<string, unknown>
): Promise<GameNpcDetail> {
  return gameApi.saveNpcMeta(npcId, meta);
}

export async function getNpcPresence(params: {
  world_time: number;
  world_id?: number | null;
  location_id?: number | null;
}): Promise<NpcPresenceDTO[]> {
  return gameApi.getNpcPresence({
    world_time: params.world_time,
    world_id: params.world_id ?? undefined,
    location_id: params.location_id ?? undefined,
  });
}

// App-specific NPC endpoints (not in shared client)
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

export async function listNpcSurfacePackages(): Promise<NpcSurfacePackage[]> {
  return pixsimClient.get<NpcSurfacePackage[]>('/game/npcs/surface-packages');
}

// =============================================================================
// Quests API
// =============================================================================

export async function listSessionQuests(
  sessionId: number,
  status?: string
): Promise<QuestDTO[]> {
  return gameApi.listQuests(sessionId, status);
}

export async function getSessionQuest(
  sessionId: number,
  questId: string
): Promise<QuestDTO> {
  return gameApi.getQuest(sessionId, questId);
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
  return gameApi.addQuest(sessionId, questData);
}

export async function updateQuestStatus(
  sessionId: number,
  questId: string,
  status: string
): Promise<QuestDTO> {
  return gameApi.updateQuestStatus(sessionId, questId, status);
}

// App-specific: objective progress update
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

// App-specific: complete objective endpoint
export async function completeObjective(
  sessionId: number,
  questId: string,
  objectiveId: string
): Promise<QuestDTO> {
  return pixsimClient.post<QuestDTO>(
    `/game/quests/sessions/${sessionId}/quests/${questId}/objectives/${objectiveId}/complete`
  );
}

// =============================================================================
// Inventory API
// =============================================================================

export async function listInventoryItems(sessionId: number): Promise<InventoryItemDTO[]> {
  return gameApi.listInventoryItems(sessionId);
}

// App-specific: get single item
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
  return gameApi.addInventoryItem(sessionId, itemData);
}

export async function removeInventoryItem(
  sessionId: number,
  itemId: string,
  quantity: number = 1
): Promise<MessageResponse> {
  return gameApi.removeInventoryItem(sessionId, itemId, quantity);
}

// App-specific: update item
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

// App-specific: clear all inventory
export async function clearInventory(sessionId: number): Promise<MessageResponse> {
  return pixsimClient.delete<MessageResponse>(`/game/inventory/sessions/${sessionId}/clear`);
}

export async function getInventoryStats(sessionId: number): Promise<InventoryStatsResponse> {
  return gameApi.getInventoryStats(sessionId);
}

// =============================================================================
// Template Resolution API (ObjectLink system)
// =============================================================================

export async function resolveTemplate(
  templateKind: TemplateKind,
  templateId: string,
  context?: Record<string, unknown>
): Promise<ResolveTemplateResponse> {
  return gameApi.resolveTemplate(templateKind, templateId, context);
}

export async function resolveTemplateBatch(
  refs: Array<{
    templateKind: TemplateKind;
    templateId: string;
    context?: Record<string, unknown>;
  }>,
  sharedContext?: Record<string, unknown>
): Promise<ResolveBatchResponse> {
  return gameApi.resolveTemplateBatch(refs, sharedContext);
}

