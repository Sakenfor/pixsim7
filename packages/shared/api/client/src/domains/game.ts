/**
 * Game API Domain Client
 *
 * Provides typed access to game-related endpoints including worlds,
 * sessions, scenes, NPCs, quests, and inventory.
 */
import type { PixSimApiClient } from '../client';
import type {
  TemplateKind as SharedTemplateKind,
  ResolveTemplateResponse as SharedResolveTemplateResponse,
  ResolveBatchResponse as SharedResolveBatchResponse,
  RuntimeKind,
} from '@pixsim7/shared.types';
import { toCamelCaseShallow } from '@pixsim7/shared.helpers.core';

// ===== World Types =====

export interface GameWorldSummary {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GameWorldDetail extends GameWorldSummary {
  meta: Record<string, unknown>;
  world_time: number;
}

export interface PaginatedWorldsResponse {
  worlds: GameWorldSummary[];
  total: number;
  page: number;
  per_page: number;
}

export interface WorldConfigResponse {
  world_id: number;
  stat_definitions: Record<string, unknown>;
  relationship_types: string[];
  flag_definitions: Record<string, unknown>;
}

// ===== Session Types =====

export interface GameSessionSummary {
  id: number;
  scene_id: number;
  world_time: number;
  created_at: string;
}

export interface GameSessionDTO {
  id: number;
  scene_id: number;
  world_id: number;
  world_time: number;
  flags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  npc_states: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SessionUpdatePayload {
  flags?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  npc_states?: Record<string, unknown>;
  expected_version?: number;
}

// ===== Location Types =====

export interface GameLocationSummary {
  id: number;
  name: string;
  world_id: number;
}

export interface GameHotspotDTO {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  label?: string;
  meta?: Record<string, unknown>;
}

export interface GameLocationDetail extends GameLocationSummary {
  hotspots: GameHotspotDTO[];
  meta: Record<string, unknown>;
}

// ===== NPC Types =====

export interface GameNpcSummary {
  id: number;
  name: string;
  world_id: number;
}

export interface GameNpcDetail extends GameNpcSummary {
  meta: Record<string, unknown>;
  expressions: NpcExpressionDTO[];
}

export interface NpcExpressionDTO {
  id: string;
  name: string;
  asset_id?: number;
}

export interface NpcPresenceDTO {
  npc_id: number;
  location_id: number;
  present: boolean;
  schedule_source?: string;
}

// ===== Scene Types =====

export interface Scene {
  id: number;
  name: string;
  world_id: number;
  location_id?: number;
  meta: Record<string, unknown>;
}

// ===== Quest Types =====

export interface QuestObjectiveDTO {
  id: string;
  description: string;
  target?: number;
  progress?: number;
  completed: boolean;
  optional?: boolean;
}

export interface QuestDTO {
  quest_id: string;
  session_id: number;
  title: string;
  description: string;
  status: string;
  objectives: QuestObjectiveDTO[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ===== Inventory Types =====

export interface InventoryItemDTO {
  item_id: string;
  session_id: number;
  name: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface InventoryStatsResponse {
  total_items: number;
  unique_items: number;
  total_quantity: number;
}

// ===== Template Resolution Types =====

export type TemplateKind = SharedTemplateKind;
export type ResolveTemplateResponse = SharedResolveTemplateResponse;
export type ResolveBatchResponse = SharedResolveBatchResponse;

interface ResolveTemplateResponseDto {
  resolved?: boolean;
  found?: boolean;
  runtime_kind?: string | null;
  runtime_id?: number | null;
  template_kind?: string;
  template_id?: string;
}

interface ResolveBatchResponseDto {
  results: Record<string, ResolveTemplateResponseDto>;
  resolved_count?: number;
  total_count?: number;
}

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
      return response.worlds;
    },

    async getWorld(worldId: number): Promise<GameWorldDetail> {
      return client.get<GameWorldDetail>(`/game/worlds/${worldId}`);
    },

    async createWorld(name: string, meta?: Record<string, unknown>): Promise<GameWorldDetail> {
      return client.post<GameWorldDetail>('/game/worlds', { name, meta });
    },

    async updateWorldMeta(worldId: number, meta: Record<string, unknown>): Promise<GameWorldDetail> {
      return client.put<GameWorldDetail>(`/game/worlds/${worldId}/meta`, { meta });
    },

    async getWorldConfig(worldId: number): Promise<WorldConfigResponse> {
      return client.get<WorldConfigResponse>(`/game/worlds/${worldId}/config`);
    },

    async advanceWorldTime(worldId: number, deltaSeconds: number): Promise<GameWorldDetail> {
      return client.post<GameWorldDetail>(`/game/worlds/${worldId}/advance`, {
        delta_seconds: deltaSeconds,
      });
    },

    // ===== Sessions =====

    async createSession(sceneId: number, flags?: Record<string, unknown>): Promise<GameSessionDTO> {
      return client.post<GameSessionDTO>('/game/sessions', { scene_id: sceneId, flags });
    },

    async getSession(sessionId: number): Promise<GameSessionDTO> {
      return client.get<GameSessionDTO>(`/game/sessions/${sessionId}`);
    },

    async updateSession(sessionId: number, payload: SessionUpdatePayload): Promise<GameSessionDTO> {
      return client.patch<GameSessionDTO>(`/game/sessions/${sessionId}`, payload);
    },

    // ===== Locations =====

    async listLocations(): Promise<GameLocationSummary[]> {
      return client.get<GameLocationSummary[]>('/game/locations');
    },

    async getLocation(locationId: number): Promise<GameLocationDetail> {
      return client.get<GameLocationDetail>(`/game/locations/${locationId}`);
    },

    async saveLocationHotspots(locationId: number, hotspots: GameHotspotDTO[]): Promise<GameLocationDetail> {
      return client.put<GameLocationDetail>(`/game/locations/${locationId}/hotspots`, { hotspots });
    },

    // ===== NPCs =====

    async listNpcs(): Promise<GameNpcSummary[]> {
      return client.get<GameNpcSummary[]>('/game/npcs');
    },

    async getNpc(npcId: number): Promise<GameNpcDetail> {
      return client.get<GameNpcDetail>(`/game/npcs/${npcId}`);
    },

    async saveNpcMeta(npcId: number, meta: Record<string, unknown>): Promise<GameNpcDetail> {
      return client.put<GameNpcDetail>(`/game/npcs/${npcId}/meta`, { meta });
    },

    async getNpcPresence(params: {
      world_time: number;
      world_id?: number;
      location_id?: number;
    }): Promise<NpcPresenceDTO[]> {
      return client.get<NpcPresenceDTO[]>('/game/npcs/presence', { params });
    },

    // ===== Scenes =====

    async getScene(sceneId: number): Promise<Scene> {
      return client.get<Scene>(`/game/scenes/${sceneId}`);
    },

    // ===== Quests =====

    async listQuests(sessionId: number, status?: string): Promise<QuestDTO[]> {
      return client.get<QuestDTO[]>(`/game/quests/sessions/${sessionId}/quests`, {
        params: status ? { status } : undefined,
      });
    },

    async getQuest(sessionId: number, questId: string): Promise<QuestDTO> {
      return client.get<QuestDTO>(`/game/quests/sessions/${sessionId}/quests/${questId}`);
    },

    async addQuest(sessionId: number, questData: {
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
    }): Promise<QuestDTO> {
      return client.post<QuestDTO>(`/game/quests/sessions/${sessionId}/quests`, questData);
    },

    async updateQuestStatus(sessionId: number, questId: string, status: string): Promise<QuestDTO> {
      return client.patch<QuestDTO>(
        `/game/quests/sessions/${sessionId}/quests/${questId}/status`,
        { status }
      );
    },

    // ===== Inventory =====

    async listInventoryItems(sessionId: number): Promise<InventoryItemDTO[]> {
      return client.get<InventoryItemDTO[]>(`/game/inventory/sessions/${sessionId}/items`);
    },

    async addInventoryItem(sessionId: number, itemData: {
      item_id: string;
      name: string;
      quantity?: number;
      metadata?: Record<string, unknown>;
    }): Promise<InventoryItemDTO> {
      return client.post<InventoryItemDTO>(`/game/inventory/sessions/${sessionId}/items`, itemData);
    },

    async removeInventoryItem(sessionId: number, itemId: string, quantity?: number): Promise<{ message: string }> {
      return client.delete<{ message: string }>(`/game/inventory/sessions/${sessionId}/items/${itemId}`, {
        data: quantity ? { quantity } : undefined,
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
      const raw = await client.post<ResolveTemplateResponseDto>('/game/links/resolve', {
        template_kind: templateKind,
        template_id: templateId,
        context,
      });
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

      const raw = await client.post<ResolveBatchResponseDto>('/game/links/resolve-batch', {
        refs: refs.map((ref) => ({
          template_kind: ref.templateKind,
          template_id: ref.templateId,
          context: ref.context,
        })),
        shared_context: sharedContext,
      });

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
