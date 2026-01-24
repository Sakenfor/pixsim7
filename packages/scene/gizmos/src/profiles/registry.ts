/**
 * Surface Profile Registry
 *
 * Central registry for surface interaction profiles.
 * Profiles define complete configurations for different domains
 * (romance, massage, botanical, etc.).
 */

import type { SurfaceProfile } from '@pixsim7/shared.types';

// =============================================================================
// Registry Storage
// =============================================================================

const profiles = new Map<string, SurfaceProfile>();
const domainIndex = new Map<string, Set<string>>(); // domain -> profile IDs

// =============================================================================
// Registration
// =============================================================================

/**
 * Register a surface profile.
 * Overwrites existing profile with same ID.
 */
export function registerProfile(profile: SurfaceProfile): void {
  // Validate required fields
  if (!profile.id) {
    throw new Error('Profile must have an ID');
  }
  if (!profile.domain) {
    throw new Error(`Profile "${profile.id}" must have a domain`);
  }
  if (!profile.regions || profile.regions.length === 0) {
    console.warn(`Profile "${profile.id}" has no regions defined`);
  }
  if (!profile.instruments || profile.instruments.length === 0) {
    console.warn(`Profile "${profile.id}" has no instruments defined`);
  }
  if (!profile.dimensions || profile.dimensions.length === 0) {
    console.warn(`Profile "${profile.id}" has no dimensions defined`);
  }

  // Remove from old domain index if re-registering
  const existing = profiles.get(profile.id);
  if (existing && existing.domain !== profile.domain) {
    domainIndex.get(existing.domain)?.delete(profile.id);
  }

  // Store profile
  profiles.set(profile.id, profile);

  // Update domain index
  if (!domainIndex.has(profile.domain)) {
    domainIndex.set(profile.domain, new Set());
  }
  domainIndex.get(profile.domain)!.add(profile.id);
}

/**
 * Unregister a profile by ID.
 * Returns true if profile existed and was removed.
 */
export function unregisterProfile(profileId: string): boolean {
  const profile = profiles.get(profileId);
  if (!profile) return false;

  profiles.delete(profileId);
  domainIndex.get(profile.domain)?.delete(profileId);
  return true;
}

// =============================================================================
// Retrieval
// =============================================================================

/**
 * Get a profile by ID.
 */
export function getProfile(profileId: string): SurfaceProfile | undefined {
  return profiles.get(profileId);
}

/**
 * Get a profile by ID, throwing if not found.
 */
export function getProfileOrThrow(profileId: string): SurfaceProfile {
  const profile = profiles.get(profileId);
  if (!profile) {
    throw new Error(`Surface profile not found: "${profileId}"`);
  }
  return profile;
}

/**
 * Check if a profile exists.
 */
export function hasProfile(profileId: string): boolean {
  return profiles.has(profileId);
}

/**
 * Get all profiles for a domain.
 */
export function getProfilesByDomain(domain: string): SurfaceProfile[] {
  const ids = domainIndex.get(domain);
  if (!ids) return [];
  return Array.from(ids)
    .map(id => profiles.get(id)!)
    .filter(Boolean);
}

/**
 * Get all registered profiles.
 */
export function getAllProfiles(): SurfaceProfile[] {
  return Array.from(profiles.values());
}

/**
 * Get all profile IDs.
 */
export function getAllProfileIds(): string[] {
  return Array.from(profiles.keys());
}

/**
 * Get all domains that have profiles registered.
 */
export function getAllDomains(): string[] {
  return Array.from(domainIndex.keys()).filter(
    domain => domainIndex.get(domain)!.size > 0
  );
}

// =============================================================================
// Filtering
// =============================================================================

/**
 * Filter options for profile search.
 */
export interface ProfileFilterOptions {
  /** Filter by domain */
  domain?: string;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by tag (all must match) */
  requiredTags?: string[];
  /** Custom filter function */
  predicate?: (profile: SurfaceProfile) => boolean;
}

/**
 * Filter profiles by criteria.
 */
export function filterProfiles(options: ProfileFilterOptions): SurfaceProfile[] {
  let result = getAllProfiles();

  if (options.domain) {
    result = result.filter(p => p.domain === options.domain);
  }

  if (options.tags && options.tags.length > 0) {
    result = result.filter(p =>
      p.tags?.some(t => options.tags!.includes(t))
    );
  }

  if (options.requiredTags && options.requiredTags.length > 0) {
    result = result.filter(p =>
      options.requiredTags!.every(t => p.tags?.includes(t))
    );
  }

  if (options.predicate) {
    result = result.filter(options.predicate);
  }

  return result;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Clear all registered profiles (mainly for testing).
 */
export function clearProfileRegistry(): void {
  profiles.clear();
  domainIndex.clear();
}

/**
 * Get registry statistics.
 */
export function getProfileRegistryStats(): {
  totalProfiles: number;
  domains: Record<string, number>;
} {
  const domains: Record<string, number> = {};
  for (const [domain, ids] of domainIndex) {
    if (ids.size > 0) {
      domains[domain] = ids.size;
    }
  }
  return {
    totalProfiles: profiles.size,
    domains,
  };
}

// =============================================================================
// Profile Helpers
// =============================================================================

/**
 * Get a specific region from a profile.
 */
export function getProfileRegion(
  profileId: string,
  regionId: string
): SurfaceProfile['regions'][0] | undefined {
  const profile = profiles.get(profileId);
  return profile?.regions.find(r => r.id === regionId);
}

/**
 * Get a specific instrument from a profile.
 */
export function getProfileInstrument(
  profileId: string,
  instrumentId: string
): SurfaceProfile['instruments'][0] | undefined {
  const profile = profiles.get(profileId);
  return profile?.instruments.find(i => i.id === instrumentId);
}

/**
 * Get a specific dimension from a profile.
 */
export function getProfileDimension(
  profileId: string,
  dimensionId: string
): SurfaceProfile['dimensions'][0] | undefined {
  const profile = profiles.get(profileId);
  return profile?.dimensions.find(d => d.id === dimensionId);
}

/**
 * Get instrument contributions for a profile.
 */
export function getProfileContributions(
  profileId: string,
  instrumentId: string
): SurfaceProfile['contributions'][string] | undefined {
  const profile = profiles.get(profileId);
  return profile?.contributions[instrumentId];
}
