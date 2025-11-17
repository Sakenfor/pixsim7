/**
 * @pixsim7/scene-gizmos
 * Pure TypeScript contracts for scene gizmo system
 * UI-agnostic types for interactive scene control
 */

// Core gizmo types
export type {
  Vector3D,
  GizmoState,
  GizmoZone,
  GizmoAnchor,
  SceneGizmoConfig,
  GizmoAction,
  GizmoResult,
  GizmoComponentProps,
  GizmoDefinition,
  ComponentType,
  BoundingBox,
  Transform,
  AnimationCurve,
  GizmoEvent,
} from './core';

// Interactive tool types
export type {
  InteractiveTool,
  TouchPattern,
  ParticleEffect,
  HapticPattern,
  AudioFeedback,
  ReactionType,
  TrailEffect,
} from './tools';
