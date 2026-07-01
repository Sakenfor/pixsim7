/**
 * Shape registry — maps a shape id to a renderer that produces a themed 3D
 * ornament from a common set of props (size, colour, glyph, status outline,
 * motion). This is what lets a skin setting be `flat | cube | star | …` instead
 * of a boolean, and what surfaces (assistant icons, badges) dispatch through.
 *
 * Adding a shape = one entry here. Solids reuse {@link CubeFaces} (cube family,
 * Y-axis motion); flat shapes use a medallion body (Z-axis motion). See plan
 * `media-card-badge-skin`.
 */
import type { ReactNode } from 'react';

import { CubeFaces } from '../cube';

import { MeshShape } from './MeshShape';
import type { Shape3DMotion } from './ShapeStage';
import { StarMedallion } from './StarMedallion';

export type ShapeId = 'cube' | 'star' | 'gem';

export const SHAPE_IDS: ShapeId[] = ['cube', 'star', 'gem'];

export interface RenderShapeOpts {
  size: number;
  /** Body colour (theme accent). */
  color: string;
  /** Centred glyph/content (already coloured by the caller). */
  content?: ReactNode;
  /** Status colour traced on the shape (3D edge glow / outline). */
  outline?: string;
  /** Intensity multiplier for the status `outline` glow (1 = default). */
  glow?: number;
  /** Active 3D motion; pulse/nudge envelopes are applied by the caller. */
  motion?: Shape3DMotion;
}

export function renderShape(id: ShapeId, opts: RenderShapeOpts): ReactNode {
  const { size, color, content, outline, glow, motion } = opts;

  if (id === 'star') {
    return <StarMedallion size={size} color={color} content={content} outline={outline} glow={glow} motion={motion} />;
  }

  if (id === 'gem') {
    // WebGL mesh (real octahedron) — colour must be concrete (no currentColor).
    return (
      <MeshShape size={size} color={color} motion={motion}>
        <octahedronGeometry args={[1, 0]} />
      </MeshShape>
    );
  }

  // 'cube' (default solid) — reuse CubeFaces: accent faces, glyph on front.
  return (
    <CubeFaces
      size={size}
      neutral={color}
      tilt={{ x: -16, y: 20 }}
      hoverTilt={{ x: -24, y: 34 }}
      outline={outline}
      glow={glow}
      motion={motion}
      faces={{ front: { color, content } }}
    />
  );
}
