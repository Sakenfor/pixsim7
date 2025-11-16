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

export async function getGameScene(sceneId: number): Promise<Scene> {
  const res = await apiClient.get<Scene>(`/game/scenes/${sceneId}`);
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
