/**
 * ScopeProviderRegistry
 *
 * A registry for automatic scope provider injection based on panel metadata.
 * Unlike panelSettingsScopeRegistry (which handles UI toggles for Local/Global),
 * this registry handles automatic provider wrapping based on panel definitions.
 *
 * How it works:
 * 1. Providers register with a predicate that matches panel IDs or metadata
 * 2. SmartDockview queries matching providers for each panel instance
 * 3. Matching providers wrap the panel content with their scope providers
 *
 * This enables automatic scoping without manual wiring in each panel.
 */

import { createContext, useContext, type ReactNode } from "react";
import { BaseRegistry } from "@lib/core/BaseRegistry";

/**
 * Generic context for scope instance ID.
 * Any scope provider can use this to expose its instanceId to children.
 */
const ScopeInstanceContext = createContext<string | undefined>(undefined);

/**
 * Provider component to set the scope instanceId for children.
 * Used by scope providers to expose their instanceId.
 */
export function ScopeInstanceProvider({
  instanceId,
  children,
}: {
  instanceId: string;
  children: ReactNode;
}) {
  return (
    <ScopeInstanceContext.Provider value={instanceId}>
      {children}
    </ScopeInstanceContext.Provider>
  );
}

/**
 * Hook to get the current scope's instanceId.
 * Returns undefined if not within a scope provider.
 * Use this for settings resolution so all components in the same scope share one instanceId.
 */
export function useScopeInstanceId(): string | undefined {
  return useContext(ScopeInstanceContext);
}

export interface ScopeProviderDefinition {
  /** Unique identifier for this scope provider */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description of what this scope provides */
  description?: string;
  /** Priority for ordering when multiple providers match (higher = outer wrapper) */
  priority?: number;
  /**
   * Predicate to determine if this provider should wrap a panel.
   * Can check panelId, or panel metadata like scopes/tags.
   */
  shouldWrap: (context: ScopeMatchContext) => boolean;
  /**
   * Wrap children with the scope provider.
   * @param instanceId - Unique instance ID (e.g., "dockview:assetViewer:quickGenerate")
   * @param children - The panel content to wrap
   */
  wrap: (instanceId: string, children: ReactNode) => ReactNode;
}

export interface ScopeMatchContext {
  /** The panel ID from the registry (e.g., "quickGenerate", "quickgen-prompt") */
  panelId: string;
  /** The full instance ID (e.g., "dockview:assetViewer:quickGenerate") */
  instanceId: string;
  /** Scopes declared in panel definition metadata */
  declaredScopes?: string[];
  /** Tags from panel definition */
  tags?: string[];
  /** Category from panel definition */
  category?: string;
}

class ScopeProviderRegistryImpl extends BaseRegistry<ScopeProviderDefinition> {
  /**
   * Get all providers that should wrap a given panel.
   * Returns providers sorted by priority (highest first = outermost wrapper).
   */
  getProvidersForPanel(context: ScopeMatchContext): ScopeProviderDefinition[] {
    const all = this.getAll();
    const matching = all.filter((provider) => {
      try {
        return provider.shouldWrap(context);
      } catch (err) {
        console.warn(
          `[ScopeProviderRegistry] Error in predicate for ${provider.id}:`,
          err
        );
        return false;
      }
    });

    // Sort by priority (higher = outer, processed first in reduceRight)
    return matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Wrap content with all matching scope providers for a panel.
   * Providers are applied from lowest to highest priority (innermost to outermost).
   */
  wrapWithProviders(
    context: ScopeMatchContext,
    children: ReactNode
  ): ReactNode {
    const providers = this.getProvidersForPanel(context);

    if (providers.length === 0) {
      return children;
    }

    // Log in development
    if (process.env.NODE_ENV === "development" && providers.length > 0) {
      console.debug(
        `[ScopeProviderRegistry] Wrapping ${context.instanceId} with providers:`,
        providers.map((p) => p.id)
      );
    }

    // Apply providers from lowest to highest priority (innermost first)
    // So highest priority ends up as outermost wrapper
    return providers.reduceRight((content, provider) => {
      return provider.wrap(context.instanceId, content);
    }, children);
  }
}

export const scopeProviderRegistry = new ScopeProviderRegistryImpl();

/**
 * Helper to create a scope provider that matches panels declaring a specific scope.
 */
export function createScopeMatcher(scopeId: string): ScopeProviderDefinition["shouldWrap"] {
  return (context) => {
    return context.declaredScopes?.includes(scopeId) ?? false;
  };
}
