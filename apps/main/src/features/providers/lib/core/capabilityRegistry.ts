/**
 * Provider Capability Registry
 *
 * Centralized registry for provider capabilities, limits, and controls.
 * Fetches data from backend /providers endpoint and provides type-safe access.
 *
 * Features:
 * - Caching with TTL and manual invalidation
 * - Single-flight request deduplication
 * - Type-safe access to provider limits, controls, and cost hints
 * - React hooks for easy consumption
 */

import { pixsimClient } from '@lib/api/client';
import type { ProviderCapability, ProviderInfo, ProviderLimits, CostHints } from './types';

export interface CapabilityRegistryConfig {
  cacheTTL?: number; // Cache time-to-live in milliseconds
  autoFetch?: boolean; // Automatically fetch on first access
}

export class ProviderCapabilityRegistry {
  private capabilities = new Map<string, ProviderCapability>();
  private lastFetchTime: number | null = null;
  private fetchPromise: Promise<void> | null = null;
  private config: Required<CapabilityRegistryConfig>;

  constructor(config: CapabilityRegistryConfig = {}) {
    this.config = {
      cacheTTL: config.cacheTTL ?? 5 * 60 * 1000, // 5 minutes default
      autoFetch: config.autoFetch ?? true,
    };
  }

  /**
   * Fetch capabilities from backend
   * Implements single-flight pattern to prevent duplicate requests
   */
  async fetchCapabilities(): Promise<void> {
    // Return existing promise if already fetching
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Check cache validity
    if (this.isCacheValid()) {
      return;
    }

    this.fetchPromise = this._doFetch();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async _doFetch(): Promise<void> {
    try {
      const providers = await pixsimClient.get<ProviderInfo[]>('/providers');

      this.capabilities.clear();
      for (const provider of providers) {
        if (provider.capabilities) {
          // Augment capabilities with computed limits
          const capability: ProviderCapability = {
            ...provider.capabilities,
            provider_id: provider.provider_id,
            name: provider.name,
            limits: this._computeLimits(provider.capabilities),
            cost_hints: this._extractCostHints(provider.capabilities),
          };
          this.capabilities.set(provider.provider_id, capability);
        }
      }

      this.lastFetchTime = Date.now();
    } catch (error) {
      console.error('Failed to fetch provider capabilities:', error);
      throw error;
    }
  }

  /**
   * Compute provider limits from capability data
   */
  private _computeLimits(capability: ProviderCapability): ProviderLimits {
    const limits: ProviderLimits = {};

    // Extract prompt limits from operation specs
    for (const opSpec of Object.values(capability.operation_specs || {})) {
      for (const param of opSpec.parameters || []) {
        if (param.name === 'prompt' && param.type === 'string') {
          // Use max length if specified, otherwise default
          if (param.max) {
            limits.prompt_max_chars = Math.max(limits.prompt_max_chars || 0, param.max);
          }
        }
        if (param.name === 'duration') {
          if (param.max) {
            limits.max_duration = Math.max(limits.max_duration || 0, param.max);
          }
        }
        if (param.name === 'width' && param.max) {
          limits.max_resolution = limits.max_resolution || { width: 0, height: 0 };
          limits.max_resolution.width = Math.max(limits.max_resolution.width, param.max);
        }
        if (param.name === 'height' && param.max) {
          limits.max_resolution = limits.max_resolution || { width: 0, height: 0 };
          limits.max_resolution.height = Math.max(limits.max_resolution.height, param.max);
        }
      }
    }

    // Provider-specific hardcoded limits (can be removed once all providers expose specs)
    if (capability.provider_id === 'pixverse') {
      limits.prompt_max_chars = limits.prompt_max_chars || 2048;
    }

    return limits;
  }

  /**
   * Extract cost hints from capability data
   * (Currently stub - can be extended when backend provides cost data)
   */
  private _extractCostHints(capability: ProviderCapability): CostHints {
    // Future: Parse from backend capability.cost_hints
    return capability.cost_hints || {};
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.lastFetchTime) return false;
    return Date.now() - this.lastFetchTime < this.config.cacheTTL;
  }

  /**
   * Get capability for a specific provider
   */
  getCapability(providerId: string): ProviderCapability | null {
    if (this.config.autoFetch && !this.isCacheValid() && !this.fetchPromise) {
      // Trigger background fetch (fire-and-forget)
      this.fetchCapabilities().catch(console.error);
    }
    return this.capabilities.get(providerId) || null;
  }

  /**
   * Get all capabilities
   */
  getAllCapabilities(): ProviderCapability[] {
    if (this.config.autoFetch && !this.isCacheValid() && !this.fetchPromise) {
      this.fetchCapabilities().catch(console.error);
    }
    return Array.from(this.capabilities.values());
  }

  /**
   * Get a specific limit for a provider
   */
  getLimit<K extends keyof ProviderLimits>(
    providerId: string,
    limitType: K
  ): ProviderLimits[K] | null {
    const capability = this.getCapability(providerId);
    return capability?.limits?.[limitType] ?? null;
  }

  /**
   * Get prompt character limit for a provider
   */
  getPromptLimit(providerId?: string): number {
    if (!providerId) return 800; // Default fallback
    const limit = this.getLimit(providerId, 'prompt_max_chars');
    return limit ?? 800;
  }

  /**
   * Get supported controls (parameters) for a provider operation
   */
  getSupportedControls(providerId: string, operation: string): string[] {
    const capability = this.getCapability(providerId);
    if (!capability) return [];

    const opSpec = capability.operation_specs?.[operation];
    if (!opSpec) {
      // Fallback to parameter_hints if available
      return capability.parameter_hints?.[operation] || [];
    }

    return opSpec.parameters.map(p => p.name);
  }

  /**
   * Get cost hint for a provider
   */
  getCostHint(providerId: string): CostHints | null {
    const capability = this.getCapability(providerId);
    return capability?.cost_hints || null;
  }

  /**
   * Check if provider supports a specific feature
   */
  hasFeature(providerId: string, feature: keyof ProviderCapability['features']): boolean {
    const capability = this.getCapability(providerId);
    return capability?.features?.[feature] ?? false;
  }

  /**
   * Check if provider supports an operation
   */
  supportsOperation(providerId: string, operation: string): boolean {
    const capability = this.getCapability(providerId);
    return capability?.operations?.includes(operation) ?? false;
  }

  /**
   * Get quality presets for a provider
   */
  getQualityPresets(providerId: string): string[] {
    const capability = this.getCapability(providerId);
    return capability?.quality_presets || [];
  }

  /**
   * Get aspect ratios for a provider
   */
  getAspectRatios(providerId: string): string[] {
    const capability = this.getCapability(providerId);
    return capability?.aspect_ratios || [];
  }

  /**
   * Get operation spec for a provider and operation
   */
  getOperationSpec(providerId: string, operation: string) {
    const capability = this.getCapability(providerId);
    return capability?.operation_specs?.[operation] || null;
  }

  /**
   * Invalidate cache and force refresh on next access
   */
  invalidate(): void {
    this.lastFetchTime = null;
    this.capabilities.clear();
  }

  /**
   * Clear cache and abort any in-flight requests
   */
  clear(): void {
    this.invalidate();
    this.fetchPromise = null;
  }
}

// Global singleton instance
export const providerCapabilityRegistry = new ProviderCapabilityRegistry();
