/**
 * Cube System - Workspace UI components
 *
 * Expandable control cubes for panel minimization and quick access.
 * Integrates with @pixsim7/scene.cubes package for core cube functionality.
 */

// Expansion registry
export {
  cubeExpansionRegistry,
  getExpansionSize,
  DEFAULT_EXPANSION_SIZES,
  type ExpansionType,
  type ExpansionComponentProps,
  type ExpansionProvider,
} from './cubeExpansionRegistry';

// Formation utilities
export type {
  FormationPattern,
  FormationConfig,
} from './cubeFormations';
export {
  calculateFormation,
  calculateDockFormation,
  calculateGridFormation,
  calculateCircleFormation,
  calculateArcFormation,
  calculateConstellationFormation,
  calculateScatteredFormation,
  interpolatePosition,
  easeInOutCubic,
} from './cubeFormations';

// Registration
export { registerCubeExpansions } from './registerCubeExpansions';
