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
 * - panelManagerId is used as the dockview ID for cross-dockview communication
 */

import clsx from 'clsx';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';

import 'dockview/dist/styles/dockview.css';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { ContextHubHost, useContextHubState, useProvideCapability, CAP_PANEL_CONTEXT } from '@features/contextHub';
import {
  getInstanceId,
  ScopeHost,
  type PanelDefinition,
} from '@features/panels';

import {
  CustomTabComponent,
  useContextMenuOptional,
  DockviewIdProvider,
  useDockviewId,
  extractContextFromElement,
  contextDataRegistry,
} from './contextMenu';
import { createDockviewHost } from './host';
import { registerDockviewHost, unregisterDockviewHost, getDockviewHost } from './hostRegistry';
import type { LocalPanelRegistry } from './LocalPanelRegistry';
import styles from './SmartDockview.module.css';
import type { LocalPanelDefinition } from './types';
import { useSmartDockview } from './useSmartDockview';

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
  onReady?: (api: DockviewReadyEvent['api']) => void;
  /** ID for this dockview - used for panel manager and context menu cross-dockview communication */
  panelManagerId?: string;
  /** Optional: Enable context menu support (requires ContextMenuProvider at app root) */
  enableContextMenu?: boolean;
  /** Optional: Enable panel-content context menus (default: show when context menu is enabled) */
  enablePanelContentContextMenu?: boolean;
  /** Optional: Custom watermark component */
  watermarkComponent?: React.ComponentType;
  /** Optional: Custom tab components */
  tabComponents?: Record<string, React.ComponentType<IDockviewPanelProps>>;
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
    api: DockviewReadyEvent['api'],
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
  defaultLayout: (api: DockviewReadyEvent['api'], registry: LocalPanelRegistry<TPanelId>) => void;
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
 * Creates a panel component wrapper that injects context
 */
