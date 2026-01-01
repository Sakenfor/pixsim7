/**
 * Cube Expansion Registry
 *
 * Registry for cube expansion providers that show contextual UI on cube hover/click.
 */

import { ComponentType } from 'react';
import type { PanelId } from '@features/workspace';
import type { CubeType } from '../useCubeStore';

/**
 * Types of expansions that cubes can show
 */
export type ExpansionType = 'preview' | 'status' | 'actions' | 'quickaccess' | 'custom';

/**
 * Props passed to expansion components
 */
export interface ExpansionComponentProps {
  cubeId: string;
  onClose?: () => void;
}

/**
 * Expansion provider registration
 */
export interface ExpansionProvider {
  /** Type of expansion (determines default styling/positioning) */
  type: ExpansionType;

  /** React component to render when expanded */
  component: ComponentType<ExpansionComponentProps>;

  /** Optional function to get data (for checking if expansion should show) */
  getData?: () => any;

  /** Optional custom width/height (defaults based on type) */
  width?: number;
  height?: number;

  /** Should expansion appear on hover? (default: true) */
  showOnHover?: boolean;

  /** Delay before showing on hover (ms, default: 300) */
  hoverDelay?: number;
}

/**
 * Registry for cube expansion providers
 *
 * Panels and systems register their expansion components here,
 * and cubes dynamically look up and render them.
 *
 * Example:
 * ```ts
 * cubeExpansionRegistry.register('health', {
 *   type: 'status',
 *   component: HealthCubeExpansion
 * });
 * ```
 */
class CubeExpansionRegistry {
  private providers = new Map<string, ExpansionProvider>();

  /**
   * Register an expansion provider for a panel or cube type
   */
  register(id: PanelId | CubeType | string, provider: ExpansionProvider) {
    this.providers.set(id, provider);
  }

  /**
   * Unregister an expansion provider
   */
  unregister(id: PanelId | CubeType | string) {
    this.providers.delete(id);
  }

  /**
   * Get expansion provider for a panel or cube type
   */
  get(id: PanelId | CubeType | string): ExpansionProvider | null {
    return this.providers.get(id) || null;
  }

  /**
   * Check if an expansion provider exists
   */
  has(id: PanelId | CubeType | string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get all registered providers
   */
  getAll(): Map<string, ExpansionProvider> {
    return new Map(this.providers);
  }

  /**
   * Clear all providers
   */
  clear() {
    this.providers.clear();
  }
}

// Singleton instance
export const cubeExpansionRegistry = new CubeExpansionRegistry();

/**
 * Default expansion sizes based on type
 */
export const DEFAULT_EXPANSION_SIZES: Record<ExpansionType, { width: number; height: number }> = {
  preview: { width: 200, height: 200 },
  status: { width: 220, height: 150 },
  actions: { width: 180, height: 160 },
  quickaccess: { width: 160, height: 180 },
  custom: { width: 200, height: 200 },
};

/**
 * Get expansion dimensions for a provider
 */
export function getExpansionSize(provider: ExpansionProvider): { width: number; height: number } {
  if (provider.width && provider.height) {
    return { width: provider.width, height: provider.height };
  }

  return DEFAULT_EXPANSION_SIZES[provider.type];
}
