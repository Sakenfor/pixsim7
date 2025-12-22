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
 * 1. Scope-based (panels filtered by `availableIn` field):
 * ```tsx
 * <SmartDockview
 *   scope="control-center"
 *   storageKey="dockview:control-center:v1"
 *   panelManagerId="controlCenter"
 * />
 * ```
 *
 * 2. Explicit panel list:
 * ```tsx
 * <SmartDockview
 *   panels={['quickGenerate', 'info', 'media-preview']}
 *   storageKey="dockview:asset-viewer:v1"
 *   panelManagerId="assetViewer"
 * />
 * ```
 *
 * 3. With custom layout:
 * ```tsx
 * <SmartDockview
 *   scope="workspace"
 *   defaultLayout={(api, panelDefs) => {
 *     // Custom layout logic
 *   }}
 *   storageKey="dockview:workspace:v1"
 * />
 * ```
 *
 * Legacy API (for backward compatibility):
 * - registry: LocalPanelRegistry (deprecated - use scope/panels instead)
 * - globalPanelIds: string[] (deprecated - use panels instead)
 * - includeGlobalPanels: boolean (deprecated - use scope instead)
 * - panelRegistryOverrides: (deprecated - set at panel registration time)
 *
 * Context Menu:
 * - Requires ContextMenuProvider at app root
 * - Set enableContextMenu={true} to enable right-click menus
 * - panelManagerId is used as the dockview ID for cross-dockview communication
 */

import { useCallback, useEffect, useRef, useMemo, useState, type ReactNode } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';
import clsx from 'clsx';
import 'dockview/dist/styles/dockview.css';
import styles from './SmartDockview.module.css';
import { useSmartDockview } from './useSmartDockview';
import type { LocalPanelRegistry } from './LocalPanelRegistry';
import type { LocalPanelDefinition } from './types';
import {
  panelRegistry,
  panelSettingsScopeRegistry,
  scopeProviderRegistry,
  usePanelInstanceSettingsStore,
  usePanelRegistryOverridesStore,
  getPanelsForScope,
  type ScopeMatchContext,
  type PanelDefinition,
} from '@features/panels';
import { ContextHubHost, useContextHubState } from '@features/contextHub';
import {
  CustomTabComponent,
  useContextMenuOptional,
  DockviewIdProvider,
  useDockviewId,
  extractContextFromElement,
  contextDataRegistry,
} from './contextMenu';

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
   * Optional: List of deprecated panel IDs.
   * If saved layout contains these panels, it will be automatically cleared.
   * Useful when removing panels from registry to prevent deserialization errors.
   * @example deprecatedPanels={['info', 'oldPanel']}
   */
  deprecatedPanels?: string[];

  // ============ NEW SIMPLIFIED API ============

  /**
   * Dockview scope ID - filters panels by their `availableIn` field.
   * Panels with this scope in their `availableIn` array will be available.
   *
   * @example scope="workspace" - Shows all panels with availableIn: ["workspace"]
   * @example scope="control-center" - Shows all panels with availableIn: ["control-center"]
   */
  scope?: string;

  /**
   * Explicit list of panel IDs to include. Takes precedence over `scope`.
   * Use when you need fine-grained control over which panels appear.
   *
   * @example panels={['quickGenerate', 'info', 'media-preview']}
   */
  panels?: string[];

  /**
   * Panel IDs to exclude (used with `scope`).
   * @example scope="workspace" excludePanels={['debug-panel']}
   */
  excludePanels?: string[];

  // ============ LEGACY API (for backward compatibility) ============

  /** @deprecated Use `panels` prop instead */
  globalPanelIds?: string[];
  /** @deprecated Use `scope` prop instead */
  includeGlobalPanels?: boolean;
  /** @deprecated Panel overrides should be set at registration time */
  panelRegistryOverrides?: Record<string, { title?: string; icon?: string; category?: string }>;
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

/** Union type for both modes */
export type SmartDockviewProps<TContext = any, TPanelId extends string = string> =
  | SmartDockviewRegistryProps<TContext, TPanelId>
  | SmartDockviewComponentsProps<TContext>;

/** Type guard for registry mode */
function isRegistryMode<TContext, TPanelId extends string>(
  props: SmartDockviewProps<TContext, TPanelId>
): props is SmartDockviewRegistryProps<TContext, TPanelId> {
  return 'registry' in props && props.registry !== undefined;
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
    return <Component {...props} context={context} panelId={definition.id} />;
  };
  PanelWrapper.displayName = `SmartPanel(${definition.id})`;
  return PanelWrapper;
}

