import { apiClient } from './api/client';

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

