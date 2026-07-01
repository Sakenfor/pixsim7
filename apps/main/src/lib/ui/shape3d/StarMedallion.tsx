/**
 * StarMedallion — a flat, clip-path star ornament. The "medallion" path: a 2D
 * shape that rides the shared {@link ShapeStage} motion engine but rotates
 * in-plane (Z axis) so it never goes edge-on like a solid would. Theme-coloured
 * fill, status traced as an outer glow, glyph centred on top.
 *
 * Proves the non-polyhedron branch of the shape registry — smooth/concave shapes
 * (star, bell) can't be built from flat CSS faces, so they render as a single
 * clipped shape instead. See plan `media-card-badge-skin`.
 */
import type { ReactNode } from 'react';

import { ShapeStage, type Shape3DMotion } from './ShapeStage';

// 5-point star as a clip-path polygon (viewport-relative %).
const STAR_CLIP =
  'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';

export interface StarMedallionProps {
  size: number;
  /** Fill colour of the star. */
  color: string;
  /** Centred glyph/content. */
  content?: ReactNode;
  /** Status colour — drawn as an outer glow tracing the star outline. */
  outline?: string;
  /** Glow intensity multiplier for the status {@link outline} (1 = default). */
  glow?: number;
  motion?: Shape3DMotion;
}

export function StarMedallion({ size, color, content, outline, glow = 1, motion }: StarMedallionProps) {
  return (
    <ShapeStage size={size} tilt={{ x: 0, y: 0 }} motion={motion} motionFamily="medallion">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: color,
          clipPath: STAR_CLIP,
          filter: outline
            ? glow > 1
              ? `drop-shadow(0 0 ${(2.5 * glow).toFixed(1)}px ${outline}) drop-shadow(0 0 ${(1.5 * glow).toFixed(1)}px ${outline}) drop-shadow(0 0 1px ${outline})`
              : `drop-shadow(0 0 2.5px ${outline}) drop-shadow(0 0 1px ${outline})`
            : undefined,
        }}
      />
      {content && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {content}
        </div>
      )}
    </ShapeStage>
  );
}
