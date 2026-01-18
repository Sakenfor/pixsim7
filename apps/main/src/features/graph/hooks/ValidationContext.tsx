/**
 * Validation Provider Component
 *
 * Provides scene validation results to all graph components via React Context.
 * Validation is computed once per scene change and shared across all nodes.
 *
 * Usage:
 * ```tsx
 * // In parent component (e.g., graph editor surface):
 * <ValidationProvider sceneId={currentSceneId}>
 *   <ReactFlow nodes={nodes} ... />
 * </ValidationProvider>
 *
 * // In child component (e.g., SceneNode):
 * const { getNodeIssues } = useValidationContext();
 * const { issues, highestSeverity } = getNodeIssues(nodeId);
 * ```
 */

import { useMemo, type ReactNode } from 'react';

import { useGraphStore } from '../stores/graphStore';
import { selectCurrentScene } from '../stores/graphStore/selectors';

import { useSceneValidation } from './useSceneValidation';
import { ValidationContext, type NodeValidation, type ValidationContextValue } from './validationTypes';

interface ValidationProviderProps {
  children: ReactNode;
}

/**
 * Validation Provider
 *
 * Computes validation once for the current scene and provides indexed results
 * to all child components via context.
 */
export function ValidationProvider({ children }: ValidationProviderProps) {
  const currentScene = useGraphStore(selectCurrentScene);
  const validation = useSceneValidation(currentScene);

  // Memoize the getNodeIssues function to avoid recreating it on every render
  const getNodeIssues = useMemo(() => {
    // Create a cache for computed node validations
    const cache = new Map<string, NodeValidation>();

    return (nodeId: string): NodeValidation => {
      const cached = cache.get(nodeId);
      if (cached) return cached;

      const issues = validation.byNodeId.get(nodeId) || [];

      let highestSeverity: 'error' | 'warning' | 'info' | null = null;
      for (const issue of issues) {
        if (issue.severity === 'error') {
          highestSeverity = 'error';
          break;
        }
        if (issue.severity === 'warning' && highestSeverity !== 'error') {
          highestSeverity = 'warning';
        }
        if (issue.severity === 'info' && !highestSeverity) {
          highestSeverity = 'info';
        }
      }

      const result = { issues, highestSeverity };
      cache.set(nodeId, result);
      return result;
    };
  }, [validation]);

  const value = useMemo<ValidationContextValue>(
    () => ({
      validation,
      getNodeIssues,
      hasErrors: validation.errors.length > 0,
      hasWarnings: validation.warnings.length > 0,
    }),
    [validation, getNodeIssues]
  );

  return (
    <ValidationContext.Provider value={value}>
      {children}
    </ValidationContext.Provider>
  );
}
