/**
 * React hooks for provider capability registry
 */

import { useEffect, useState, useMemo } from 'react';
import { providerCapabilityRegistry } from '../lib/core/capabilityRegistry';
import type { ProviderCapability, ProviderLimits, CostHints } from '../lib/core/types';

/**
 * Hook to get all provider capabilities
 *
 * @returns Object with capabilities array, loading state, and error
 *
 * @example
 * ```tsx
 * function ProviderList() {
 *   const { capabilities, loading, error } = useProviderCapabilities();
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   return capabilities.map(cap => <div key={cap.provider_id}>{cap.name}</div>);
 * }
 * ```
 */
export function useProviderCapabilities() {
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        await providerCapabilityRegistry.fetchCapabilities();
        if (!cancelled) {
          setCapabilities(providerCapabilityRegistry.getAllCapabilities());
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load provider capabilities');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { capabilities, loading, error };
}

/**
 * Hook to get capability for a specific provider
 *
 * @param providerId - Provider ID to get capability for
 * @returns Object with capability, loading state, and error
 *
 * @example
 * ```tsx
 * function ProviderDetails({ providerId }: { providerId: string }) {
 *   const { capability, loading } = useProviderCapability(providerId);
 *   if (loading) return <div>Loading...</div>;
 *   if (!capability) return <div>Provider not found</div>;
 *   return <div>{capability.name}: {capability.operations.join(', ')}</div>;
 * }
 * ```
 */
export function useProviderCapability(providerId?: string) {
  const [capability, setCapability] = useState<ProviderCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!providerId) {
        setCapability(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        await providerCapabilityRegistry.fetchCapabilities();
        if (!cancelled) {
          const cap = providerCapabilityRegistry.getCapability(providerId);
          setCapability(cap);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load provider capability');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  return { capability, loading, error };
}

/**
 * Hook to get prompt character limit for a provider
 *
 * @param providerId - Provider ID (optional, uses default if not provided)
 * @returns Prompt character limit
 *
 * @example
 * ```tsx
 * function PromptEditor({ providerId }: { providerId?: string }) {
 *   const maxChars = usePromptLimit(providerId);
 *   return <textarea maxLength={maxChars} />;
 * }
 * ```
 */
export function usePromptLimit(providerId?: string): number {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => {
    if (!providerId) return 800; // Default fallback
    return capability?.limits?.prompt_max_chars ?? 800;
  }, [providerId, capability]);
}

/**
 * Hook to get all limits for a provider
 *
 * @param providerId - Provider ID
 * @returns Provider limits object
 *
 * @example
 * ```tsx
 * function LimitsDisplay({ providerId }: { providerId: string }) {
 *   const limits = useProviderLimits(providerId);
 *   return (
 *     <div>
 *       <div>Max prompt: {limits?.prompt_max_chars}</div>
 *       <div>Max duration: {limits?.max_duration}s</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useProviderLimits(providerId?: string): ProviderLimits | null {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => capability?.limits || null, [capability]);
}

/**
 * Hook to get cost hints for a provider
 *
 * @param providerId - Provider ID
 * @returns Cost hints object
 *
 * @example
 * ```tsx
 * function CostEstimate({ providerId }: { providerId: string }) {
 *   const costHints = useCostHints(providerId);
 *   if (!costHints?.per_generation) return null;
 *   return <div>Estimated cost: ${costHints.per_generation}</div>;
 * }
 * ```
 */
export function useCostHints(providerId?: string): CostHints | null {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => capability?.cost_hints || null, [capability]);
}

/**
 * Hook to get supported operations for a provider
 *
 * @param providerId - Provider ID
 * @returns Array of operation IDs
 *
 * @example
 * ```tsx
 * function OperationSelector({ providerId }: { providerId: string }) {
 *   const operations = useSupportedOperations(providerId);
 *   return (
 *     <select>
 *       {operations.map(op => <option key={op} value={op}>{op}</option>)}
 *     </select>
 *   );
 * }
 * ```
 */
export function useSupportedOperations(providerId?: string): string[] {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => capability?.operations || [], [capability]);
}

/**
 * Hook to check if provider supports a specific feature
 *
 * @param providerId - Provider ID
 * @param feature - Feature to check
 * @returns True if feature is supported
 *
 * @example
 * ```tsx
 * function UploadButton({ providerId }: { providerId: string }) {
 *   const canUpload = useProviderFeature(providerId, 'asset_upload');
 *   if (!canUpload) return null;
 *   return <button>Upload Asset</button>;
 * }
 * ```
 */
export function useProviderFeature(
  providerId?: string,
  feature?: keyof ProviderCapability['features']
): boolean {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => {
    if (!capability || !feature) return false;
    return capability.features?.[feature] ?? false;
  }, [capability, feature]);
}

/**
 * Hook to get quality presets for a provider
 *
 * @param providerId - Provider ID
 * @returns Array of quality preset IDs
 *
 * @example
 * ```tsx
 * function QualitySelector({ providerId }: { providerId: string }) {
 *   const presets = useQualityPresets(providerId);
 *   return (
 *     <select>
 *       {presets.map(preset => <option key={preset}>{preset}</option>)}
 *     </select>
 *   );
 * }
 * ```
 */
export function useQualityPresets(providerId?: string): string[] {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => capability?.quality_presets || [], [capability]);
}

/**
 * Hook to get aspect ratios for a provider
 *
 * @param providerId - Provider ID
 * @returns Array of aspect ratio strings (e.g., "16:9", "9:16")
 *
 * @example
 * ```tsx
 * function AspectRatioSelector({ providerId }: { providerId: string }) {
 *   const aspectRatios = useAspectRatios(providerId);
 *   return (
 *     <select>
 *       {aspectRatios.map(ratio => <option key={ratio}>{ratio}</option>)}
 *     </select>
 *   );
 * }
 * ```
 */
export function useAspectRatios(providerId?: string): string[] {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => capability?.aspect_ratios || [], [capability]);
}

/**
 * Hook to get operation spec for a provider and operation
 *
 * @param providerId - Provider ID
 * @param operation - Operation type
 * @returns Operation spec with parameter definitions
 *
 * @example
 * ```tsx
 * function OperationForm({ providerId, operation }: Props) {
 *   const opSpec = useOperationSpec(providerId, operation);
 *   if (!opSpec) return <div>Operation not supported</div>;
 *   return opSpec.parameters.map(param => <InputField key={param.name} {...param} />);
 * }
 * ```
 */
export function useOperationSpec(providerId?: string, operation?: string) {
  const { capability } = useProviderCapability(providerId);
  return useMemo(() => {
    if (!capability || !operation) return null;
    return capability.operation_specs?.[operation] || null;
  }, [capability, operation]);
}
