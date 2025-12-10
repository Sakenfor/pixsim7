/**
 * Model Inspector Types
 *
 * Types for 3D model viewing, animation preview, and contact zone configuration.
 */

/**
 * Properties for a contact zone on a 3D model.
 * Used to define interaction behavior when a tool touches this zone.
 */
export interface ZoneProperties {
  /** Display name (defaults to group name if not specified) */
  label?: string;
  /** Base sensitivity multiplier (0-1) */
  sensitivity: number;
  /** Ticklishness factor for tickle interactions (0-1) */
  ticklishness?: number;
  /** Pleasure factor for pleasure interactions (0-1) */
  pleasure?: number;
  /** Stat modifiers applied when interacting with this zone */
  statModifiers?: Record<string, number>;
  /** Color used to highlight this zone in the editor */
  highlightColor?: string;
}

/**
 * A 3D contact zone extracted from a model.
 * Maps vertex groups or named meshes to interaction properties.
 */
export interface ContactZone3D {
  /** Unique identifier (vertex group name or mesh name from glTF) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Names of meshes this zone applies to */
  meshNames: string[];
  /** Interaction properties for this zone */
  properties: ZoneProperties;
}

/**
 * Complete 3D model configuration for a tool.
 * Used to define how a tool appears and behaves in 3D.
 */
export interface Tool3DModel {
  /** URL to the glTF/GLB model file */
  url: string;
  /** Scale multiplier (default: 1) */
  scale?: number;
  /** Name of the default animation to play */
  defaultAnimation?: string;
  /** Contact zones mapped by zone ID */
  zones: Record<string, ZoneProperties>;
}

/**
 * Information about an animation clip in a model.
 */
export interface AnimationClipInfo {
  /** Name of the animation clip */
  name: string;
  /** Duration in seconds */
  duration: number;
  /** Number of tracks in this animation */
  trackCount: number;
}

/**
 * Viewport camera state for saving/restoring views.
 */
export interface ViewportCameraState {
  /** Camera position */
  position: [number, number, number];
  /** Camera target/look-at point */
  target: [number, number, number];
  /** Field of view in degrees */
  fov: number;
  /** Near clipping plane */
  near: number;
  /** Far clipping plane */
  far: number;
}

/**
 * Result from parsing a glTF model for zones and animations.
 */
export interface ModelParseResult {
  /** Detected zone IDs (from mesh names or vertex groups) */
  zoneIds: string[];
  /** Zone ID to mesh name mapping */
  zoneMeshMap: Record<string, string[]>;
  /** Available animation clips */
  animations: AnimationClipInfo[];
  /** Model bounding box dimensions */
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  };
}

/**
 * Mode for the Model Inspector panel.
 */
export type InspectorMode = 'view' | 'zones' | 'animation';

/**
 * View mode for model rendering.
 */
export type RenderMode = 'solid' | 'wireframe' | 'zones';

/**
 * Default zone properties for new zones.
 */
export const DEFAULT_ZONE_PROPERTIES: ZoneProperties = {
  sensitivity: 0.5,
  ticklishness: 0,
  pleasure: 0,
  highlightColor: '#4a9eff',
};

/**
 * Zone color palette for distinguishing zones visually.
 */
export const ZONE_COLORS = [
  '#4a9eff', // Blue
  '#ff4a9e', // Pink
  '#9eff4a', // Green
  '#ff9e4a', // Orange
  '#9e4aff', // Purple
  '#4afff0', // Cyan
  '#ff4a4a', // Red
  '#f0ff4a', // Yellow
] as const;

/**
 * Get a color for a zone based on its index.
 */
export function getZoneColor(index: number): string {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}