function resolvePanelInstanceId(dockviewId: string | undefined, panelId: string) {
  return dockviewId ? `${dockviewId}:${panelId}` : panelId;
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
    // New simplified API
    scope,
    panels: panelsProp,
    excludePanels = [],
    // Legacy API (for backward compatibility)
    globalPanelIds = [],
    includeGlobalPanels = false,
    panelRegistryOverrides = {},
  } = props;

  // Context menu (optional - returns null if no provider)
  const contextMenu = useContextMenuOptional();

  // Resolve panel IDs from new simplified API or legacy props
  // Priority: panels > scope > globalPanelIds/includeGlobalPanels
  const resolvedPanelDefs = useMemo((): PanelDefinition[] => {
    // New API: explicit panels list
    if (panelsProp && panelsProp.length > 0) {
      return panelsProp
        .map(id => panelRegistry.get(id))
        .filter((def): def is PanelDefinition => def !== undefined);
    }

    // New API: scope-based filtering
    if (scope) {
      let panels = getPanelsForScope(scope);
      if (excludePanels.length > 0) {
        panels = panels.filter(p => !excludePanels.includes(p.id));
      }
      return panels;
    }

    // Legacy API: globalPanelIds
    if (globalPanelIds.length > 0) {
      return globalPanelIds
        .map(id => panelRegistry.get(id))
        .filter((def): def is PanelDefinition => def !== undefined);
    }

    // Legacy API: includeGlobalPanels
    if (includeGlobalPanels) {
      return panelRegistry.getPublicPanels
        ? panelRegistry.getPublicPanels()
        : panelRegistry.getAll();
    }

    // No panels specified - will use registry mode if provided
    return [];
  }, [panelsProp, scope, excludePanels, globalPanelIds, includeGlobalPanels]);

  // Store resolved panel IDs for stable reference
  const resolvedPanelIds = useMemo(
    () => resolvedPanelDefs.map(p => p.id),
    [resolvedPanelDefs]
  );

  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);
  const [globalRegistryVersion, setGlobalRegistryVersion] = useState(0);
  const [scopeRegistryVersion, setScopeRegistryVersion] = useState(0);
  const lastGlobalPanelIdsRef = useRef<string>('');
  const lastScopeIdsRef = useRef<string>('');
  // Use refs for props used in subscription effects to avoid effect re-runs
  const globalPanelIdsRef = useRef(globalPanelIds);
  globalPanelIdsRef.current = globalPanelIds;
  const includeGlobalPanelsRef = useRef(includeGlobalPanels);
  includeGlobalPanelsRef.current = includeGlobalPanels;
  const panelRegistryOverridesMap = usePanelRegistryOverridesStore((state) => state.overrides);
  const dockviewHostId = useMemo(
    () =>
      panelManagerId
        ? `dockview:${panelManagerId}`
        : `dockview:${Math.random().toString(36).slice(2, 9)}`,
    [panelManagerId],
  );
  const contextMenuDockviewId = panelManagerId ?? dockviewHostId;

  // Determine mode
  const registryMode = isRegistryMode(props);
  const registry = registryMode ? props.registry : undefined;
  const defaultLayout = registryMode ? props.defaultLayout : undefined;
  const directComponents = !registryMode ? props.components : undefined;

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

  // Subscribe to global panel registry - only update when panels we care about change
  // Uses refs to avoid effect re-running when props change
  useEffect(() => {
    const checkAndUpdate = () => {
      // Build list of panel IDs we care about (read from refs for latest values)
      let relevantIds: string[] = [];

      if (globalPanelIdsRef.current.length > 0) {
        relevantIds = [...globalPanelIdsRef.current];
      }

      if (includeGlobalPanelsRef.current) {
        const allPanels = panelRegistry.getPublicPanels
          ? panelRegistry.getPublicPanels()
          : panelRegistry.getAll();
        relevantIds = [...new Set([...relevantIds, ...allPanels.map(p => p.id)])];
      }

      const currentIds = relevantIds.sort().join(',');
      if (currentIds !== lastGlobalPanelIdsRef.current) {
        lastGlobalPanelIdsRef.current = currentIds;
        setGlobalRegistryVersion((version) => version + 1);
      }
    };

    // Initial check
    checkAndUpdate();

    return panelRegistry.subscribe(checkAndUpdate);
  }, []); // Empty deps - subscription is stable, uses refs for latest prop values

  // Subscribe to scope registry - only update when scope definitions actually change
  useEffect(() => {
    const checkAndUpdate = () => {
      const scopes = panelSettingsScopeRegistry.getAll();
      const scopeIds = scopes.map(s => s.id).sort().join(',');
      if (scopeIds !== lastScopeIdsRef.current) {
        lastScopeIdsRef.current = scopeIds;
        setScopeRegistryVersion((version) => version + 1);
      }
    };

    // Initial check
    checkAndUpdate();

    return panelSettingsScopeRegistry.subscribe(checkAndUpdate);
  }, []);

  const { onReady: onSmartReady, loadLayout } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
    deprecatedPanels,
  });

  const scopeDefinitions = useMemo(
    () => panelSettingsScopeRegistry.getAll(),
    [scopeRegistryVersion],
  );
  const scopeDefinitionsRef = useRef(scopeDefinitions);
  scopeDefinitionsRef.current = scopeDefinitions;

  const emptyInstanceScopes = useMemo(() => ({} as Record<string, string>), []);

  /**
   * AutoScopeWrapper - Automatically wraps panels with scope providers
   * based on declared scopes in panel definitions.
   *
   * This is different from ScopeWrapper (below) which handles Local/Global toggles.
   * AutoScopeWrapper is for automatic, metadata-driven scope injection.
   */
  const AutoScopeWrapper = useCallback(
    ({
      panelId,
      instanceId,
      declaredScopes,
      tags,
      category,
      children,
    }: {
      panelId: string;
      instanceId: string;
      declaredScopes?: string[];
      tags?: string[];
      category?: string;
      children: ReactNode;
    }) => {
      const context: ScopeMatchContext = useMemo(() => ({
        panelId,
        instanceId,
        declaredScopes,
        tags,
        category,
      }), [panelId, instanceId, declaredScopes, tags, category]);

      const wrapped = useMemo(() => {
        return scopeProviderRegistry.wrapWithProviders(context, children);
      }, [context, children]);

      return <>{wrapped}</>;
    },
    [],
  );

  /**
   * ScopeWrapper - Handles Local/Global scope toggles from panel settings UI.
   * This is for user-controlled scope switching, not automatic injection.
   * Uses ref to access scopeDefinitions to avoid being recreated when they change.
   */
  const ScopeWrapper = useCallback(
    ({
      instanceId,
      children,
    }: {
      instanceId: string;
      children: ReactNode;
    }) => {
      const instanceScopes = usePanelInstanceSettingsStore(
        (state) => state.instances[instanceId]?.scopes ?? emptyInstanceScopes,
      );
      // Access via ref to avoid component recreation on scopeDefinitions change
      const currentScopeDefinitions = scopeDefinitionsRef.current;

      const wrapped = useMemo(() => {
        if (!currentScopeDefinitions.length) return children;
        return currentScopeDefinitions.reduceRight((content, scope) => {
          const mode = instanceScopes?.[scope.id] ?? scope.defaultMode ?? "global";
          if (mode !== "local" || !scope.renderProvider) {
            return content;
          }
          // Debug logging when wrapping with scope provider
          if (process.env.NODE_ENV === "development") {
            console.debug(
              `[ScopeWrapper] Wrapping panel ${instanceId} with scope provider: ${scope.id}`
            );
          }
          return scope.renderProvider(instanceId, content);
        }, children as ReactNode);
      }, [children, instanceId, instanceScopes, currentScopeDefinitions]);

      return <>{wrapped}</>;
    },
    [], // Now stable - no dependencies on changing values
  );

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

    // New simplified API: use resolvedPanelDefs if available
    if (resolvedPanelDefs.length > 0) {
      resolvedPanelDefs.forEach((def) => {
        if (def.isInternal) return;
        if (seen.has(def.id)) return;
        seen.add(def.id);
        const override = panelRegistryOverrides[def.id] ?? {};
        const registryOverride = panelRegistryOverridesMap[def.id] ?? {};
        entries.push({
          id: def.id,
          title: override.title ?? def.title,
          icon: override.icon ?? def.icon,
          category: override.category ?? def.category,
          supportsMultipleInstances:
            registryOverride.supportsMultipleInstances ?? def.supportsMultipleInstances,
        });
      });
    }

    // Legacy: local registry
    if (registry) {
      registry.getAll().forEach((def) => {
        if (def.isInternal) return;
        if (seen.has(def.id)) return;
        seen.add(def.id);
        const override = panelRegistryOverrides[def.id] ?? {};
        const registryOverride = panelRegistryOverridesMap[def.id] ?? {};
        entries.push({
          id: def.id,
          title: override.title ?? def.title,
          icon: override.icon ?? def.icon,
          category: override.category,
          supportsMultipleInstances:
            registryOverride.supportsMultipleInstances ?? def.supportsMultipleInstances,
        });
      });
    }

    // Legacy: workspace fallback (when no scope/panels/registry specified)
    if (entries.length === 0 && !registry && panelManagerId === 'workspace') {
      const panels = panelRegistry.getPublicPanels
        ? panelRegistry.getPublicPanels()
        : panelRegistry.getAll();
      panels.forEach((panel) => {
        if (seen.has(panel.id)) return;
        seen.add(panel.id);
        const override = panelRegistryOverrides[panel.id] ?? {};
        const registryOverride = panelRegistryOverridesMap[panel.id] ?? {};
        entries.push({
          id: panel.id,
          title: override.title ?? panel.title,
          icon: override.icon ?? panel.icon,
          category: override.category ?? panel.category,
          supportsMultipleInstances:
            registryOverride.supportsMultipleInstances ?? panel.supportsMultipleInstances,
        });
      });
    }

    if (entries.length === 0) return undefined;

    return {
      getAll: () => entries,
    };
  }, [
    resolvedPanelDefs,
    registry,
    panelManagerId,
    panelRegistryOverrides,
    globalRegistryVersion,
    panelRegistryOverridesMap,
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
          const instanceId = resolvePanelInstanceId(dockviewId, panelProps.api.id);

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
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
                <ScopeWrapper instanceId={instanceId}>
                  <Component {...panelProps} />
                </ScopeWrapper>
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

    if (registry) {
      registry.getAll().forEach((def) => {
        const BaseComponent = createPanelWrapper(def, contextRef);
        const Wrapped = (panelProps: IDockviewPanelProps) => {
          const menu = useContextMenuOptional();
          const dockviewId = useDockviewId();
          const contextHubState = useContextHubState();
          const instanceId = resolvePanelInstanceId(dockviewId, panelProps.api.id);

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
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
                <AutoScopeWrapper
                  panelId={def.id}
                  instanceId={instanceId}
                  declaredScopes={def.scopes}
                  tags={undefined}
                  category={undefined}
                >
                  <ScopeWrapper instanceId={instanceId}>
                    <BaseComponent {...panelProps} />
                  </ScopeWrapper>
                </AutoScopeWrapper>
              </ContextHubHost>
            </div>
          );
        };
        Wrapped.displayName = `SmartPanelContentMenu(${def.id})`;
        map[def.id] = Wrapped;
      });
    }

    const registerGlobalPanel = (panelId: string) => {
      const globalDef = panelRegistry.get(panelId);
      if (!globalDef) {
        console.warn(`[SmartDockview] Global panel "${panelId}" not found in registry`);
        return;
      }

      const Wrapped = (panelProps: IDockviewPanelProps) => {
        const menu = useContextMenuOptional();
        const dockviewId = useDockviewId();
        const contextHubState = useContextHubState();
        const instanceId = resolvePanelInstanceId(dockviewId, panelProps.api?.id ?? panelId);
        const Component = globalDef.component;

        const handleContextMenu = (event: React.MouseEvent) => {
          if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
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
              <AutoScopeWrapper
                panelId={globalDef.id}
                instanceId={instanceId}
                declaredScopes={globalDef.scopes}
                tags={globalDef.tags}
                category={globalDef.category}
              >
                <ScopeWrapper instanceId={instanceId}>
                  <Component {...panelProps} context={contextRef.current} panelId={globalDef.id} />
                </ScopeWrapper>
              </AutoScopeWrapper>
            </ContextHubHost>
          </div>
        );
      };
      Wrapped.displayName = `SmartPanelContentMenu(${panelId})`;
      map[panelId] = Wrapped;
    };

    // New simplified API: register from resolvedPanelIds
    if (resolvedPanelIds.length > 0) {
      resolvedPanelIds.forEach(registerGlobalPanel);
    }

    return map;
    // Note: Many dependencies are intentionally excluded to stabilize the components map.
    // - ScopeWrapper/AutoScopeWrapper are stable (empty deps) and use refs internally
    // - dockviewPanelRegistry uses a ref to get the latest value at callback time
    // - resolvedPanelIds: initial resolved value used for component registration
    // The components map is created once and should not change during the component lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    registry,
    resolvedPanelIds,
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

      // Register with panel manager if ID provided
      if (panelManagerId) {
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          const meta = panelManager.getPanelMetadata(panelManagerId);
          if (meta?.dockview?.hasDockview) {
            panelManager.registerDockview(panelManagerId, event.api);
          }
        }).catch(() => {
          // Panel manager not available
        });
      }
      if (enableContextMenu && contextMenuRef.current) {
        contextMenuRef.current.registerDockview(contextMenuDockviewId, event.api, capabilitiesRef.current);
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

  // Unregister on unmount
  useEffect(() => {
    return () => {
      if (enableContextMenu && contextMenuRef.current) {
        contextMenuRef.current.unregisterDockview(contextMenuDockviewId);
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

  return (
    <DockviewIdProvider
      dockviewId={contextMenuDockviewId}
      panelRegistry={dockviewPanelRegistry}
      dockviewApi={dockviewApi}
    >
      <div
        className={clsx(styles.smartDockview, className)}
        onContextMenu={contextMenuActive ? handleBackgroundContextMenu : undefined}
      >
        <ContextHubHost hostId={dockviewHostId}>
          <DockviewReact
            components={components}
            tabComponents={tabComponents}
            watermarkComponent={watermarkComponent}
            onReady={handleReady}
            className={theme}
          />
        </ContextHubHost>
      </div>
    </DockviewIdProvider>
  );
}
