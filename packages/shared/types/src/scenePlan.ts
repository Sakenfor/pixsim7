import type { CoordinateSpace } from './game';
import type { LocationId, NpcId, SessionId, WorldId } from './ids';

/**
 * Scene Plan domain
 *
 * ScenePlan is a spatial/intent planning contract that can be projected into
 * 2D or 3D render/execution paths.
 */

export type ScenePlanSource =
  | 'manual'
  | 'behavior'
  | 'runtime'
  | 'scene_prep'
  | 'imported';

export type SceneBeatActorRole =
  | 'lead'
  | 'partner'
  | 'extra'
  | 'camera'
  | (string & {});

export type ScenePathIntent =
  | 'idle'
  | 'arrive'
  | 'move'
  | 'interact'
  | 'depart'
  | (string & {});

export type SceneCameraTargetType = 'actor' | 'anchor' | 'position';

/**
 * SceneTransform mirrors the shared Transform shape but keeps IDs flexible
 * for transport and draft workflows.
 */
export interface SceneTransform {
  worldId?: WorldId | number;
  locationId?: LocationId | number;
  position: { x: number; y: number; z?: number };
  orientation?: { yaw?: number; pitch?: number; roll?: number };
  scale?: { x?: number; y?: number; z?: number };
  space?: CoordinateSpace;
}

export interface SceneCameraIntent {
  type?: 'static' | 'pan' | 'orbit' | 'track' | 'dolly' | (string & {});
  speed?: string;
  path?: string;
  focus?: string;
  cameraViewId?: string;
  cameraFramingId?: string;
  targetType?: SceneCameraTargetType;
  targetActorRole?: SceneBeatActorRole;
  targetAnchorId?: string;
  position?: { x: number; y: number; z?: number };
  meta?: Record<string, unknown>;
}

export interface SceneAnchor {
  id: string;
  label?: string;
  worldId?: WorldId | number;
  locationId?: LocationId | number;
  transform: SceneTransform;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface SceneBeatActorTarget {
  role: SceneBeatActorRole;
  actorId?: NpcId | number | string;
  anchorId?: string;
  transform?: SceneTransform;
  pathIntent?: ScenePathIntent;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface SceneBeat {
  id: string;
  order: number;
  label?: string;
  intent?: string;
  startTimeSec?: number;
  durationSec?: number;
  worldId?: WorldId | number;
  locationId?: LocationId | number;
  actorTargets: SceneBeatActorTarget[];
  camera?: SceneCameraIntent;
  requiredPrimitiveCategories?: string[];
  requiredTags?: string[];
  notes?: string;
  meta?: Record<string, unknown>;
}

export interface ScenePlanContext {
  worldId?: WorldId | number;
  sessionId?: SessionId | number;
  locationId?: LocationId | number;
  worldTimeSeconds?: number;
  leadNpcId?: NpcId | number;
  partnerNpcId?: NpcId | number;
  coordinateSpace?: CoordinateSpace;
  tags?: string[];
  meta?: Record<string, unknown>;
}

export interface ScenePlan {
  id: string;
  version: number;
  source: ScenePlanSource;
  context: ScenePlanContext;
  anchors: SceneAnchor[];
  beats: SceneBeat[];
  createdAt: string;
  updatedAt?: string;
  meta?: Record<string, unknown>;
}
