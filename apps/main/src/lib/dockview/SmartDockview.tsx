/**
 * SmartDockview
 *
 * A unified dockview wrapper with smart features:
 * - Auto-hides tabs when a group has only 1 panel
 * - Shows tabs when 2+ panels are grouped together
 * - Optional layout persistence to localStorage
 * - Context menu support (requires global ContextMenuProvider)
 * - Minimal chrome styling
 *
 * Simplified API (recommended):
 *
 * 1. DockId-based (panels filtered by `availableIn` field):
 * ```tsx
 * <SmartDockview
 *   dockId="control-center"
 *   storageKey="dockview:control-center:v5"
 *   panelManagerId="controlCenter"
 * />
 * ```
 *
 * 2. Explicit panel list:
 * ```tsx
 * <SmartDockview
 *   panels={['quickGenerate', 'info', 'media-preview']}
 *   storageKey="dockview:asset-viewer:v5"
 *   panelManagerId="assetViewer"
 * />
 * ```
 *
 * 3. With custom layout:
 * ```tsx
 * <SmartDockview
 *   dockId="workspace"
 *   defaultLayout={(api, panelDefs) => {
 *     // Custom layout logic
 *   }}
 *   storageKey="dockview:workspace:v4"
 * />
 * ```
 *
 * Legacy API (for backward compatibility):
 * - registry: LocalPanelRegistry (deprecated - internal only; prefer dockId/panels)
 * - scope: Deprecated alias for dockId
 * - Default layout signature in registry mode: (api, registry) — avoid for new docks
 *
 * Context Menu:
 * - Requires ContextMenuProvider at app root
 * - Set enableContextMenu={true} to enable right-click menus
 * - panelManagerId becomes the public dockviewId for cross-dockview communication
 * - scopeHostId is always "dockview:{dockviewId}" and is used for ContextHubHost scoping
 */

