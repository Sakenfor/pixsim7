/**
 * Media viewer utilities.
 */

export {
  regionToInputBinding,
  regionsToInputBindings,
  multiAssetRegionsToInputBindings,
  createFullAssetBinding,
  createBackgroundBinding,
  createForegroundBinding,
  createStyleBinding,
} from './regionsToInputBindings';
export type { InputBinding, RegionsToBindingsOptions } from './regionsToInputBindings';

export { resolveViewerAssetProviderId } from './providerResolution';
