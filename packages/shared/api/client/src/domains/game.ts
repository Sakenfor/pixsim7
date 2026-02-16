/**
 * Game API Domain Client
 *
 * Provides typed access to game-related endpoints including worlds,
 * sessions, scenes, NPCs, quests, inventory, and template resolution.
 */
import type { PixSimApiClient } from '../client';
import type {
  ApiComponents,
  ApiOperations,
  TemplateKind as SharedTemplateKind,
  ResolveTemplateResponse as SharedResolveTemplateResponse,
  ResolveBatchResponse as SharedResolveBatchResponse,
  RuntimeKind,
} from '@pixsim7/shared.types';
import { toCamelCaseShallow } from '@pixsim7/shared.helpers.core';

type Schemas = ApiComponents['schemas'];
type Ops = ApiOperations;

// ===== World Types =====

type CreateWorldRequest =
  Ops['create_world_api_v1_game_worlds__post']['requestBody']['content']['application/json'];
type UpdateWorldMetaRequest =
  Ops['update_world_meta_api_v1_game_worlds__world_id__meta_put']['requestBody']['content']['application/json'];
type AdvanceWorldTimeRequest =
  Ops['advance_world_time_api_v1_game_worlds__world_id__advance_post']['requestBody']['content']['application/json'];

export type GameWorldSummary = Schemas['GameWorldSummary'];
export type GameWorldDetail = Schemas['GameWorldDetail'];
export type PaginatedWorldsResponse = Schemas['PaginatedWorldsResponse'];
export type WorldConfigResponse = Schemas['WorldConfigResponse'];

// ===== Session Types =====

type CreateSessionRequest =
  Ops['create_session_api_v1_game_sessions__post']['requestBody']['content']['application/json'];

export type GameSessionDTO = Schemas['GameSessionResponse'];
export type SessionUpdatePayload = Schemas['SessionUpdateRequest'];
export type GameSessionSummary = Pick<GameSessionDTO, 'id' | 'scene_id' | 'world_time'>;

// ===== Location Types =====

type ReplaceHotspotsPayload =
  Ops['replace_hotspots_api_v1_game_locations__location_id__hotspots_put']['requestBody']['content']['application/json'];

export type GameLocationSummary = Schemas['GameLocationSummary'];
export type GameHotspotInputDTO = Schemas['GameHotspotDTO-Input'];
export type GameHotspotDTO = Schemas['GameHotspotDTO-Output'];
export type GameLocationDetail = Schemas['GameLocationDetail'];

// ===== NPC Types =====

type NpcPresenceQuery =
  Ops['get_npc_presence_api_v1_game_npcs_presence_get']['parameters']['query'];

export type GameNpcSummary = Schemas['NpcSummary'];
export type GameNpcDetail = Schemas['GameNPC'];
export type NpcExpressionDTO = Schemas['NpcExpressionDTO'];
export type NpcPresenceDTO = Schemas['NpcPresenceDTO'];

// ===== Scene Types =====

export type Scene = Schemas['SceneResponse'];

// ===== Quest Types =====

type ListQuestsQuery =
  Ops['list_session_quests_api_v1_game_quests_sessions__session_id__quests_get']['parameters']['query'];
type AddQuestRequest =
  Ops['add_quest_to_session_api_v1_game_quests_sessions__session_id__quests_post']['requestBody']['content']['application/json'];
type UpdateQuestStatusRequest =
  Ops['update_quest_status_api_v1_game_quests_sessions__session_id__quests__quest_id__status_patch']['requestBody']['content']['application/json'];

export type QuestObjectiveDTO = Schemas['QuestObjective'];
export type QuestDTO = Schemas['Quest'];

// ===== Inventory Types =====

type AddInventoryItemRequest =
  Ops['add_item_to_inventory_api_v1_game_inventory_sessions__session_id__items_post']['requestBody']['content']['application/json'];
type RemoveInventoryItemRequest =
  Ops['remove_item_from_inventory_api_v1_game_inventory_sessions__session_id__items__item_id__delete']['requestBody']['content']['application/json'];

export type InventoryItemDTO = Schemas['InventoryItem'];
export type InventoryStatsResponse = Schemas['InventoryStatsResponse'];
export type MessageResponse = Schemas['MessageResponse'];

// ===== Template Resolution Types =====

type ResolveTemplateRequest =
  Ops['resolve_template_api_v1_game_links_resolve_post']['requestBody']['content']['application/json'];
type ResolveBatchRequest =
  Ops['resolve_batch_api_v1_game_links_resolve_batch_post']['requestBody']['content']['application/json'];

export type TemplateKind = SharedTemplateKind;
export type ResolveTemplateResponse = SharedResolveTemplateResponse;
export type ResolveBatchResponse = SharedResolveBatchResponse;

