export interface GameLocationSummary {
  id: number
  name: string
  asset_id?: number | null
  default_spawn?: string | null
}

export interface GameHotspotDTO {
  id?: number
  scope?: import('@pixsim7/shared.types').HotspotScope | null
  world_id?: number | null
  location_id?: number | null
  scene_id?: number | null
  hotspot_id: string
  target?: import('@pixsim7/shared.types').HotspotTarget | null
  action?: import('@pixsim7/shared.types').HotspotAction | null
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
