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
 * Supports two usage patterns:
 *
 * 1. Registry Mode (for feature-specific dockviews):
 * ```tsx
 * <SmartDockview
 *   registry={myRegistry}
 *   defaultLayout={(api) => { ... }}
 *   storageKey="my-feature-layout"
 *   panelManagerId="feature-dockview"
 * />
 * ```
 *
 * 2. Components Mode (for main workspace):
 * ```tsx
 * <SmartDockview
 *   components={{ panel: MyPanel }}
 *   onReady={handleReady}
 *   panelManagerId="workspace"
 * />
 * ```
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
import { panelRegistry, panelSettingsScopeRegistry, usePanelInstanceSettingsStore } from '@features/panels';
import { ContextHubHost, useContextHubState } from '@features/contextHub';
import {
  CustomTabComponent,
  useContextMenuOptional,
  DockviewIdProvider,
  useDockviewId,
} from './contextMenu';

/** Base props shared by both modes */
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
  /** Optional: IDs of global panels to include from global registry */
  globalPanelIds?: string[];
  /** Optional: Include all global panels in add-panel menu and components */
  includeGlobalPanels?: boolean;
  /** Optional: Enable context menu support (requires ContextMenuProvider at app root) */
  enableContextMenu?: boolean;
  /** Optional: Enable panel-content context menus (default: show when context menu is enabled) */
  enablePanelContentContextMenu?: boolean;
  /** Optional: Override panel titles/icons/categories for context menu */
  panelRegistryOverrides?: Record<string, { title?: string; icon?: string; category?: string }>;
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

