/**
 * Mini-game types for game-ui package
 * Re-exports and simplifies types from frontend gizmo system
 */

// Basic geometric types
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

// Scene Gizmo Configuration
export interface SceneGizmoConfig {
  zones: GizmoZone[];
  anchors?: GizmoAnchor[];
  style?: 'orb' | 'rings' | 'constellation' | 'helix';
  gestures?: Record<string, GizmoAction>;
  visual?: {
    baseColor?: string;
    activeColor?: string;
    particleType?: 'hearts' | 'sparks' | 'bubbles' | 'steam' | 'stars';
    glowIntensity?: number;
  };
  physics?: {
    gravity?: number;
    friction?: number;
    magnetism?: boolean;
  };
}

export interface GizmoZone {
  id: string;
  position: Vector3D;
  radius: number;
  segmentId?: string;
  tags?: string[];
  intensity?: number;
  color?: string;
  label?: string;
}

export interface GizmoAnchor {
  id: string;
  position: Vector3D;
  magnetRadius: number;
  snapStrength?: number;
}

export interface GizmoAction {
  type: 'segment' | 'intensity' | 'speed' | 'mode' | 'flag';
  value: string | number;
  transition?: 'instant' | 'smooth' | 'bounce';
}

// Gizmo result (what gets passed back to scene progression)
export interface GizmoResult {
  segmentId?: string;
  intensity?: number;
  speed?: number;
  flags?: Record<string, any>;
  tags?: string[];
  transition?: 'cut' | 'fade' | 'smooth';
}