function createPanelWrapper<TContext>(
  definition: LocalPanelDefinition,
  contextRef: React.RefObject<TContext | undefined>
) {
  const PanelWrapper = (props: IDockviewPanelProps) => {
    const Component = definition.component;
    const context = contextRef.current;
    const instanceId = props.api?.id ?? definition.id;
    return (
      <PanelContextProvider context={context} instanceId={instanceId}>
        <Component {...props} context={context} panelId={definition.id} />
      </PanelContextProvider>
    );
  };
  PanelWrapper.displayName = `SmartPanel(${definition.id})`;
  return PanelWrapper;
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

    if (allowedPanels && allowedPanels.length > 0) {
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
  const dockviewHostId = useMemo(
    () =>
      panelManagerId
        ? `dockview:${panelManagerId}`
        : `dockview:${Math.random().toString(36).slice(2, 9)}`,
    [panelManagerId],
  );
  const contextMenuDockviewId = panelManagerId ?? dockviewHostId;
  const defaultPanelScopesRef = useRef<string[] | undefined>(defaultPanelScopes);
  defaultPanelScopesRef.current = defaultPanelScopes;

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
      const panels = apiRef.current.panels;
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

  const { onReady: onSmartReady, loadLayout } = useSmartDockview({
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

  const resetDockviewLayout = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    if (!apiRef.current) return;

    // Clear existing panels
    apiRef.current.panels.forEach((panel) => {
      apiRef.current?.removePanel(panel);
    });

    // Rebuild layout
    // Priority: custom defaultLayout > fallback layout for new API
    if (defaultLayoutRef.current) {
      if (registryMode && registry) {
        defaultLayoutRef.current(apiRef.current, registry);
      } else {
        defaultLayoutRef.current(apiRef.current, resolvedPanelDefsRef.current as any);
      }
    } else if (resolvedPanelDefsRef.current.length > 0) {
      createFallbackLayout(apiRef.current, resolvedPanelDefsRef.current);
    }
  }, [storageKey, registryMode, registry]);

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  // Determine if context menu features should be active
  const contextMenuActive = enableContextMenu && contextMenu !== null;

  const dockviewPanelRegistry = useMemo(() => {
    const entries: Array<{
      id: string;
      title: string;
      icon?: string;
      category?: string;
      supportsMultipleInstances?: boolean;
    }> = [];
    const seen = new Set<string>();

    // Register all available panels (for add-panel menu)
    availablePanelDefs.forEach((def) => {
      if (def.isInternal) return;
      if (seen.has(def.id)) return;
      seen.add(def.id);
      entries.push({
        id: def.id,
        title: def.title,
        icon: def.icon,
        category: def.category,
        supportsMultipleInstances: def.supportsMultipleInstances,
      });
    });

    if (entries.length === 0) return undefined;

    return {
      getAll: () => entries,
    };
  }, [
    availablePanelDefs,
    globalRegistryVersion,
  ]);

  // Use ref for dockviewPanelRegistry to avoid components recreation
  const dockviewPanelRegistryRef = useRef(dockviewPanelRegistry);
  dockviewPanelRegistryRef.current = dockviewPanelRegistry;

  const components = useMemo(() => {
    if (directComponents) {
      const wrapped: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
      Object.entries(directComponents).forEach(([key, Component]) => {
        const Wrapped = (panelProps: IDockviewPanelProps) => {
          const menu = useContextMenuOptional();
          const dockviewId = useDockviewId();
          const contextHubState = useContextHubState();
          const instanceId = getInstanceId(dockviewId, panelProps.api.id);

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;

            // Skip if event target is inside a nested SmartDockview (let the nested one handle it)
            const target = event.target as HTMLElement;
            const nestedDockview = target.closest('[data-smart-dockview]');
            const thisDockview = (event.currentTarget as HTMLElement).closest('[data-smart-dockview]');
            if (nestedDockview && nestedDockview !== thisDockview) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            // Check for component-level context (data-context-type attribute)
            const componentContext = extractContextFromElement(event.target);
            if (componentContext) {
              // Resolve full data from registry
              const resolvedData = contextDataRegistry.resolve(
                componentContext.type,
                componentContext.id,
              );
              menu.showContextMenu({
                contextType: componentContext.type,
                position: { x: event.clientX, y: event.clientY },
                data: resolvedData ?? {
                  id: componentContext.id,
                  name: componentContext.label,
                },
                currentDockviewId: dockviewId,
              });
              return;
            }

            // Fall back to panel-content context
            menu.showContextMenu({
              contextType: 'panel-content',
              position: { x: event.clientX, y: event.clientY },
              panelId: panelProps.api?.id,
              instanceId,
              groupId: panelProps.api?.group?.id,
              currentDockviewId: dockviewId,
              panelRegistry: dockviewPanelRegistryRef.current,
              api: apiRef.current ?? undefined,
              resetDockviewLayout,
              data: panelProps.params,
              contextHubState,
            });
          };

          return (
            <div
              className="h-full w-full"
              onContextMenuCapture={
                contextMenuActive && enablePanelContentContextMenu ? handleContextMenu : undefined
              }
            >
              <ContextHubHost hostId={instanceId}>
                <ScopeHost
                  panelId={key}
                  instanceId={instanceId}
                  dockviewId={dockviewId}
                  fallbackScopes={defaultPanelScopesRef.current}
                >
                  <PanelContextProvider context={contextRef.current} instanceId={instanceId}>
                    <Component {...panelProps} />
                  </PanelContextProvider>
                </ScopeHost>
              </ContextHubHost>
            </div>
          );
        };
        Wrapped.displayName = `SmartPanelContentMenu(${key})`;
        wrapped[key] = Wrapped;
      });

      return wrapped;
    }

    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
    const seenPanelIds = new Set<string>();

    if (registry) {
      registry.getAll().forEach((def) => {
        if (seenPanelIds.has(def.id)) return;
        seenPanelIds.add(def.id);
        const BaseComponent = createPanelWrapper(def, contextRef);
        const Wrapped = (panelProps: IDockviewPanelProps) => {
          const menu = useContextMenuOptional();
          const dockviewId = useDockviewId();
          const contextHubState = useContextHubState();
          const instanceId = getInstanceId(dockviewId, panelProps.api.id);

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;

            // Skip if event target is inside a nested SmartDockview (let the nested one handle it)
            const target = event.target as HTMLElement;
            const nestedDockview = target.closest('[data-smart-dockview]');
            const thisDockview = (event.currentTarget as HTMLElement).closest('[data-smart-dockview]');
            if (nestedDockview && nestedDockview !== thisDockview) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            // Check for component-level context (data-context-type attribute)
            const componentContext = extractContextFromElement(event.target);
            if (componentContext) {
              const resolvedData = contextDataRegistry.resolve(
                componentContext.type,
                componentContext.id,
              );
              menu.showContextMenu({
                contextType: componentContext.type,
                position: { x: event.clientX, y: event.clientY },
                data: resolvedData ?? {
                  id: componentContext.id,
                  name: componentContext.label,
                },
                currentDockviewId: dockviewId,
              });
              return;
            }

            // Fall back to panel-content context
            menu.showContextMenu({
              contextType: 'panel-content',
              position: { x: event.clientX, y: event.clientY },
              panelId: panelProps.api?.id,
              instanceId,
              groupId: panelProps.api?.group?.id,
              currentDockviewId: dockviewId,
              panelRegistry: dockviewPanelRegistryRef.current,
              api: apiRef.current ?? undefined,
              resetDockviewLayout,
              data: panelProps.params,
              contextHubState,
            });
          };

          return (
            <div
              className="h-full w-full"
              onContextMenuCapture={
                contextMenuActive && enablePanelContentContextMenu ? handleContextMenu : undefined
              }
            >
              <ContextHubHost hostId={instanceId}>
                <ScopeHost
                  panelId={def.id}
                  instanceId={instanceId}
                  dockviewId={dockviewId}
                  declaredScopes={def.settingScopes ?? def.scopes}
                  fallbackScopes={defaultPanelScopesRef.current}
                  tags={def.tags}
                  category={def.category}
                >
                  <BaseComponent {...panelProps} />
                </ScopeHost>
              </ContextHubHost>
            </div>
          );
        };
        Wrapped.displayName = `SmartPanelContentMenu(${def.id})`;
        map[def.id] = Wrapped;
      });
    } else {
      const registerPanelDefinition = (def: PanelDefinition) => {
        if (def.isInternal) return;
        if (seenPanelIds.has(def.id)) return;
        seenPanelIds.add(def.id);

        const Wrapped = (panelProps: IDockviewPanelProps) => {
          const menu = useContextMenuOptional();
          const dockviewId = useDockviewId();
          const contextHubState = useContextHubState();
          const instanceId = getInstanceId(
            dockviewId,
            panelProps.api?.id ?? def.id,
          );
          const Component = def.component;

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;

            // Skip if event target is inside a nested SmartDockview (let the nested one handle it)
            const target = event.target as HTMLElement;
            const nestedDockview = target.closest('[data-smart-dockview]');
            const thisDockview = (event.currentTarget as HTMLElement).closest('[data-smart-dockview]');
            if (nestedDockview && nestedDockview !== thisDockview) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            // Check for component-level context (data-context-type attribute)
            const componentContext = extractContextFromElement(event.target);
            if (componentContext) {
              const resolvedData = contextDataRegistry.resolve(
                componentContext.type,
                componentContext.id,
              );
              menu.showContextMenu({
                contextType: componentContext.type,
                position: { x: event.clientX, y: event.clientY },
                data: resolvedData ?? {
                  id: componentContext.id,
                  name: componentContext.label,
                },
                currentDockviewId: dockviewId,
              });
              return;
            }

            // Fall back to panel-content context
            menu.showContextMenu({
              contextType: 'panel-content',
              position: { x: event.clientX, y: event.clientY },
              panelId: panelProps.api?.id,
              instanceId,
              groupId: panelProps.api?.group?.id,
              currentDockviewId: dockviewId,
              panelRegistry: dockviewPanelRegistryRef.current,
              api: apiRef.current ?? undefined,
              resetDockviewLayout,
              data: panelProps.params,
              contextHubState,
            });
          };

          return (
            <div
              className="h-full w-full"
              onContextMenuCapture={
                contextMenuActive && enablePanelContentContextMenu ? handleContextMenu : undefined
              }
            >
              <ContextHubHost hostId={instanceId}>
                <ScopeHost
                  panelId={def.id}
                  instanceId={instanceId}
                  dockviewId={dockviewId}
                  declaredScopes={def.settingScopes ?? def.scopes}
                  fallbackScopes={defaultPanelScopesRef.current}
                  tags={def.tags}
                  category={def.category}
                >
                  <PanelContextProvider context={contextRef.current} instanceId={instanceId}>
                    <Component {...panelProps} context={contextRef.current} panelId={def.id} />
                  </PanelContextProvider>
                </ScopeHost>
              </ContextHubHost>
            </div>
          );
        };
        Wrapped.displayName = `SmartPanelContentMenu(${def.id})`;
        map[def.id] = Wrapped;
      };

      availablePanelDefs.forEach(registerPanelDefinition);

    }

    return map;
    // Note: Many dependencies are intentionally excluded to stabilize the components map.
    // - ScopeHost is stable and uses refs internally
    // - dockviewPanelRegistry uses a ref to get the latest value at callback time
    // The components map is created once and should not change during the component lifecycle.
     
  }, [
    registry,
    availablePanelDefs,
    directComponents,
    contextMenuActive,
    enablePanelContentContextMenu,
    resetDockviewLayout,
  ]);

  // Handle dockview ready - uses refs for props to stabilize callback
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      // Guard against multiple calls (can happen during rapid re-renders)
      if (apiRef.current === event.api) {
        return;
      }
      apiRef.current = event.api;
      setDockviewApi(event.api);

      // Initialize smart features (tab visibility, persistence)
      onSmartReady(event.api);

      // Register with central hostRegistry via context menu provider.
      // This single call creates the host and registers with hostRegistry.
      // Other systems (PanelManager, context menu actions) access via hostRegistry.
      if (enableContextMenu && contextMenuRef.current) {
        contextMenuRef.current.registerDockview(contextMenuDockviewId, event.api, capabilitiesRef.current);
      } else {
        // If context menu not enabled, register directly with hostRegistry
        registerDockviewHost(createDockviewHost(contextMenuDockviewId, event.api), capabilitiesRef.current);
      }

      // Register with panel manager if ID provided (stores reference in panel metadata)
      if (panelManagerId) {
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          const meta = panelManager.getPanelMetadata(panelManagerId);
          if (meta?.dockview?.hasDockview) {
            // Get host from central registry to ensure consistency
            const host = getDockviewHost(panelManagerId) ?? createDockviewHost(panelManagerId, event.api);
            panelManager.registerDockview(panelManagerId, host);
          }
        }).catch(() => {
          // Panel manager not available
        });
      }

      // Try to load saved layout
      const loaded = loadLayout();

      // Create default layout if no saved layout and no panels exist
      if (!loaded && event.api.panels.length === 0) {
        // Priority: custom defaultLayout > fallback layout for new API > registry mode layout
        if (defaultLayoutRef.current) {
          // Custom defaultLayout provided
          if (registryMode && registry) {
            defaultLayoutRef.current(event.api, registry);
          } else {
            // Call with panelDefs for new API signature
            defaultLayoutRef.current(event.api, resolvedPanelDefsRef.current as any);
          }
        } else if (resolvedPanelDefsRef.current.length > 0) {
          // New simplified API: use fallback layout (stack as tabs)
          createFallbackLayout(event.api, resolvedPanelDefsRef.current);
        }
      }

      setIsReady(true);
      onReadyPropRef.current?.(event.api);
    },
    [
      onSmartReady,
      loadLayout,
      registry,
      panelManagerId,
      registryMode,
      enableContextMenu,
      contextMenuDockviewId,
    ]
  );

  // Unregister on unmount - single cleanup via context menu provider or directly
  useEffect(() => {
    return () => {
      if (enableContextMenu && contextMenuRef.current) {
        // This delegates to hostRegistry internally
        contextMenuRef.current.unregisterDockview(contextMenuDockviewId);
      } else {
        // Direct cleanup if context menu not enabled
        unregisterDockviewHost(contextMenuDockviewId);
      }
    };
  }, [enableContextMenu, contextMenuDockviewId]);

  // Tab components - add context menu tab if enabled
  const tabComponents = useMemo(() => {
    if (contextMenuActive) {
      return {
        default: CustomTabComponent,
        ...customTabComponents,
      };
    }
    return customTabComponents;
  }, [contextMenuActive, customTabComponents]);

  // Handle background context menu (right-click on empty dockview area)
  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    if (!contextMenuActive || !contextMenuRef.current) return;
    e.preventDefault();
    contextMenuRef.current.showContextMenu({
      contextType: 'background',
      position: { x: e.clientX, y: e.clientY },
      currentDockviewId: contextMenuDockviewId,
      panelRegistry: dockviewPanelRegistryRef.current,
      resetDockviewLayout,
    });
  }, [contextMenuActive, contextMenuDockviewId, resetDockviewLayout]);

  if (hasNoPanels) {
    return (
      <div className={clsx(styles.smartDockview, className)}>
        <div className="h-full w-full flex items-center justify-center text-neutral-500 text-sm">
          No panels available for this dockview.
        </div>
      </div>
    );
  }

  return (
    <DockviewIdProvider
      dockviewId={contextMenuDockviewId}
      panelRegistry={dockviewPanelRegistry}
      dockviewApi={dockviewApi}
    >
      <div
        className={clsx(styles.smartDockview, className)}
        onContextMenu={contextMenuActive ? handleBackgroundContextMenu : undefined}
        data-smart-dockview={contextMenuDockviewId}
      >
        <ContextHubHost hostId={dockviewHostId}>
          <DockviewReact
            components={components as unknown as Record<string, React.FunctionComponent<IDockviewPanelProps>>}
            tabComponents={tabComponents as unknown as Record<string, React.FunctionComponent<IDockviewPanelProps>>}
            watermarkComponent={watermarkComponent as unknown as React.FunctionComponent}
            onReady={handleReady}
            className={theme}
          />
        </ContextHubHost>
      </div>
    </DockviewIdProvider>
  );
}
