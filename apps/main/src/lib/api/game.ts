/**
 * Game API Client
 *
 * Wraps the shared domain client with app-specific helpers and additional endpoints.
 */
import { createGameApi } from '@pixsim7/shared.api.client/domains';
import type {
  PaginatedWorldsResponse,
  WorldConfigResponse,
  InventoryStatsResponse,
} from '@pixsim7/shared.api.client/domains';
import type {
  GameProjectBundleInput,
  GameProjectImportResponse,
  MessageResponse,
  SavedGameProjectSummary,
  SavedGameProjectDetail,
  SaveGameProjectRequest,
  RenameSavedGameProjectRequest,
  DuplicateSavedGameProjectRequest,
  UpsertDraftRequest,
  DraftSummary,
} from '@pixsim7/shared.api.model';
import { IDs, ROOM_NAVIGATION_META_KEY, validateRoomNavigation } from '@pixsim7/shared.types';
import type { RoomNavigationValidationIssue } from '@pixsim7/shared.types';

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

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

interface RoomNavigationStateResponse {
  locationId: number;
  roomNavigation?: unknown | null;
  migrationNotes?: string[];
  authoringRevision?: string | null;
}

interface RoomNavigationTransitionCacheStateResponse {
  locationId: number;
  transitionCache?: unknown | null;
  authoringRevision?: string | null;
}

interface NpcSlots2dStateResponse {
  locationId: number;
  npcSlots2d?: unknown | null;
  authoringRevision?: string | null;
}

interface RoomNavigationValidationResponsePayload {
  valid: boolean;
  roomNavigation?: unknown | null;
  errors?: Array<{
    path?: unknown;
    message?: unknown;
  }>;
}

export interface GameLocationRoomNavigationPatchOperation {
  op:
    | 'set_room_id'
    | 'set_start_checkpoint'
    | 'clear_start_checkpoint'
    | 'upsert_checkpoint'
    | 'remove_checkpoint'
    | 'upsert_edge'
    | 'remove_edge'
    | 'upsert_hotspot'
    | 'remove_hotspot';
  roomId?: string;
  startCheckpointId?: string;
  checkpoint?: RoomNavigationData['checkpoints'][number];
  checkpointId?: string;
  edge?: RoomNavigationData['edges'][number];
  edgeId?: string;
  hotspot?: RoomNavigationData['checkpoints'][number]['hotspots'][number];
  hotspotId?: string;
}

// Re-exported from Orval-generated types
export type { PaginatedWorldsResponse, WorldConfigResponse, InventoryStatsResponse, MessageResponse };

// Project bundle import/export
export type GameProjectBundle = GameProjectBundleInput;
export type { GameProjectImportResponse, SavedGameProjectSummary, SavedGameProjectDetail, SaveGameProjectRequest, RenameSavedGameProjectRequest, DuplicateSavedGameProjectRequest };

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