import {
  SmartDockviewBase,
  getDockviewPanels,
  useSmartDockview,
  type LocalPanelRegistry,
} from '@pixsim7/shared.ui.dockview';
import clsx from 'clsx';
import { type DockviewReadyEvent, type IDockviewPanelHeaderProps, type IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { ContextHubHost, useProvideCapability, CAP_PANEL_CONTEXT } from '@features/contextHub';
import { type PanelDefinition } from '@features/panels';

import { DockviewIdProvider, useContextMenuOptional } from './contextMenu';
import { createDockviewHost } from './host';
import { registerDockviewHost, unregisterDockviewHost, getDockviewHost } from './hostRegistry';
import { useDockviewContextMenu } from './useDockviewContextMenu';
import { useDockviewIds } from './useDockviewIds';
import { useDockviewPanelRegistry } from './useDockviewPanelRegistry';
import { wrapPanelWithContextMenu, type PanelWrapOptions } from './wrapPanelWithContextMenu';

/** Base props shared by all modes */
interface SmartDockviewBaseProps<TContext = any> {
  /** Storage key for layout persistence (omit or set undefined to disable localStorage) */
  storageKey?: string;
  /** Shared context passed to all panel components */
  context?: TContext;
  /** Minimum panels in a group to show tabs (default: 2) */
  minPanelsForTabs?: number;
  /** Additional class name */
  className?: string;
  /** Callback when layout changes */
  onLayoutChange?: () => void;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /**
   * Stable dockview identifier used for:
   * - panel manager registration
   * - host registry lookup
   * - context menu cross-dockview actions
   *
   * When provided, this becomes the public dockviewId (scopeHostId is "dockview:{panelManagerId}").
   * When omitted, dockviewId falls back to a generated "dockview:{id}".
   */
  panelManagerId?: string;
  /** Optional: Enable context menu support (requires ContextMenuProvider at app root) */
  enableContextMenu?: boolean;
  /** Optional: Enable panel-content context menus (default: show when context menu is enabled) */
  enablePanelContentContextMenu?: boolean;
  /** Optional: Custom watermark component */
  watermarkComponent?: React.ComponentType;
  /** Optional: Custom tab components */
  tabComponents?: Record<string, React.ComponentType<IDockviewPanelHeaderProps>>;
  /** Optional: Dockview theme class (default: dockview-theme-abyss) */
  theme?: string;
  /** Optional: Dockview capabilities for context menu actions */
  capabilities?: {
    floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
  };
  /**
   * Optional: Default scopes to apply to all panels in this dockview.
   * Used for local registries that don't declare scopes per panel.
   */
  defaultPanelScopes?: string[];
  /**
   * Optional: Custom default layout for scope/panels mode.
   * Receives the resolved panel definitions for convenience.
   */
  defaultLayout?: (
    api: DockviewApi,
    panelDefs: PanelDefinition[] | LocalPanelRegistry<any>
  ) => void;
  /**
   * Optional: List of deprecated panel IDs.
   * If saved layout contains these panels, it will be automatically cleared.
   * Useful when removing panels from registry to prevent deserialization errors.
   * @example deprecatedPanels={['info', 'oldPanel']}
   */
  deprecatedPanels?: string[];

  // ============ NEW SIMPLIFIED API ============

  /**
   * Dockview ID - filters panels by their `availableIn` field.
   * Panels with this dockId in their `availableIn` array will be available.
   *
   * @example dockId="workspace" - Shows all panels with availableIn: ["workspace"]
   * @example dockId="control-center" - Shows all panels with availableIn: ["control-center"]
   */
  dockId?: string;

  /**
   * @deprecated Use `dockId` instead. Will be removed in a future version.
   * Alias for `dockId` - filters panels by their `availableIn` field.
   */
  scope?: string;

  /**
   * Explicit list of panel IDs to include. Takes precedence over `dockId`.
   * Use when you need fine-grained control over which panels appear.
   *
   * @example panels={['quickGenerate', 'info', 'media-preview']}
   */
  panels?: string[];

  /**
   * Panel IDs to exclude (used with `dockId`).
   * @example dockId="workspace" excludePanels={['debug-panel']}
   */
  excludePanels?: string[];

  /**
   * Optional allowlist of panels that can be added via context menu.
   * If omitted, all public panels are available.
   */
  allowedPanels?: string[];

  /**
   * Optional allowlist of panel categories that can be added via context menu.
   * If omitted, all categories are available.
   */
  allowedCategories?: string[];
}

/** Registry mode props - uses LocalPanelRegistry */
interface SmartDockviewRegistryProps<TContext = any, TPanelId extends string = string> extends SmartDockviewBaseProps<TContext> {
  /** Panel registry with component definitions */
  registry: LocalPanelRegistry<TPanelId>;
  /** Function to create the default layout */
  defaultLayout: (api: DockviewApi, registry: LocalPanelRegistry<TPanelId>) => void;
  /** Not used in registry mode */
  components?: never;
}

/** Components mode props - uses direct components map */
interface SmartDockviewComponentsProps<TContext = any> extends SmartDockviewBaseProps<TContext> {
  /** Direct components map (like DockviewReact) */
  components: Record<string, React.ComponentType<IDockviewPanelProps>>;
  /** Not used in components mode */
  registry?: never;
  /** Not used in components mode */
  defaultLayout?: never;
}

/** Panels mode props - uses global panel registry with explicit panel list or dockId filter */
interface SmartDockviewPanelsProps<TContext = any> extends SmartDockviewBaseProps<TContext> {
  /** Not used in panels mode */
  registry?: never;
  /** Not used in panels mode */
  components?: never;
}

/** Union type for all modes */
export type SmartDockviewProps<TContext = any, TPanelId extends string = string> =
  | SmartDockviewRegistryProps<TContext, TPanelId>
  | SmartDockviewComponentsProps<TContext>
  | SmartDockviewPanelsProps<TContext>;

/** Type guard for registry mode */
function isRegistryMode<TContext, TPanelId extends string>(
  props: SmartDockviewProps<TContext, TPanelId>
): props is SmartDockviewRegistryProps<TContext, TPanelId> {
  return 'registry' in props && props.registry !== undefined;
}

/**
 * Provides the panel context as a capability when context is defined.
 * This allows panels to consume context via `useCapability(CAP_PANEL_CONTEXT)`
 * instead of relying on prop drilling.
 */
function PanelContextProvider<TContext>({
  context,
  instanceId,
  children,
}: {
  context: TContext | undefined;
  instanceId: string;
  children: React.ReactNode;
}) {
  useProvideCapability(
    CAP_PANEL_CONTEXT,
    {
      id: `panel-context:${instanceId}`,
      label: 'Panel Context',
      getValue: () => context,
    },
    [context],
  );
  return <>{children}</>;
}

/**
 * SmartDockview
 *
 * Unified dockview wrapper with smart features.
 * When enableContextMenu is true, requires ContextMenuProvider at app root.
 */
/**
 * Default fallback layout - stacks all panels as tabs in a single group
 */
function createFallbackLayout(api: DockviewApi, panelDefs: PanelDefinition[]) {
  if (panelDefs.length === 0) return;

  // Add first panel
  api.addPanel({
    id: panelDefs[0].id,
    component: panelDefs[0].id,
    title: panelDefs[0].title,
  });

  // Add remaining panels as tabs in the same group
  for (let i = 1; i < panelDefs.length; i++) {
    api.addPanel({
      id: panelDefs[i].id,
      component: panelDefs[i].id,
      title: panelDefs[i].title,
      position: { referencePanel: panelDefs[0].id },
    });
  }
}

export function SmartDockview<TContext = any, TPanelId extends string = string>(
  props: SmartDockviewProps<TContext, TPanelId>
) {
  const {
    storageKey,
    context,
    minPanelsForTabs = 2,
    className,
    onLayoutChange,
    onReady: onReadyProp,
    panelManagerId,
    enableContextMenu = true,
    enablePanelContentContextMenu = true,
    watermarkComponent,
    tabComponents: customTabComponents,
    theme = 'dockview-theme-abyss',
    capabilities,
    deprecatedPanels = [],
    defaultPanelScopes,
    // New simplified API
    dockId,
    scope: scopeDeprecated,
    panels: panelsProp,
    excludePanels = [],
    allowedPanels,
    allowedCategories,
  } = props;

  // Resolve dockId (new) vs scope (deprecated)
  const scope = dockId ?? scopeDeprecated;

  // Context menu (optional - returns null if no provider)
  const contextMenu = useContextMenuOptional();

  // Resolve panel IDs from new simplified API or legacy props
  // Priority: panels > scope
  const resolvedPanelDefs = useMemo((): PanelDefinition[] => {
    if (panelsProp && panelsProp.length > 0) {
      let panels = panelsProp
        .map(id => panelSelectors.get(id))
        .filter((def): def is PanelDefinition => def !== undefined);
      if (allowedPanels && allowedPanels.length > 0) {
        const allowedSet = new Set(allowedPanels);
        panels = panels.filter((p) => allowedSet.has(p.id));
      }
      if (allowedCategories && allowedCategories.length > 0) {
        const allowedCat = new Set(allowedCategories);
        panels = panels.filter((p) => p.category && allowedCat.has(p.category));
      }
      return panels;
    }

    // New API: scope-based filtering
    if (scope) {
      let panels = panelSelectors.getForScope(scope);
      if (excludePanels.length > 0) {
        panels = panels.filter(p => !excludePanels.includes(p.id));
      }
      if (allowedPanels && allowedPanels.length > 0) {
        const allowedSet = new Set(allowedPanels);
        panels = panels.filter((p) => allowedSet.has(p.id));
      }
      if (allowedCategories && allowedCategories.length > 0) {
        const allowedCat = new Set(allowedCategories);
        panels = panels.filter((p) => p.category && allowedCat.has(p.category));
      }
      return panels;
    }

    // No panels specified - will use registry mode if provided
    return [];
  }, [panelsProp, scope, excludePanels, allowedPanels, allowedCategories]);

  // Determine which panels are allowed to be added (context menu)
  const availablePanelDefs = useMemo((): PanelDefinition[] => {
    // Start with all public panels
    let panels = panelSelectors.getPublicPanels();

    // If allowedPanels is provided (even if empty), strictly filter to those panels
    if (allowedPanels !== undefined) {
      const allowedSet = new Set(allowedPanels);
      panels = panels.filter((p) => allowedSet.has(p.id));
    }

    if (allowedCategories && allowedCategories.length > 0) {
      const allowedCat = new Set(allowedCategories);
      panels = panels.filter((p) => p.category && allowedCat.has(p.category));
    }

    return panels;
  }, [allowedPanels, allowedCategories]);

  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);
  const [globalRegistryVersion, setGlobalRegistryVersion] = useState(0);
  const { scopeHostId, dockviewId } = useDockviewIds(panelManagerId);
  // Determine mode
  const registryMode = isRegistryMode(props);
  const registry = registryMode ? props.registry : undefined;
  const defaultLayout = props.defaultLayout;
  const directComponents = !registryMode ? props.components : undefined;

  // If no panels resolved and no registry/direct components, fail fast
  const hasNoPanels =
    resolvedPanelDefs.length === 0 &&
    !registryMode &&
    !directComponents;

  useEffect(() => {
    if (hasNoPanels) {
      console.error("[SmartDockview] No panels resolved for this dockview. Check scope/panels configuration.");
    }
  }, [hasNoPanels]);

  // Keep context ref updated and force panels to re-render
  useEffect(() => {
    const prevContext = contextRef.current;
    contextRef.current = context;

    // Force all panels to re-render when context changes
    if (isReady && apiRef.current && context !== prevContext) {
      const panels = getDockviewPanels(apiRef.current);
      panels.forEach((panel) => {
        // Trigger re-render by updating params (even if params don't change)
        panel.api.updateParameters({});
      });
    }
  }, [context, isReady]);

  // Subscribe to global panel registry - bump version on any change
  useEffect(() => {
    const unsubscribe = panelSelectors.subscribe(() => {
      setGlobalRegistryVersion((version) => version + 1);
    });
    return unsubscribe;
  }, []);

  const layoutController = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
    deprecatedPanels,
  });

  // Use ref for defaultLayout to avoid resetDockviewLayout changing when parent recreates it
  const defaultLayoutRef = useRef(defaultLayout);
  defaultLayoutRef.current = defaultLayout;

  // Use ref for resolvedPanelDefs to access in callbacks without dependency
  const resolvedPanelDefsRef = useRef(resolvedPanelDefs);
  resolvedPanelDefsRef.current = resolvedPanelDefs;

  // Use ref for onReady prop to stabilize handleReady callback
  const onReadyPropRef = useRef(onReadyProp);
  onReadyPropRef.current = onReadyProp;

  // Use refs for volatile props to stabilize handleReady callback
  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;

  const applyDefaultLayout = useCallback((api: DockviewApi) => {
    if (defaultLayoutRef.current) {
      if (registryMode && registry) {
        defaultLayoutRef.current(api, registry);
      } else {
        defaultLayoutRef.current(api, resolvedPanelDefsRef.current as any);
      }
    } else if (resolvedPanelDefsRef.current.length > 0) {
      createFallbackLayout(api, resolvedPanelDefsRef.current);
    }
  }, [registryMode, registry]);

  const resetDockviewLayout = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    if (!apiRef.current) return;

    // Clear existing panels
    getDockviewPanels(apiRef.current).forEach((panel) => {
      apiRef.current?.removePanel(panel);
    });

    applyDefaultLayout(apiRef.current);
  }, [storageKey, applyDefaultLayout]);

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  // Determine if context menu features should be active
  const contextMenuActive = enableContextMenu && contextMenu !== null;

  // Panel registry for context menu "Add Panel" functionality
  const dockviewPanelRegistry = useDockviewPanelRegistry(availablePanelDefs, globalRegistryVersion);

  // Use ref for dockviewPanelRegistry to avoid components recreation
  const dockviewPanelRegistryRef = useRef(dockviewPanelRegistry);
  dockviewPanelRegistryRef.current = dockviewPanelRegistry;

  // Shared wrapper options for all modes
  const baseWrapOptions: Omit<PanelWrapOptions, 'panelId' | 'declaredScopes' | 'tags' | 'category'> = useMemo(() => ({
    contextMenuActive,
    enablePanelContentContextMenu,
    getDockviewPanelRegistry: () => dockviewPanelRegistryRef.current,
    getApiRef: () => apiRef.current,
    resetDockviewLayout,
    defaultPanelScopes,
  }), [contextMenuActive, enablePanelContentContextMenu, resetDockviewLayout, defaultPanelScopes]);

  const components = useMemo(() => {
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
    const seen = new Set<string>();

    // Helper to register a panel definition (used by registry and panels modes)
    const registerPanel = (
      id: string,
      component: React.ComponentType<any>,
      meta?: { scopes?: string[]; settingScopes?: string[]; tags?: string[]; category?: string },
    ) => {
      if (seen.has(id)) return;
      seen.add(id);
      map[id] = wrapPanelWithContextMenu(
        component,
        {
          ...baseWrapOptions,
          panelId: id,
          declaredScopes: meta?.settingScopes ?? meta?.scopes,
          tags: meta?.tags,
          category: meta?.category,
        },
        contextRef,
        PanelContextProvider,
      );
    };

    // Direct components mode - raw dockview components (no metadata)
    if (directComponents) {
      Object.entries(directComponents).forEach(([id, component]) => {
        registerPanel(id, component);
      });
      return map;
    }

    // Registry mode - LocalPanelRegistry with embedded components
    if (registry) {
      registry.getAll().forEach((def) => {
        registerPanel(def.id, def.component, def);
      });
    } else {
      // Panels mode - global panel registry (availablePanelDefs)
      availablePanelDefs.forEach((def) => {
        if (def.isInternal) return;
        registerPanel(def.id, def.component, def);
      });
    }

    return map;
  }, [
    registry,
    availablePanelDefs,
    directComponents,
    baseWrapOptions,
  ]);

  // Handle dockview ready - uses refs for props to stabilize callback
  const handleReady = useCallback(
    (api: DockviewApi) => {
      // Guard against multiple calls (can happen during rapid re-renders)
      if (apiRef.current === api) {
        return;
      }
      apiRef.current = api;
      setDockviewApi(api);

      // Register with central hostRegistry via context menu provider.
      // This single call creates the host and registers with hostRegistry.
      // Other systems (PanelManager, context menu actions) access via hostRegistry.
      if (enableContextMenu && contextMenuRef.current) {
        contextMenuRef.current.registerDockview(dockviewId, api, capabilitiesRef.current);
      } else {
        // If context menu not enabled, register directly with hostRegistry
        registerDockviewHost(createDockviewHost(dockviewId, api), capabilitiesRef.current);
      }

      // Register with panel manager if ID provided (stores reference in panel metadata)
      if (panelManagerId) {
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          const meta = panelManager.getPanelMetadata(panelManagerId);
          if (meta?.dockview?.hasDockview) {
            // Get host from central registry to ensure consistency
            const host = getDockviewHost(panelManagerId) ?? createDockviewHost(panelManagerId, api);
            panelManager.registerDockview(panelManagerId, host);
          }
        }).catch(() => {
          // Panel manager not available
        });
      }

      setIsReady(true);
      onReadyPropRef.current?.(api);
    },
    [
      panelManagerId,
      enableContextMenu,
      dockviewId,
    ]
  );

  // Unregister on unmount - single cleanup via context menu provider or directly
  useEffect(() => {
    return () => {
      if (enableContextMenu && contextMenuRef.current) {
        // This delegates to hostRegistry internally
        contextMenuRef.current.unregisterDockview(dockviewId);
      } else {
        // Direct cleanup if context menu not enabled
        unregisterDockviewHost(dockviewId);
      }
    };
  }, [enableContextMenu, dockviewId]);

  // Tab components - use default tab override when context menu is enabled
  const tabComponents = useMemo(() => {
    return customTabComponents;
  }, [customTabComponents]);

  // Background context menu and tab component from hook
  const { handleBackgroundContextMenu, defaultTabComponent } = useDockviewContextMenu({
    contextMenuActive,
    contextMenuRef,
    dockviewId,
    getDockviewPanelRegistry: () => dockviewPanelRegistryRef.current,
    resetDockviewLayout,
  });

  if (hasNoPanels) {
    return (
      <div className={clsx("h-full w-full", className)}>
        <div className="h-full w-full flex items-center justify-center text-neutral-500 text-sm">
          No panels available for this dockview.
        </div>
      </div>
    );
  }

  return (
    <DockviewIdProvider
      dockviewId={dockviewId}
      panelRegistry={dockviewPanelRegistry}
      dockviewApi={dockviewApi}
    >
      <div
        className="h-full w-full"
        onContextMenu={contextMenuActive ? handleBackgroundContextMenu : undefined}
        data-smart-dockview={dockviewId}
      >
        <ContextHubHost hostId={scopeHostId}>
          <SmartDockviewBase
            components={components as unknown as Record<string, React.FunctionComponent<IDockviewPanelProps>>}
            tabComponents={tabComponents as unknown as Record<string, React.FunctionComponent<IDockviewPanelHeaderProps>>}
            defaultTabComponent={defaultTabComponent as unknown as React.FunctionComponent<IDockviewPanelHeaderProps>}
            watermarkComponent={watermarkComponent as unknown as React.FunctionComponent}
            onReady={handleReady}
            className={className}
            theme={theme}
            layout={layoutController}
            defaultLayout={applyDefaultLayout}
          />
        </ContextHubHost>
      </div>
    </DockviewIdProvider>
  );
}
