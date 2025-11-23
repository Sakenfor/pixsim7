/**
 * Display space and target types
 *
 * Frontend-only helper types describing how 3D/2D display topology
 * is represented inside GameWorld.meta and GameHotspot.meta.
 *
 * These do not imply any backend schema changes; they are conventions
 * over JSON structures stored in `meta` fields.
 */

export type DisplaySpaceKind =
  | '3d-room'
  | '3d-outdoor'
  | '2d-layer'
  | 'ar-surface'
  | 'vr-space'
  | string;

export interface DisplaySurfaceConfig {
  id: string;
  label: string;
  /** Optional hint for 3D engines (e.g. glTF node name, screen mesh id). */
  nodeName?: string;
  /** Renderer-specific configuration (kept as arbitrary JSON). */
  config?: Record<string, unknown>;
}

export interface DisplaySpaceDefinition {
  id: string;
  kind: DisplaySpaceKind;
  label: string;
  description?: string;
  /** Optional mapping of surfaces (e.g. screens, billboards) within this space. */
  surfaces?: DisplaySurfaceConfig[];
  /** Renderer-specific configuration (camera presets, lighting, etc.). */
  config?: Record<string, unknown>;
}

export type DisplaySpacesMap = Record<string, DisplaySpaceDefinition>;

/**
 * A logical target inside the display topology.
 * Can be used by hotspots, UI, or future triggers.
 */
export interface DisplayTarget {
  /** Which space we want to target (e.g. room, outdoor area, or 2D layer space). */
  spaceId?: string;
  /** Which surface within that space (e.g. "tv-screen", "billboard-main"). */
  surfaceId?: string;
  /** Optional logical layer/channel (useful for HUD/overlay semantics). */
  layerId?: string;
}

/**
 * World-level display configuration stored in GameWorld.meta.display.
 */
export interface GameWorldDisplayMeta {
  spaces?: DisplaySpacesMap;
  /** Additional display-related metadata. */
  [key: string]: unknown;
}

/**
 * Resolved display target with concrete space/surface definitions.
 */
export interface ResolvedDisplayTarget {
  space: DisplaySpaceDefinition;
  surface?: DisplaySurfaceConfig;
  target: DisplayTarget;
}

