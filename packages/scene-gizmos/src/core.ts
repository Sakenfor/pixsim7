/**
 * Scene Gizmo System - Core Types and Contracts
 * Pure TypeScript types for gizmo configuration and state
 */

// ============================================================================
// Core Gizmo Types
// ============================================================================

export interface GizmoState {
  position: Vector3D;
  rotation: Vector3D;
  scale: number;
  pressure?: number; // 0-1, for touch/pressure sensitive
  velocity?: Vector3D; // For gesture detection
  activeZone?: string;
  proximity?: Record<string, number>; // Distance to each zone
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GizmoZone {
  id: string;
  position: Vector3D;
  radius: number;
  segmentId?: string;
  tags?: string[];
  intensity?: number; // 0-1
  color?: string;
  label?: string;
  magnetism?: number; // 0-1, how strongly it attracts
}

export interface GizmoAnchor {
  id: string;
  position: Vector3D;
  magnetRadius: number;
  snapStrength?: number; // 0-1
  visualHint?: 'pulse' | 'glow' | 'particles';
}

// ============================================================================
// Gizmo Configuration
// ============================================================================

export interface SceneGizmoConfig {
  // Control zones in 3D space
  zones: GizmoZone[];

  // Anchor points for snapping
  anchors?: GizmoAnchor[];

  // Visual style
  style?: 'orb' | 'rings' | 'constellation' | 'helix' | 'custom';

  // Gesture mappings
  gestures?: {
    swipeUp?: GizmoAction;
    swipeDown?: GizmoAction;
    swipeLeft?: GizmoAction;
    swipeRight?: GizmoAction;
    rotateClockwise?: GizmoAction;
    rotateCounterClockwise?: GizmoAction;
    pinch?: GizmoAction;
    spread?: GizmoAction;
    push?: GizmoAction;
    pull?: GizmoAction;
    shake?: GizmoAction;
    hold?: GizmoAction;
  };

  // Visual configuration
  visual?: {
    baseColor?: string;
    activeColor?: string;
    particleType?: 'hearts' | 'sparks' | 'bubbles' | 'steam' | 'stars';
    glowIntensity?: number;
    trailLength?: number;
    opacity?: number;
  };

  // Physics
  physics?: {
    gravity?: number;
    friction?: number;
    springiness?: number;
    magnetism?: boolean;
  };

  // Audio feedback
  audio?: {
    hover?: string;
    select?: string;
    gesture?: string;
    ambient?: string;
  };
}

export interface GizmoAction {
  type: 'segment' | 'intensity' | 'speed' | 'mode' | 'flag';
  value: string | number;
  transition?: 'instant' | 'smooth' | 'bounce';
}

// ============================================================================
// Scene Control Result
// ============================================================================

export interface GizmoResult {
  segmentId?: string;
  intensity?: number;
  speed?: number;
  flags?: Record<string, any>;
  tags?: string[];
  transition?: 'cut' | 'fade' | 'smooth';
}

// ============================================================================
// Helper Types
// ============================================================================

export interface BoundingBox {
  min: Vector3D;
  max: Vector3D;
}

export interface Transform {
  position: Vector3D;
  rotation: Vector3D;
  scale: Vector3D;
}

export interface AnimationCurve {
  type: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' | 'bounce';
  duration: number; // ms
  delay?: number; // ms
}

// ============================================================================
// Event Types
// ============================================================================

export interface GizmoEvent {
  type: 'hover' | 'select' | 'drag' | 'release' | 'gesture' | 'collision';
  gizmoId: string;
  state: GizmoState;
  data?: any;
  timestamp: number;
}

// ============================================================================
// Component Interface
// ============================================================================

export interface GizmoComponentProps {
  config: SceneGizmoConfig;
  state: GizmoState;
  onStateChange: (state: Partial<GizmoState>) => void;
  onAction: (action: GizmoAction) => void;
  videoElement?: HTMLVideoElement;
  isActive: boolean;
}

// ============================================================================
// Gizmo Registration
// ============================================================================

export interface GizmoDefinition<TProps = GizmoComponentProps> {
  id: string;
  name: string;
  category: 'control' | 'interactive' | 'hybrid';

  // Component to render - generic to avoid React dependency
  component: ComponentType<TProps>;

  // Default configuration
  defaultConfig?: Partial<SceneGizmoConfig>;

  // Metadata
  description?: string;
  preview?: string; // Preview image/video URL
  tags?: string[];
  author?: string;
}

// Generic component type to avoid direct React dependency
export type ComponentType<P = any> = (props: P) => any;