type ResolveTemplateResponseDto = Schemas['ResolveTemplateResponse'] & {
  found?: boolean;
};

type ResolveBatchResponseDto = Schemas['ResolveBatchResponse'];

function normalizeResolveTemplateResponse(
  raw: ResolveTemplateResponseDto,
  fallback: { templateKind: string; templateId: string }
): ResolveTemplateResponse {
  const camel = toCamelCaseShallow(raw) as {
    resolved?: boolean;
    found?: boolean;
    runtimeKind?: string | null;
    runtimeId?: number | null;
    templateKind?: string;
    templateId?: string;
  };

  return {
    resolved: camel.resolved ?? camel.found ?? false,
    runtimeKind: (camel.runtimeKind ?? undefined) as RuntimeKind | undefined,
    runtimeId: camel.runtimeId ?? undefined,
    templateKind: camel.templateKind ?? fallback.templateKind,
    templateId: camel.templateId ?? fallback.templateId,
  };
}

function parseTemplateRefKey(key: string): { templateKind: string; templateId: string } {
  const idx = key.indexOf(':');
  if (idx === -1) {
    return { templateKind: '', templateId: key };
  }
  return {
    templateKind: key.slice(0, idx),
    templateId: key.slice(idx + 1),
  };
}

// ===== Game API Factory =====

