/**
 * React hooks for generation UI plugin system
 */

import { useMemo } from 'react';
import { generationUIPluginRegistry } from './generationPlugins';
import type { GenerationUIPlugin, GenerationUIPluginProps, ValidationResult } from './generationPlugins';

/**
 * Hook to get plugins for a provider and operation
 *
 * @param providerId - Provider ID
 * @param operation - Operation type (optional)
 * @returns Array of matching plugins
 *
 * @example
 * ```tsx
 * function ProviderForm({ providerId, operation }: Props) {
 *   const plugins = useGenerationPlugins(providerId, operation);
 *   return (
 *     <div>
 *       {plugins.map(plugin => {
 *         const Component = plugin.component;
 *         return <Component key={plugin.id} {...pluginProps} />;
 *       })}
 *     </div>
 *   );
 * }
 * ```
 */
export function useGenerationPlugins(providerId: string, operation?: string): GenerationUIPlugin[] {
  return useMemo(() => {
    return generationUIPluginRegistry.getPlugins({ providerId, operation });
  }, [providerId, operation]);
}

/**
 * Hook to render plugins for a provider and operation
 *
 * @param providerId - Provider ID
 * @param operation - Operation type
 * @param props - Props to pass to plugin components
 * @returns React nodes for all matching plugins
 *
 * @example
 * ```tsx
 * function ProviderForm({ providerId, operation, values, onChange }: Props) {
 *   const pluginNodes = useRenderPlugins(providerId, operation, {
 *     providerId,
 *     operationType: operation,
 *     values,
 *     onChange,
 *     disabled: false
 *   });
 *   return <div>{pluginNodes}</div>;
 * }
 * ```
 */
export function useRenderPlugins(
  providerId: string,
  operation: string,
  props: GenerationUIPluginProps
): React.ReactNode[] {
  const plugins = useGenerationPlugins(providerId, operation);

  return useMemo(() => {
    return plugins.map(plugin => {
      const Component = plugin.component;
      return <Component key={plugin.id} {...props} />;
    });
  }, [plugins, props]);
}

/**
 * Hook to validate values using plugins
 *
 * @param providerId - Provider ID
 * @param operation - Operation type
 * @param values - Values to validate
 * @param context - Additional context
 * @returns Validation result
 *
 * @example
 * ```tsx
 * function ProviderForm({ providerId, operation, values }: Props) {
 *   const validation = usePluginValidation(providerId, operation, values);
 *   if (!validation.valid) {
 *     return <div>Errors: {JSON.stringify(validation.errors)}</div>;
 *   }
 *   return <div>All valid!</div>;
 * }
 * ```
 */
export function usePluginValidation(
  providerId: string,
  operation: string,
  values: Record<string, any>,
  context?: Record<string, any>
): ValidationResult {
  return useMemo(() => {
    return generationUIPluginRegistry.validate(
      { providerId, operation },
      values,
      context
    );
  }, [providerId, operation, values, context]);
}

/**
 * Component to render all plugins for a provider/operation
 *
 * @example
 * ```tsx
 * <GenerationPluginRenderer
 *   providerId="pixverse"
 *   operationType="text_to_video"
 *   values={values}
 *   onChange={handleChange}
 *   disabled={false}
 * />
 * ```
 */
export function GenerationPluginRenderer(props: GenerationUIPluginProps) {
  const plugins = useGenerationPlugins(props.providerId, props.operationType);

  return (
    <>
      {plugins.map(plugin => {
        const Component = plugin.component;
        return <Component key={plugin.id} {...props} />;
      })}
    </>
  );
}
