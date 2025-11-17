/**
 * @pixsim7/semantic-shapes
 *
 * Semantic shape definitions for PixSim7.
 * Beyond basic geometry - shapes with meaning and purpose.
 */

// ===== Brain Shape =====
export type { BrainFace, BrainFaceDefinition, BrainConnection, BrainShapeDefinition } from './brain';
export { brainShape, getBrainFaceColor, getBrainFaceLabel, getBrainConnections } from './brain';

// ===== Shape Registry =====
export type {
  ShapeFaceInteraction,
  ShapeFace,
  ShapeConnection,
  ShapeBehavior,
  SemanticShape,
} from './registry';

export {
  portalShape,
  prismShape,
  constellationShape,
  matrixShape,
  SemanticShapeInstance,
  ShapeRegistry,
} from './registry';
