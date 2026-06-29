/**
 * ShapeStage — the generic 3D-ornament engine shared by every shape primitive
 * (cube, star medallion, …). Owns size, the `perspective` root, the resting/
 * hover tilt, and the spin/sway/toss motion; the shape renders its own geometry
 * as `children` inside the `preserve-3d` context.
 *
 * Two motion families keyframe differently (defined in index.css):
 *   - `cube`      → rotates around Y (solids; the front face turns away mid-spin)
 *   - `medallion` → rotates around Z (flat shapes; stay face-on, coin-flip feel)
 *
 * Envelope effects (pulse/nudge) are NOT here — they wrap the stage from the
 * consumer so the 3D pose is preserved. See plan `media-card-badge-skin`.
 */
import { useState, type ReactNode } from 'react';

export type Shape3DMotionType = 'spin' | 'sway' | 'toss' | 'tumble';
export type Shape3DMotionFamily = 'cube' | 'medallion';
export interface Shape3DMotion {
  type: Shape3DMotionType;
  /** CSS animation-duration; falls back to the family default. */
  duration?: string;
}

const DEFAULT_DUR: Record<Shape3DMotionType, string> = {
  spin: '2.2s',
  sway: '1.6s',
  toss: '2.4s',
  tumble: '2.4s',
};

export interface ShapeStageProps {
  size: number;
  /** Resting tilt (deg). */
  tilt: { x: number; y: number };
  /** Tilt while hovered (deg); omit to disable the hover nudge. */
  hoverTilt?: { x: number; y: number };
  /** Active 3D motion (spin/sway/toss); omit for a static pose. */
  motion?: Shape3DMotion;
  motionFamily?: Shape3DMotionFamily;
  className?: string;
  children: ReactNode;
}

export function ShapeStage({
  size,
  tilt,
  hoverTilt,
  motion,
  motionFamily = 'cube',
  className,
  children,
}: ShapeStageProps) {
  const [hovered, setHovered] = useState(false);
  const pose = hovered && hoverTilt ? hoverTilt : tilt;
  const animClass = motion ? `animate-${motionFamily}-${motion.type}` : undefined;
  const animDur = motion ? (motion.duration ?? DEFAULT_DUR[motion.type]) : undefined;

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
          animClass
            ? {
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                // The keyframe owns `transform`; pass the resting X-tilt in via
                // the CSS var so it animates around the same pose (cube family).
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
        {children}
      </div>
    </div>
  );
}
