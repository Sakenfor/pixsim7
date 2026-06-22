/**
 * CubeFaces — a generic, presentational CSS-3D cube primitive.
 *
 * Pure CSS 3D transforms (`perspective` + `transform-style: preserve-3d` + per-
 * face `rotate/translateZ`) — the same technique as the panel-dock cube
 * (`features/cubes/DraggableCube`), but headless of drag/dock/store concerns so
 * it can back tiny UI ornaments like badge skins. No Three.js, no WebGL.
 *
 * The `perspective` root is fully self-contained inside this component, so it
 * keeps its own 3D context regardless of ancestor transforms/overflow (e.g. the
 * overlay widget wrapper or a stacked-badge flex container won't flatten it).
 *
 * Renders all six faces; pass content/colour only for the ones you care about —
 * the default isometric pose reveals front + right + top. See plan
 * `media-card-badge-skin`.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';

export type CubeFaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface CubeFaceSkin {
  /** Face background (CSS colour). Falls back to {@link CubeFacesProps.neutral}. */
  color?: string;
  /** Centred face content (icon / short text). */
  content?: ReactNode;
}

export interface CubeFacesProps {
  /** Edge length in px. */
  size?: number;
  /** Per-face skin; omitted faces use `neutral`. */
  faces?: Partial<Record<CubeFaceName, CubeFaceSkin>>;
  /** Colour for faces without an explicit skin. */
  neutral?: string;
  /**
   * When set, traces every face edge in this colour and adds a soft outer glow
   * — a 3D status outline that follows the cube instead of a flat ring around
   * it. Falls back to a faint white edge when omitted.
   */
  outline?: string;
  /** Resting tilt (deg). Default isometric pose shows front + right + top. */
  tilt?: { x: number; y: number };
  /** Tilt while hovered (deg). Omit to disable the hover nudge. */
  hoverTilt?: { x: number; y: number };
  /**
   * Apply per-face brightness so a single-colour cube still reads as 3D (top
   * lit, sides shaded). Defaults to `true`. Set `false` for faces that already
   * carry their own distinct colours and shouldn't be tinted.
   */
  shade?: boolean;
  /**
   * Continuously rotate a full turn (Y axis) around the resting `tilt` — e.g. an
   * "active" signal. `true` uses the default cadence; a string sets the CSS
   * animation-duration (e.g. '1.5s'). Note: parks each non-front face toward the
   * viewer in turn, so the front-face content is hidden part of the cycle — use
   * {@link sway} when the front face must stay legible. Takes precedence over sway.
   */
  spin?: boolean | string;
  /**
   * Oscillate (rock left↔right) around the front face instead of a full turn,
   * keeping front-face content toward the viewer the whole time. `true` uses the
   * default cadence; a string sets the animation-duration. GPU-composited.
   */
  sway?: boolean | string;
  /**
   * Periodic "toss" — a fast snapping full turn then a hold back on the front
   * face, looping (like a thrown die settling). Front-face content is shown for
   * the whole rest period and only blurs by during the brief snap. `true` uses
   * the default cadence (shorter = snappier + more frequent); a string sets the
   * animation-duration. Lowest precedence: `spin` then `sway` then `toss`.
   */
  toss?: boolean | string;
  className?: string;
}

const DEFAULT_TILT = { x: -25, y: 32 };
const DEFAULT_HOVER_TILT = { x: -32, y: 42 };
const DEFAULT_NEUTRAL = 'rgba(40,40,46,0.92)';

// Face brightness for the resting isometric pose — top catches light, the
// receding sides fall into shade. Keeps a one-colour cube from looking flat.
const FACE_BRIGHTNESS: Record<CubeFaceName, number> = {
  front: 1,
  back: 1,
  left: 0.82,
  right: 0.82,
  top: 1.18,
  bottom: 0.7,
};

export function CubeFaces({
  size = 16,
  faces,
  neutral = DEFAULT_NEUTRAL,
  tilt = DEFAULT_TILT,
  hoverTilt = DEFAULT_HOVER_TILT,
  shade = true,
  outline,
  spin,
  sway,
  toss,
  className,
}: CubeFacesProps) {
  const [hovered, setHovered] = useState(false);
  const half = size / 2;
  // Precedence if several are set: spin → sway → toss. Resolve each to a duration.
  const spinDur = spin === true ? '2.2s' : typeof spin === 'string' ? spin : undefined;
  const swayDur = sway === true ? '1.6s' : typeof sway === 'string' ? sway : undefined;
  const tossDur = toss === true ? '2.4s' : typeof toss === 'string' ? toss : undefined;
  const animClass = spinDur
    ? 'animate-cube-spin'
    : swayDur
      ? 'animate-cube-sway'
      : tossDur
        ? 'animate-cube-toss'
        : undefined;
  const animDur = spinDur ?? swayDur ?? tossDur;

  const faceTransforms: Record<CubeFaceName, string> = {
    front: `translateZ(${half}px)`,
    back: `rotateY(180deg) translateZ(${half}px)`,
    left: `rotateY(-90deg) translateZ(${half}px)`,
    right: `rotateY(90deg) translateZ(${half}px)`,
    top: `rotateX(90deg) translateZ(${half}px)`,
    bottom: `rotateX(-90deg) translateZ(${half}px)`,
  };

  const pose = hovered && hoverTilt ? hoverTilt : tilt;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{ width: size, height: size, perspective: `${size * 6}px`, flexShrink: 0 }}
      aria-hidden
    >
      <div
        className={animClass}
        style={
          animDur
            ? {
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                // The spin/sway keyframe owns `transform`; pass the resting
                // X-tilt in via the CSS var so it animates around the same pose.
                ['--cube-tilt-x' as string]: `${tilt.x}deg`,
                animationDuration: animDur,
              }
            : {
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transform: `rotateX(${pose.x}deg) rotateY(${pose.y}deg)`,
                transition: 'transform 150ms ease',
              }
        }
      >
        {(Object.keys(faceTransforms) as CubeFaceName[]).map((face) => {
          const skin = faces?.[face];
          return (
            <div
              key={face}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: faceTransforms[face],
                backfaceVisibility: 'hidden',
                background: skin?.color ?? neutral,
                color: '#fff',
                border: `1px solid ${outline ?? 'rgba(255,255,255,0.25)'}`,
                borderRadius: 2,
                boxShadow: outline
                  ? `inset 0 0 4px rgba(0,0,0,0.35), 0 0 5px ${outline}`
                  : 'inset 0 0 4px rgba(0,0,0,0.35)',
                filter: shade ? `brightness(${FACE_BRIGHTNESS[face]})` : undefined,
              }}
            >
              {skin?.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
