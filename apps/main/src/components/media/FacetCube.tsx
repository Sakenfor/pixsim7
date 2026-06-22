/**
 * FacetCube — the cube-skin variant of the similarity badge's {@link FacetGlyph}.
 * Maps the three similarity facets onto the three visible faces of a cube
 * (front = inputs, right = prompt, top = seed); active facets light their face
 * in the facet colour, inactive faces stay neutral.
 *
 * A thin facet-specific wrapper over the generic {@link CubeFaces} primitive —
 * the 3D rendering lives there. See plan `media-card-badge-skin`.
 */
import { CubeFaces } from '@lib/ui/cube';

import type { SiblingFacets } from './siblingFacetStore';

const FACET_COLOR: Record<keyof SiblingFacets, string> = {
  inputs: '#38bdf8', // sky-400
  prompt: '#a78bfa', // violet-400
  seed: '#fbbf24', // amber-400
};

export function FacetCube({ facets, size = 16 }: { facets: SiblingFacets; size?: number }) {
  return (
    <CubeFaces
      size={size}
      faces={{
        front: facets.inputs ? { color: FACET_COLOR.inputs } : undefined,
        right: facets.prompt ? { color: FACET_COLOR.prompt } : undefined,
        top: facets.seed ? { color: FACET_COLOR.seed } : undefined,
      }}
    />
  );
}
