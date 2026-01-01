/**
 * World Configuration Hooks
 *
 * React hooks for accessing world configuration from components.
 * Uses shallow comparison to prevent unnecessary re-renders.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { manifest, turnDeltaSeconds } = useWorldConfig();
 *   // ...
 * }
 *
 * // Or use specific selectors:
 * function TierDisplay() {
 *   const tiers = useRelationshipTiers();
 *   return <ul>{tiers.map(t => <li key={t.id}>{t.id}</li>)}</ul>;
 * }
 * ```
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorldConfigStore } from '@/stores/worldConfigStore';
import type {
  WorldStatsConfig,
  WorldManifestParsed,
  IntimacyGatingConfig,
  StatDefinition,
  StatTier,
  StatLevel,
} from '@pixsim7/shared.types';

// =============================================================================
// Full Config Hook
// =============================================================================

/**
 * Access the full world config with all parsed values.
 * Uses shallow comparison to prevent unnecessary re-renders.
 */
export function useWorldConfig() {
  return useWorldConfigStore(
    useShallow((s) => ({
      worldId: s.worldId,
      isLoaded: s.isLoaded,
      lastUpdatedAt: s.lastUpdatedAt,
      statsConfig: s.statsConfig,
      manifest: s.manifest,
      intimacyGating: s.intimacyGating,
      turnDeltaSeconds: s.turnDeltaSeconds,
      getPluginConfig: s.getPluginConfig,
    }))
  );
}

// =============================================================================
// Specific Config Hooks
// =============================================================================

/**
 * Get the current world ID
 */
export function useWorldId(): number | null {
  return useWorldConfigStore((s) => s.worldId);
}

/**
 * Check if world config is loaded
 */
export function useWorldConfigLoaded(): boolean {
  return useWorldConfigStore((s) => s.isLoaded);
}

/**
 * Get the stats configuration
 */
export function useStatsConfig(): Readonly<WorldStatsConfig> {
  return useWorldConfigStore((s) => s.statsConfig);
}

/**
 * Get a specific stat definition by ID
 */
export function useStatDefinition(definitionId: string): Readonly<StatDefinition> | undefined {
  return useWorldConfigStore(
    useCallback((s) => s.getStatDefinition(definitionId), [definitionId])
  );
}

/**
 * Get the world manifest
 */
export function useManifest(): Readonly<WorldManifestParsed> {
  return useWorldConfigStore((s) => s.manifest);
}

/**
 * Get the intimacy gating configuration
 */
export function useIntimacyGating(): Readonly<IntimacyGatingConfig> {
  return useWorldConfigStore((s) => s.intimacyGating);
}

/**
 * Get the turn delta in seconds
 */
export function useTurnDelta(): number {
  return useWorldConfigStore((s) => s.turnDeltaSeconds);
}

/**
 * Get the configured gating plugin ID
 */
export function useGatingPlugin(): string {
  return useWorldConfigStore((s) => s.manifest.gating_plugin ?? 'intimacy.default');
}

/**
 * Get the unified gating profile with all config needed for gating decisions
 */
export function useGatingProfile() {
  return useWorldConfigStore((s) => s.getGatingProfile());
}

// =============================================================================
// Relationship-Specific Hooks
// =============================================================================

/**
 * Get relationship tier definitions for the current world
 */
export function useRelationshipTiers(): Readonly<StatTier[]> {
  return useWorldConfigStore((s) => s.getRelationshipTiers());
}

/**
 * Get intimacy level definitions for the current world
 */
export function useIntimacyLevels(): Readonly<StatLevel[]> {
  return useWorldConfigStore((s) => s.getIntimacyLevels());
}

/**
 * Get the relationship stat definition
 */
export function useRelationshipDefinition(): Readonly<StatDefinition> | undefined {
  return useWorldConfigStore((s) => s.statsConfig.definitions.relationships);
}

// =============================================================================
// Plugin Config Hook
// =============================================================================

/**
 * Get plugin-specific configuration with type-safe defaults.
 *
 * @example
 * ```tsx
 * const romanceConfig = usePluginConfig('romance', {
 *   enabled: true,
 *   maxArousal: 100,
 * });
 * ```
 */
export function usePluginConfig<T extends Record<string, unknown>>(
  pluginId: string,
  defaults: T
): Readonly<T> {
  const getPluginConfig = useWorldConfigStore((s) => s.getPluginConfig);
  return getPluginConfig(pluginId, defaults);
}

// =============================================================================
// Actions Hook
// =============================================================================

/**
 * Get world config actions (load, update, invalidate).
 * Use this when you need to programmatically update the config.
 */
export function useWorldConfigActions() {
  return useWorldConfigStore(
    useShallow((s) => ({
      loadWorld: s.loadWorld,
      updateWorld: s.updateWorld,
      invalidate: s.invalidate,
    }))
  );
}

// =============================================================================
// Tier/Level Lookup Utilities
// =============================================================================

/**
 * Find a tier by its ID
 */
export function useTierById(tierId: string | undefined): Readonly<StatTier> | undefined {
  const tiers = useRelationshipTiers();
  if (!tierId) return undefined;
  return tiers.find((t) => t.id === tierId);
}

/**
 * Find a level by its ID
 */
export function useLevelById(levelId: string | undefined): Readonly<StatLevel> | undefined {
  const levels = useIntimacyLevels();
  if (!levelId) return undefined;
  return levels.find((l) => l.id === levelId);
}

/**
 * Get display-friendly tier info
 */
export function useTierDisplay(tierId: string | undefined): {
  id: string;
  displayName: string;
  description: string;
} | undefined {
  const tier = useTierById(tierId);
  if (!tier) return undefined;

  return {
    id: tier.id,
    displayName: tier.display_name ?? tier.id,
    description: tier.description ?? `Affinity ${tier.min}${tier.max ? `-${tier.max}` : '+'}`,
  };
}