export function createGameApi(client: PixSimApiClient) {
  return {
    // ===== Worlds =====

    async listWorlds(): Promise<GameWorldSummary[]> {
      const response = await client.get<PaginatedWorldsResponse>('/game/worlds');
      return [...response.worlds];
    },

    async getWorld(worldId: number): Promise<GameWorldDetail> {
      return client.get<GameWorldDetail>(`/game/worlds/${worldId}`);
    },

    async createWorld(name: string, meta?: Record<string, unknown>): Promise<GameWorldDetail> {
      const request: CreateWorldRequest = { name, meta };
      return client.post<GameWorldDetail>('/game/worlds', request);
    },

    async updateWorldMeta(worldId: number, meta: Record<string, unknown>): Promise<GameWorldDetail> {
      const request: UpdateWorldMetaRequest = { meta };
      return client.put<GameWorldDetail>(`/game/worlds/${worldId}/meta`, request);
    },

    async getWorldConfig(worldId: number): Promise<WorldConfigResponse> {
      return client.get<WorldConfigResponse>(`/game/worlds/${worldId}/config`);
    },

    async advanceWorldTime(worldId: number, deltaSeconds: number): Promise<GameWorldDetail> {
      const request: AdvanceWorldTimeRequest = { delta_seconds: deltaSeconds };
      return client.post<GameWorldDetail>(`/game/worlds/${worldId}/advance`, request);
    },

    // ===== Sessions =====

    async createSession(
      sceneId: number,
      flags?: Record<string, unknown>,
      worldId?: number
    ): Promise<GameSessionDTO> {
      const request: CreateSessionRequest = {
        scene_id: sceneId,
        world_id: worldId,
        flags,
      };
      return client.post<GameSessionDTO>('/game/sessions', request);
    },

    async getSession(sessionId: number): Promise<GameSessionDTO> {
      return client.get<GameSessionDTO>(`/game/sessions/${sessionId}`);
    },

    async updateSession(sessionId: number, payload: SessionUpdatePayload): Promise<GameSessionDTO> {
      return client.patch<GameSessionDTO>(`/game/sessions/${sessionId}`, payload);
    },

    // ===== Locations =====

    async listLocations(): Promise<GameLocationSummary[]> {
      const response = await client.get<readonly GameLocationSummary[]>('/game/locations');
      return [...response];
    },

    async getLocation(locationId: number): Promise<GameLocationDetail> {
      return client.get<GameLocationDetail>(`/game/locations/${locationId}`);
    },

    async saveLocationHotspots(
      locationId: number,
      hotspots: readonly GameHotspotInputDTO[]
    ): Promise<GameLocationDetail> {
      const request: ReplaceHotspotsPayload = { hotspots };
      return client.put<GameLocationDetail>(`/game/locations/${locationId}/hotspots`, request);
    },

    // ===== NPCs =====

    async listNpcs(): Promise<GameNpcSummary[]> {
      const response = await client.get<readonly GameNpcSummary[]>('/game/npcs');
      return [...response];
    },

    async getNpc(npcId: number): Promise<GameNpcDetail> {
      return client.get<GameNpcDetail>(`/game/npcs/${npcId}`);
    },

    async saveNpcMeta(npcId: number, meta: Record<string, unknown>): Promise<GameNpcDetail> {
      return client.put<GameNpcDetail>(`/game/npcs/${npcId}`, { meta });
    },

    async getNpcPresence(params: {
      world_time: number;
      world_id?: number;
      location_id?: number;
    }): Promise<NpcPresenceDTO[]> {
      const query: NpcPresenceQuery = {
        world_time: params.world_time,
        world_id: params.world_id,
        location_id: params.location_id,
      };
      const response = await client.get<readonly NpcPresenceDTO[]>('/game/npcs/presence', {
        params: query,
      });
      return [...response];
    },

    // ===== Scenes =====

    async getScene(sceneId: number): Promise<Scene> {
      return client.get<Scene>(`/game/scenes/${sceneId}`);
    },

    // ===== Quests =====

    async listQuests(sessionId: number, status?: string): Promise<QuestDTO[]> {
      const params: ListQuestsQuery | undefined = status ? { status } : undefined;
      const response = await client.get<readonly QuestDTO[]>(
        `/game/quests/sessions/${sessionId}/quests`,
        { params }
      );
      return [...response];
    },

    async getQuest(sessionId: number, questId: string): Promise<QuestDTO> {
      return client.get<QuestDTO>(`/game/quests/sessions/${sessionId}/quests/${questId}`);
    },

    async addQuest(sessionId: number, questData: AddQuestRequest): Promise<QuestDTO> {
      return client.post<QuestDTO>(`/game/quests/sessions/${sessionId}/quests`, questData);
    },

    async updateQuestStatus(sessionId: number, questId: string, status: string): Promise<QuestDTO> {
      const request: UpdateQuestStatusRequest = { status };
      return client.patch<QuestDTO>(
        `/game/quests/sessions/${sessionId}/quests/${questId}/status`,
        request
      );
    },

    // ===== Inventory =====

    async listInventoryItems(sessionId: number): Promise<InventoryItemDTO[]> {
      const response = await client.get<readonly InventoryItemDTO[]>(
        `/game/inventory/sessions/${sessionId}/items`
      );
      return [...response];
    },

    async addInventoryItem(sessionId: number, itemData: AddInventoryItemRequest): Promise<InventoryItemDTO> {
      return client.post<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items`, itemData);
    },

    async removeInventoryItem(sessionId: number, itemId: string, quantity?: number): Promise<MessageResponse> {
      const payload: RemoveInventoryItemRequest = { quantity: quantity ?? 1 };
      return client.delete<MessageResponse>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, {
        data: payload,
      });
    },

    async getInventoryStats(sessionId: number): Promise<InventoryStatsResponse> {
      return client.get<InventoryStatsResponse>(`/game/inventory/sessions/${sessionId}/stats`);
    },

    // ===== Template Resolution =====

    async resolveTemplate(
      templateKind: TemplateKind,
      templateId: string,
      context?: Record<string, unknown>
    ): Promise<ResolveTemplateResponse> {
      const request: ResolveTemplateRequest = {
        template_kind: templateKind,
        template_id: templateId,
        context,
      };
      const raw = await client.post<ResolveTemplateResponseDto>('/game/links/resolve', request);
      return normalizeResolveTemplateResponse(raw, { templateKind, templateId });
    },

    async resolveTemplateBatch(
      refs: Array<{
        templateKind: TemplateKind;
        templateId: string;
        context?: Record<string, unknown>;
      }>,
      sharedContext?: Record<string, unknown>
    ): Promise<ResolveBatchResponse> {
      const refsByKey = new Map<string, { templateKind: string; templateId: string }>();
      for (const ref of refs) {
        refsByKey.set(`${ref.templateKind}:${ref.templateId}`, {
          templateKind: ref.templateKind,
          templateId: ref.templateId,
        });
      }

      const request: ResolveBatchRequest = {
        refs: refs.map((ref) => ({
          template_kind: ref.templateKind,
          template_id: ref.templateId,
          context: ref.context,
        })),
        shared_context: sharedContext,
      };
      const raw = await client.post<ResolveBatchResponseDto>('/game/links/resolve-batch', request);

      const rawCamel = toCamelCaseShallow(raw) as {
        results?: Record<string, ResolveTemplateResponseDto>;
        resolvedCount?: number;
        totalCount?: number;
      };

      const results: Record<string, ResolveTemplateResponse> = {};
      for (const [key, value] of Object.entries(rawCamel.results || {})) {
        results[key] = normalizeResolveTemplateResponse(
          value,
          refsByKey.get(key) || parseTemplateRefKey(key)
        );
      }

      const resolvedCount =
        rawCamel.resolvedCount ??
        Object.values(results).filter((entry) => entry.resolved).length;

      return {
        results,
        resolvedCount,
        totalCount: rawCamel.totalCount ?? refs.length,
      };
    },
  };
}
