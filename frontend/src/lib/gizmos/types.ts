/**
 * Scene Gizmo System - Types and Contracts
 * Extensible system for interactive scene control
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
// Interactive Tools (Diegetic)
// ============================================================================

export interface InteractiveTool {
  id: string;
  type: 'touch' | 'caress' | 'tease' | 'pleasure' | 'temperature' | 'energy';

  visual: {
    model: 'hand' | 'feather' | 'ice' | 'flame' | 'silk' | 'electric' | 'water';
    baseColor: string;
    activeColor: string;
    glow?: boolean;
    trail?: boolean;
    particles?: ParticleEffect;
    distortion?: boolean; // Heat shimmer, water ripple, etc.
  };

  physics: {
    pressure: number; // 0-1
    speed: number; // 0-1
    temperature?: number; // 0 (cold) to 1 (hot)
    pattern?: TouchPattern;
    vibration?: number; // 0-1, intensity
  };

  feedback: {
    haptic?: HapticPattern;
    audio?: AudioFeedback;
    npcReaction?: ReactionType;
    trail?: TrailEffect;
  };

  constraints?: {
    minPressure?: number;
    maxSpeed?: number;
    allowedZones?: string[];
    cooldown?: number; // ms between uses
  };
}

export type TouchPattern =
  | 'circular'
  | 'linear'
  | 'tap'
  | 'hold'
  | 'zigzag'
  | 'spiral'
  | 'wave'
  | 'pulse';

export interface ParticleEffect {
  type: 'hearts' | 'sparks' | 'droplets' | 'steam' | 'frost' | 'petals' | 'energy';
  density: number; // 0-1
  color?: string;
  size?: number;
  lifetime?: number; // ms
  velocity?: Vector3D;
}

export interface HapticPattern {
  type: 'pulse' | 'vibrate' | 'wave' | 'heartbeat';
  intensity: number; // 0-1
  duration: number; // ms
}

export interface AudioFeedback {
  sound: string; // Audio file/id
  volume: number; // 0-1
  pitch?: number; // 0.5-2
  loop?: boolean;
}

export interface ReactionType {
  expression?: 'pleasure' | 'surprise' | 'anticipation' | 'satisfaction';
  vocalization?: 'moan' | 'gasp' | 'giggle' | 'sigh';
  animation?: string;
  intensity: number; // 0-1
}

export interface TrailEffect {
  type: 'fade' | 'sparkle' | 'ripple' | 'heat';
  color: string;
  width: number;
  lifetime: number; // ms
}

// ============================================================================
// Gizmo Registration
// ============================================================================

export interface GizmoDefinition {
  id: string;
  name: string;
  category: 'control' | 'interactive' | 'hybrid';

  // Component to render
  component: React.ComponentType<GizmoComponentProps>;

  // Default configuration
  defaultConfig?: Partial<SceneGizmoConfig>;

  // Metadata
  description?: string;
  preview?: string; // Preview image/video URL
  tags?: string[];
  author?: string;
}

export interface GizmoComponentProps {
  config: SceneGizmoConfig;
  state: GizmoState;
  onStateChange: (state: Partial<GizmoState>) => void;
  onAction: (action: GizmoAction) => void;
  videoElement?: HTMLVideoElement;
  isActive: boolean;
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