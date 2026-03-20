/**
 * Cubes Lib
 *
 * Utilities and registries for the cube system.
 */

export {
  cubeExpansionRegistry,
  getExpansionSize,
  DEFAULT_EXPANSION_SIZES,
  type ExpansionType,
  type ExpansionComponentProps,
  type ExpansionProvider,
} from './cubeExpansionRegistry';

export { registerCubeExpansions } from './registerCubeExpansions';

export {
  CubeFaceRegistry,
  cubeFaceRegistry,
  type CubeFacePosition,
  type CubeFaceComponentProps,
  type CubeFaceDefinition,
} from './cubeFaceRegistry';

export { registerDefaultCubeFaces } from './registerDefaultCubeFaces';