export async function listGameLocations(opts?: { worldId?: number | null }): Promise<GameLocationSummary[]> {
  return gameApi.listLocations(opts);
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
// Deprecated for reserved location sections. Use dedicated room-navigation,
// transition-cache, and npc-slots endpoints for those keys.
export async function saveGameLocationMeta(
  locationId: IDs.LocationId,
  meta: Record<string, unknown>,
  opts?: {
    expectedAuthoringRevision?: string | null;
  },
): Promise<GameLocationDetail> {
  return pixsimClient.patch<GameLocationDetail>(`/game/locations/${locationId}`, {
    meta,
    ...(opts?.expectedAuthoringRevision
      ? { expectedAuthoringRevision: opts.expectedAuthoringRevision }
      : {}),
  });
}

const _normalizeNpcSlots2d = (value: unknown): NpcSlot2d[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((slot): slot is NpcSlot2d => !!slot && typeof slot === 'object');
};

export async function getGameLocationNpcSlots2d(
  locationId: IDs.LocationId,
): Promise<NpcSlot2d[]> {
  const response = await pixsimClient.get<NpcSlots2dStateResponse>(
    `/game/locations/${locationId}/npc-slots-2d`,
  );
  return _normalizeNpcSlots2d(response?.npcSlots2d);
}

export async function saveGameLocationNpcSlots2d(
  locationId: IDs.LocationId,
  npcSlots2d: NpcSlot2d[],
  opts?: {
    expectedAuthoringRevision?: string | null;
  },
): Promise<{
  npcSlots2d: NpcSlot2d[];
  authoringRevision?: string | null;
}> {
  const response = await pixsimClient.put<NpcSlots2dStateResponse>(
    `/game/locations/${locationId}/npc-slots-2d`,
    {
      npcSlots2d,
      ...(opts?.expectedAuthoringRevision
        ? { expectedAuthoringRevision: opts.expectedAuthoringRevision }
        : {}),
    },
  );
  return {
    npcSlots2d: _normalizeNpcSlots2d(response?.npcSlots2d),
    authoringRevision:
      typeof response?.authoringRevision === 'string' ? response.authoringRevision : null,
  };
}

export async function getGameLocationRoomNavigation(
  locationId: IDs.LocationId,
): Promise<RoomNavigationData | null> {
  const response = await pixsimClient.get<RoomNavigationStateResponse>(
    `/game/locations/${locationId}/room-navigation`,
  );
  if (!response?.roomNavigation) {
    return null;
  }

  const parsed = validateRoomNavigation(response.roomNavigation);
  return parsed.ok ? parsed.data : null;
}

export async function saveGameLocationRoomNavigation(
  locationId: IDs.LocationId,
  roomNavigation: RoomNavigationData,
  opts?: {
    expectedAuthoringRevision?: string | null;
  },
): Promise<RoomNavigationData> {
  const response = await pixsimClient.put<RoomNavigationStateResponse>(
    `/game/locations/${locationId}/room-navigation`,
    {
      roomNavigation,
      ...(opts?.expectedAuthoringRevision
        ? { expectedAuthoringRevision: opts.expectedAuthoringRevision }
        : {}),
    },
  );
  const parsed = validateRoomNavigation(response?.roomNavigation ?? roomNavigation);
  return parsed.ok ? parsed.data : roomNavigation;
}

export async function patchGameLocationRoomNavigation(
  locationId: IDs.LocationId,
  operations: GameLocationRoomNavigationPatchOperation[],
  opts?: {
    createIfMissing?: boolean;
    initialRoomId?: string | null;
    expectedAuthoringRevision?: string | null;
  },
): Promise<RoomNavigationData> {
  const response = await pixsimClient.patch<RoomNavigationStateResponse>(
    `/game/locations/${locationId}/room-navigation`,
    {
      operations,
      createIfMissing: opts?.createIfMissing ?? true,
      ...(opts?.initialRoomId ? { initialRoomId: opts.initialRoomId } : {}),
      ...(opts?.expectedAuthoringRevision
        ? { expectedAuthoringRevision: opts.expectedAuthoringRevision }
        : {}),
    },
  );

  const parsed = validateRoomNavigation(response?.roomNavigation);
  if (!parsed.ok) {
    throw new Error('Server returned invalid room_navigation payload after patch');
  }
  return parsed.data;
}

export async function getGameLocationRoomNavigationTransitionCache(
  locationId: IDs.LocationId,
): Promise<Record<string, unknown> | null> {
  const response = await pixsimClient.get<RoomNavigationTransitionCacheStateResponse>(
    `/game/locations/${locationId}/room-navigation/transition-cache`,
  );

  if (!response?.transitionCache || typeof response.transitionCache !== 'object') {
    return null;
  }
  if (Array.isArray(response.transitionCache)) {
    return null;
  }

  return response.transitionCache as Record<string, unknown>;
}

export async function saveGameLocationRoomNavigationTransitionCache(
  locationId: IDs.LocationId,
  transitionCache: Record<string, unknown>,
  opts?: {
    expectedAuthoringRevision?: string | null;
  },
): Promise<Record<string, unknown>> {
  const response = await pixsimClient.put<RoomNavigationTransitionCacheStateResponse>(
    `/game/locations/${locationId}/room-navigation/transition-cache`,
    {
      transitionCache,
      ...(opts?.expectedAuthoringRevision
        ? { expectedAuthoringRevision: opts.expectedAuthoringRevision }
        : {}),
    },
  );

  if (!response?.transitionCache || typeof response.transitionCache !== 'object') {
    throw new Error('Server returned invalid room-navigation transition cache payload');
  }
  if (Array.isArray(response.transitionCache)) {
    throw new Error('Server returned invalid room-navigation transition cache payload');
  }
  return response.transitionCache as Record<string, unknown>;
}

export async function validateGameLocationRoomNavigation(
  locationId: IDs.LocationId,
  roomNavigation: RoomNavigationData,
): Promise<{
  valid: boolean;
  roomNavigation: RoomNavigationData | null;
  errors: RoomNavigationValidationIssue[];
}> {
  const response = await pixsimClient.post<RoomNavigationValidationResponsePayload>(
    `/game/locations/${locationId}/room-navigation/validate`,
    {
      roomNavigation,
    },
  );

  const errors: RoomNavigationValidationIssue[] = Array.isArray(response?.errors)
    ? response.errors
      .filter(
        (item): item is { path: string; message: string } =>
          typeof item?.path === 'string' && typeof item?.message === 'string',
      )
      .map((item) => ({ path: item.path, message: item.message }))
    : [];

  if (!response?.valid) {
    return {
      valid: false,
      roomNavigation: null,
      errors,
    };
  }

  const parsed = validateRoomNavigation(response.roomNavigation ?? roomNavigation);
  if (!parsed.ok) {
    return {
      valid: false,
      roomNavigation: null,
      errors: parsed.issues,
    };
  }

  return {
    valid: true,
    roomNavigation: parsed.data,
    errors: [],
  };
}

// =============================================================================
// Location Helpers (no API calls)
// =============================================================================

export function getNpcSlots(location: GameLocationDetail): NpcSlot2d[] {
  const meta = location.meta as any;
  return meta?.npcSlots2d || [];
}

export function getRoomNavigation(location: GameLocationDetail): RoomNavigationData | null {
  const meta = location.meta as Record<string, unknown> | null | undefined;
  const payload = meta?.[ROOM_NAVIGATION_META_KEY];
  if (!payload) {
    return null;
  }

  const result = validateRoomNavigation(payload);
  if (!result.ok) {
    return null;
  }
  return result.data;
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

export function setRoomNavigation(
  location: GameLocationDetail,
  roomNavigation: RoomNavigationData,
): GameLocationDetail {
  return {
    ...location,
    meta: {
      ...(location.meta || {}),
      [ROOM_NAVIGATION_META_KEY]: roomNavigation,
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
// Game Objects API
// =============================================================================

export interface GameObjectTemplateBinding {
  templateKind: string;
  templateId: string;
  linkId?: string | null;
}

export interface GameObjectSummary {
  id: number;
  worldId?: number | null;
  name: string;
  objectKind: string;
  templateBinding?: GameObjectTemplateBinding | null;
}

export interface GameObjectDetail extends GameObjectSummary {
  description?: string | null;
  meta: Record<string, unknown>;
  stats: Record<string, unknown>;
  statsMetadata: Record<string, unknown>;
}

export type GameObjectWritePayload = Record<string, unknown>;

function _buildWorldScopeQuery(worldId?: number | null): string {
  if (worldId == null || Number.isNaN(worldId)) {
    return '';
  }
  return `?world_id=${worldId}`;
}

export async function listGameObjects(opts?: {
  worldId?: number | null;
}): Promise<GameObjectSummary[]> {
  const query = _buildWorldScopeQuery(opts?.worldId ?? null);
  return pixsimClient.get<GameObjectSummary[]>(
    query ? `/game/objects${query}` : '/game/objects'
  );
}

export async function getGameObject(
  objectId: number,
  opts?: {
    worldId?: number | null;
  },
): Promise<GameObjectDetail> {
  const query = _buildWorldScopeQuery(opts?.worldId ?? null);
  return pixsimClient.get<GameObjectDetail>(
    query ? `/game/objects/${objectId}${query}` : `/game/objects/${objectId}`
  );
}

export async function createGameObject(
  payload: GameObjectWritePayload,
  opts?: {
    worldId?: number | null;
  },
): Promise<GameObjectDetail> {
  const query = _buildWorldScopeQuery(opts?.worldId ?? null);
  return pixsimClient.post<GameObjectDetail>(
    query ? `/game/objects${query}` : '/game/objects',
    payload
  );
}

export async function updateGameObject(
  objectId: number,
  payload: GameObjectWritePayload,
  opts?: {
    worldId?: number | null;
  },
): Promise<GameObjectDetail> {
  const query = _buildWorldScopeQuery(opts?.worldId ?? null);
  return pixsimClient.put<GameObjectDetail>(
    query ? `/game/objects/${objectId}${query}` : `/game/objects/${objectId}`,
    payload
  );
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
// Dialogue Primitive Selection (behavior-driven)
// =============================================================================

export interface BuildPrimitiveSelectionRequestFromBehaviorRequest {
  session_id: number;
  world_id: number;
  lead_npc_id: number;
  partner_npc_id?: number | null;

  world_time?: number | null;
  include_scene_intent_tag?: boolean;

  pose?: string | null;
  mood?: string | null;
  intimacy_level?: string | null;
  branch_intent?: string | null;
  previous_block_id?: string | null;
  required_tags?: string[];
  exclude_tags?: string[];
  max_duration?: number | null;

  /** Enable LLM fallback for unresolved slots (uses agent profile persona). */
  allow_llm_fallback?: boolean;
  /** Agent profile ID for LLM generation persona (defaults to assistant:creative). */
  llm_profile_id?: string | null;
}

export interface PrimitiveSelectionRequestPayload {
  location_tag?: string | null;
  pose?: string | null;
  intimacy_level?: string | null;
  mood?: string | null;
  branch_intent?: string | null;
  previous_block_id?: string | null;
  lead_npc_id: number;
  partner_npc_id?: number | null;
  required_tags: string[];
  exclude_tags: string[];
  max_duration?: number | null;
  session_id?: number | null;
  world_id?: number | null;
}

export interface PrimitiveSelectionResponsePayload {
  blocks: Array<Record<string, unknown>>;
  total_duration: number;
  resolved_images: Array<Record<string, unknown>>;
  composition_assets: Array<Record<string, unknown>>;
  compatibility_score: number;
  fallback_reason?: string | null;
  prompts: string[];
  segments: Array<Record<string, unknown>>;
}

export interface BuildPrimitiveSelectionRequestFromBehaviorResponse {
  request: PrimitiveSelectionRequestPayload;
  derived: Record<string, unknown>;
}

export async function buildPrimitiveSelectionRequestFromBehavior(
  request: BuildPrimitiveSelectionRequestFromBehaviorRequest,
): Promise<BuildPrimitiveSelectionRequestFromBehaviorResponse> {
  return pixsimClient.post<BuildPrimitiveSelectionRequestFromBehaviorResponse>(
    '/game/dialogue/primitives/request-from-behavior',
    request,
  );
}

export async function selectPrimitiveBlocksFromBehavior(
  request: BuildPrimitiveSelectionRequestFromBehaviorRequest,
): Promise<PrimitiveSelectionResponsePayload> {
  return pixsimClient.post<PrimitiveSelectionResponsePayload>(
    '/game/dialogue/primitives/select-from-behavior',
    request,
  );
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
  flags?: Record<string, unknown>,
  worldId?: number
): Promise<GameSessionDTO> {
  return gameApi.createSession(sceneId, flags, worldId);
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

export type { UpsertDraftRequest, DraftSummary };

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
