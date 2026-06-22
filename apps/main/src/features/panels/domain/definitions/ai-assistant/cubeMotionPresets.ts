/**
 * Cube-motion presets — how the AI-assistant tab cube animates per status, as
 * user-selectable bundles. The motion vocabulary lives in `CubeFaces` /
 * `EngineProfileIcon` (3D: spin/sway/toss; envelope: pulse/nudge); this maps the
 * three live tab states (working / waiting / unread) onto them per preset.
 *
 * Only consulted in the cube icon skin. Selected via the global
 * `cubeMotionPreset` appearance setting. See plan `media-card-badge-skin`.
 */
import type { CubeMotionPreset } from '@features/appearance';

export type CubeMotionType = 'spin' | 'sway' | 'toss' | 'pulse' | 'nudge';
export interface CubeMotionSpec {
  type: CubeMotionType;
  duration?: string;
}

interface PresetStates {
  /** Active "working" state — duration is derived from live activity, so only the type is fixed here. */
  working: CubeMotionType | null;
  /** Passive states use a fixed cadence. */
  waiting: CubeMotionSpec | null;
  unread: CubeMotionSpec | null;
}

export const CUBE_MOTION_PRESETS: Record<CubeMotionPreset, PresetStates> = {
  // Expressive: snapping toss while working, a nudge for unread.
  lively: {
    working: 'toss',
    waiting: { type: 'pulse', duration: '1.4s' },
    unread: { type: 'nudge', duration: '3.5s' },
  },
  // Gentle: rocking sway while working, soft pulses elsewhere.
  calm: {
    working: 'sway',
    waiting: { type: 'pulse', duration: '1.8s' },
    unread: { type: 'pulse', duration: '2.8s' },
  },
  // Understated: opacity pulses only, no 3D rotation/scale.
  minimal: {
    working: 'pulse',
    waiting: { type: 'pulse', duration: '1.4s' },
    unread: { type: 'pulse', duration: '2.8s' },
  },
  // Static: colour only, no motion (the status edge-glow still shows).
  off: { working: null, waiting: null, unread: null },
};

// How each working motion's speed maps off the live activity cadence
// (`workPulse`, ~0.4s busy → ~0.95s calm): rotations want a longer period than
// the raw pulse, the pulse envelope tracks it 1:1.
const WORKING_ACTIVITY_SCALE: Record<CubeMotionType, number> = {
  toss: 3,
  sway: 1.8,
  spin: 2,
  pulse: 1,
  nudge: 2,
};

/** Resolve the working-state motion for a preset, scaling its speed off live activity. */
export function workingMotionFor(
  type: CubeMotionType | null,
  workPulse: string,
): CubeMotionSpec | undefined {
  if (!type) return undefined;
  const scale = WORKING_ACTIVITY_SCALE[type];
  const duration = `${(parseFloat(workPulse) * scale).toFixed(2)}s`;
  return { type, duration };
}
