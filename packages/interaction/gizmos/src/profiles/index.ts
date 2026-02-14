/**
 * Surface Profile System
 *
 * Exports the profile registry and built-in profiles.
 */

// Registry functions
export {
  registerProfile,
  unregisterProfile,
  getProfile,
  getProfileOrThrow,
  hasProfile,
  getProfilesByDomain,
  getAllProfiles,
  getAllProfileIds,
  getAllDomains,
  filterProfiles,
  clearProfileRegistry,
  getProfileRegistryStats,
  getProfileRegion,
  getProfileInstrument,
  getProfileDimension,
  getProfileContributions,
  type ProfileFilterOptions,
} from './registry';

// Built-in profiles (auto-register on import)
export { romanceProfile } from './romance';
export { massageProfile } from './massage';
export { botanicalProfile } from './botanical';
