export interface GameLocationSummary {
  id: number
  name: string
  asset_id?: number | null
  default_spawn?: string | null
}

export interface GameHotspotDTO {
  id?: number
  object_name: string
  hotspot_id: string
  linked_scene_id?: number | null
  meta?: Record<string, unknown> | null
}

export interface GameLocationDetail {
  id: number
  name: string
  asset_id?: number | null
  default_spawn?: string | null
  meta?: Record<string, unknown> | null
  hotspots: GameHotspotDTO[]
}