/**
 * SmartDockview
 *
 * Unified dockview wrapper with smart features.
 * When enableContextMenu is true, requires ContextMenuProvider at app root.
 */
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
    globalPanelIds = [],
    includeGlobalPanels = false,
    enableContextMenu = false,
    enablePanelContentContextMenu = true,
    panelRegistryOverrides = {},
    watermarkComponent,
    tabComponents: customTabComponents,
    theme = 'dockview-theme-abyss',
    capabilities,
  } = props;

  // Context menu (optional - returns null if no provider)
  const contextMenu = useContextMenuOptional();

  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);
  const [globalRegistryVersion, setGlobalRegistryVersion] = useState(0);
  const [scopeRegistryVersion, setScopeRegistryVersion] = useState(0);
  const dockviewHostId = useMemo(
    () =>
      panelManagerId
        ? `dockview:${panelManagerId}`
        : `dockview:${Math.random().toString(36).slice(2, 9)}`,
    [panelManagerId],
  );

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

  useEffect(() => {
    return panelRegistry.subscribe(() => {
      setGlobalRegistryVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    return panelSettingsScopeRegistry.subscribe(() => {
      setScopeRegistryVersion((version) => version + 1);
    });
  }, []);

  const { onReady: onSmartReady, loadLayout } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
  });

  const scopeDefinitions = useMemo(
    () => panelSettingsScopeRegistry.getAll(),
    [scopeRegistryVersion],
  );
  const emptyInstanceScopes = useMemo(() => ({} as Record<string, string>), []);

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

      const wrapped = useMemo(() => {
        if (!scopeDefinitions.length) return children;
        return scopeDefinitions.reduceRight((content, scope) => {
          const mode = instanceScopes?.[scope.id] ?? scope.defaultMode ?? "global";
          if (mode !== "local" || !scope.renderProvider) {
            return content;
          }
          return scope.renderProvider(instanceId, content);
        }, children as ReactNode);
      }, [children, instanceId, instanceScopes, scopeDefinitions]);

      return <>{wrapped}</>;
    },
    [scopeDefinitions],
  );

  const resetDockviewLayout = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
    if (!apiRef.current) return;

    // Clear existing panels
    apiRef.current.panels.forEach((panel) => {
      apiRef.current?.removePanel(panel);
    });

    // Rebuild default layout when available
    if (registryMode && registry && defaultLayout) {
      defaultLayout(apiRef.current, registry);
    }
  }, [storageKey, registryMode, registry, defaultLayout]);

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  // Determine if context menu features should be active
  const contextMenuActive = enableContextMenu && contextMenu !== null;

  const dockviewPanelRegistry = useMemo(() => {
    const entries: Array<{ id: string; title: string; icon?: string; category?: string }> = [];
    const seen = new Set<string>();

    if (registry) {
      registry.getAll().forEach((def) => {
        if (def.isInternal) return;
        if (seen.has(def.id)) return;
        seen.add(def.id);
        const override = panelRegistryOverrides[def.id] ?? {};
        entries.push({
          id: def.id,
          title: override.title ?? def.title,
          icon: override.icon ?? def.icon,
          category: override.category,
        });
      });
    }

    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach((panelId) => {
        if (seen.has(panelId)) return;
        const globalDef = panelRegistry.get(panelId);
        if (!globalDef) return;
        seen.add(panelId);
        const override = panelRegistryOverrides[globalDef.id] ?? {};
        entries.push({
          id: globalDef.id,
          title: override.title ?? globalDef.title,
          icon: override.icon ?? globalDef.icon,
          category: override.category ?? globalDef.category,
        });
      });
    }

    if (includeGlobalPanels) {
      const panels = panelRegistry.getPublicPanels
        ? panelRegistry.getPublicPanels()
        : panelRegistry.getAll();
      panels.forEach((panel) => {
        if (seen.has(panel.id)) return;
        seen.add(panel.id);
        const override = panelRegistryOverrides[panel.id] ?? {};
        entries.push({
          id: panel.id,
          title: override.title ?? panel.title,
          icon: override.icon ?? panel.icon,
          category: override.category ?? panel.category,
        });
      });
    }

    if (!registry && panelManagerId === 'workspace') {
      const panels = panelRegistry.getPublicPanels
        ? panelRegistry.getPublicPanels()
        : panelRegistry.getAll();
      panels.forEach((panel) => {
        if (seen.has(panel.id)) return;
        seen.add(panel.id);
        const override = panelRegistryOverrides[panel.id] ?? {};
        entries.push({
          id: panel.id,
          title: override.title ?? panel.title,
          icon: override.icon ?? panel.icon,
          category: override.category ?? panel.category,
        });
      });
    }

    if (entries.length === 0) return undefined;

    return {
      getAll: () => entries,
    };
  }, [registry, globalPanelIds, includeGlobalPanels, panelManagerId, panelRegistryOverrides, globalRegistryVersion]);

  const components = useMemo(() => {
    if (directComponents) {
      const wrapped: Record<string, React.ComponentType<IDockviewPanelProps>> = {};
      Object.entries(directComponents).forEach(([key, Component]) => {
        const Wrapped = (panelProps: IDockviewPanelProps) => {
          const menu = useContextMenuOptional();
          const dockviewId = useDockviewId();
          const contextHubState = useContextHubState();
          const instanceId = panelProps.api.id;

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
            event.preventDefault();
            event.stopPropagation();
            menu.showContextMenu({
              contextType: 'panel-content',
              position: { x: event.clientX, y: event.clientY },
              panelId: panelProps.api?.id,
              groupId: panelProps.api?.group?.id,
              currentDockviewId: dockviewId,
              panelRegistry: dockviewPanelRegistry,
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
              <ScopeWrapper instanceId={instanceId}>
                <Component {...panelProps} />
              </ScopeWrapper>
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
          const instanceId = panelProps.api.id;

          const handleContextMenu = (event: React.MouseEvent) => {
            if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
            event.preventDefault();
            event.stopPropagation();
            menu.showContextMenu({
              contextType: 'panel-content',
              position: { x: event.clientX, y: event.clientY },
              panelId: panelProps.api?.id,
              groupId: panelProps.api?.group?.id,
              currentDockviewId: dockviewId,
              panelRegistry: dockviewPanelRegistry,
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
              <ScopeWrapper instanceId={instanceId}>
                <BaseComponent {...panelProps} />
              </ScopeWrapper>
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

      const GlobalPanelWrapper = (dockviewProps: IDockviewPanelProps) => {
        const Component = globalDef.component;
        const instanceId = dockviewProps.api?.id ?? panelId;
        return (
          <ScopeWrapper instanceId={instanceId}>
            <Component {...dockviewProps} context={contextRef.current} panelId={globalDef.id} />
          </ScopeWrapper>
        );
      };
      GlobalPanelWrapper.displayName = `GlobalPanel(${panelId})`;

      const Wrapped = (panelProps: IDockviewPanelProps) => {
        const menu = useContextMenuOptional();
        const dockviewId = useDockviewId();
        const contextHubState = useContextHubState();

        const handleContextMenu = (event: React.MouseEvent) => {
          if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
          event.preventDefault();
          event.stopPropagation();
          menu.showContextMenu({
            contextType: 'panel-content',
            position: { x: event.clientX, y: event.clientY },
            panelId: panelProps.api?.id,
            groupId: panelProps.api?.group?.id,
            currentDockviewId: dockviewId,
            panelRegistry: dockviewPanelRegistry,
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
            <GlobalPanelWrapper {...panelProps} />
          </div>
        );
      };
      Wrapped.displayName = `SmartPanelContentMenu(${panelId})`;
      map[panelId] = Wrapped;
    };

    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach(registerGlobalPanel);
    }

    if (includeGlobalPanels) {
      const panels = panelRegistry.getPublicPanels
        ? panelRegistry.getPublicPanels()
        : panelRegistry.getAll();
      panels.forEach((panel) => registerGlobalPanel(panel.id));
    }

    return map;
  }, [
    registry,
    globalPanelIds,
    includeGlobalPanels,
    directComponents,
    contextMenuActive,
    enablePanelContentContextMenu,
    dockviewPanelRegistry,
    globalRegistryVersion,
    resetDockviewLayout,
    ScopeWrapper,
  ]);

  // Handle dockview ready
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
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

        // Register with global context menu provider (if available)
        if (contextMenu) {
          contextMenu.registerDockview(panelManagerId, event.api, capabilities);
        }
      }

      // Registry mode: try to load saved layout or create default
      if (registryMode && registry && defaultLayout) {
        const loaded = loadLayout();

        if (!loaded && event.api.panels.length === 0) {
          defaultLayout(event.api, registry);
        }
      }

      setIsReady(true);
      onReadyProp?.(event.api);
    },
    [
      onSmartReady,
      loadLayout,
      defaultLayout,
      registry,
      onReadyProp,
      panelManagerId,
      registryMode,
      contextMenu,
      capabilities,
    ]
  );

  // Unregister on unmount
  useEffect(() => {
    return () => {
      if (panelManagerId && contextMenu) {
        contextMenu.unregisterDockview(panelManagerId);
      }
    };
  }, [panelManagerId, contextMenu]);

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
    if (!contextMenuActive || !contextMenu) return;
    e.preventDefault();
    contextMenu.showContextMenu({
      contextType: 'background',
      position: { x: e.clientX, y: e.clientY },
      currentDockviewId: panelManagerId,
      panelRegistry: dockviewPanelRegistry,
      resetDockviewLayout,
    });
  }, [contextMenuActive, contextMenu, panelManagerId, resetDockviewLayout, dockviewPanelRegistry]);

  return (
    <DockviewIdProvider
      dockviewId={panelManagerId}
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
