/**
 * SmartDockview
 *
 * A unified dockview wrapper with smart features:
 * - Auto-hides tabs when a group has only 1 panel
 * - Shows tabs when 2+ panels are grouped together
 * - Optional layout persistence to localStorage
 * - Context menu support
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
 * />
 * ```
 *
 * 2. Components Mode (for main workspace):
 * ```tsx
 * <SmartDockview
 *   components={{ panel: MyPanel }}
 *   onReady={handleReady}
 *   disableLayoutPersistence
 * />
 * ```
 */

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import clsx from 'clsx';
import 'dockview/dist/styles/dockview.css';
import styles from './SmartDockview.module.css';
import { useSmartDockview } from './useSmartDockview';
import type { LocalPanelRegistry } from './LocalPanelRegistry';
import type { LocalPanelDefinition } from './types';
import { panelRegistry } from '@features/panels';
import { ContextMenuProvider, ContextMenuPortal, CustomTabComponent, useContextMenu, type ContextMenuRegistry } from './contextMenu';

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
  /** Optional: Register with panel manager for orchestration */
  panelManagerId?: string;
  /** Optional: IDs of global panels to include from global registry */
  globalPanelIds?: string[];
  /** Optional: Enable context menu support */
  enableContextMenu?: boolean;
  /** Optional: Custom context menu registry */
  contextMenuRegistry?: ContextMenuRegistry;
  /** Optional: Custom watermark component */
  watermarkComponent?: React.ComponentType;
  /** Optional: Custom tab components */
  tabComponents?: Record<string, React.ComponentType<IDockviewPanelProps>>;
  /** Optional: Dockview theme class (default: dockview-theme-abyss) */
  theme?: string;
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

    // Pass both dockview props and our context
    return <Component {...props} context={context} panelId={definition.id} />;
  };

  PanelWrapper.displayName = `SmartPanel(${definition.id})`;
  return PanelWrapper;
}

function SmartDockviewInner<TContext = any, TPanelId extends string = string>(
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
    watermarkComponent,
    tabComponents: customTabComponents,
    theme = 'dockview-theme-abyss',
  } = props;

  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);

  // Determine mode
  const registryMode = isRegistryMode(props);
  const registry = registryMode ? props.registry : undefined;
  const defaultLayout = registryMode ? props.defaultLayout : undefined;
  const directComponents = !registryMode ? props.components : undefined;

  // Keep context ref updated
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const { onReady: onSmartReady, loadLayout, getApi } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
  });

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  const components = useMemo(() => {
    // Components mode - use directly
    if (directComponents) {
      return directComponents;
    }

    // Registry mode - build from registry
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};

    // Add local registry panels
    if (registry) {
      registry.getAll().forEach((def) => {
        map[def.id] = createPanelWrapper(def, contextRef);
      });
    }

    // Add global registry panels
    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach((panelId) => {
        const globalDef = panelRegistry.get(panelId);
        if (globalDef) {
          const GlobalPanelWrapper = (props: IDockviewPanelProps) => {
            const Component = globalDef.component;
            return <Component context={contextRef.current} params={props.params} />;
          };
          GlobalPanelWrapper.displayName = `GlobalPanel(${panelId})`;
          map[panelId] = GlobalPanelWrapper;
        } else {
          console.warn(`[SmartDockview] Global panel "${panelId}" not found in registry`);
        }
      });
    }

    return map;
  }, [registry, globalPanelIds, directComponents]);

  // Handle dockview ready
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      console.log('[SmartDockview] Ready, storageKey:', storageKey);
      apiRef.current = event.api;

      // Initialize smart features (tab visibility, persistence)
      onSmartReady(event.api);

      // Register with panel manager if ID provided
      if (panelManagerId) {
        console.log('[SmartDockview] Registering with panel manager:', panelManagerId);
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          panelManager.registerDockview(panelManagerId, event.api);
        }).catch(err => {
          console.warn('[SmartDockview] Failed to register with panel manager:', err);
        });
      }

      // Registry mode: try to load saved layout or create default
      if (registryMode && registry && defaultLayout) {
        const loaded = loadLayout();
        console.log('[SmartDockview] Layout loaded from storage:', loaded);

        if (!loaded && event.api.panels.length === 0) {
          console.log('[SmartDockview] Creating default layout');
          defaultLayout(event.api, registry);
          console.log('[SmartDockview] Default layout created, panels:', event.api.panels.length);
        } else {
          console.log('[SmartDockview] Using existing layout, panels:', event.api.panels.length);
        }
      }
      // Components mode: caller handles layout in onReady

      setIsReady(true);
      onReadyProp?.(event.api);
    },
    [onSmartReady, loadLayout, defaultLayout, registry, onReadyProp, panelManagerId, storageKey, registryMode]
  );

  // Update panel params when context changes (registry mode only)
  useEffect(() => {
    if (!isReady || !apiRef.current || !registryMode) return;

    const api = apiRef.current;
    api.panels.forEach((panel) => {
      panel.api.updateParameters({ context });
    });
  }, [context, isReady, registryMode]);

  return (
    <div className={clsx(styles.smartDockview, className)}>
      <DockviewReact
        components={components}
        tabComponents={customTabComponents}
        watermarkComponent={watermarkComponent}
        onReady={handleReady}
        className={theme}
      />
    </div>
  );
}

/**
 * SmartDockview variant with context menu support
 *
 * Must be used within ContextMenuProvider.
 * Adds right-click context menus to tabs and background areas.
 */
function SmartDockviewWithContextMenu<TContext = any, TPanelId extends string = string>(
  props: Omit<SmartDockviewProps<TContext, TPanelId>, 'enableContextMenu' | 'contextMenuRegistry'>
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
    watermarkComponent,
    tabComponents: customTabComponents,
    theme = 'dockview-theme-abyss',
  } = props;

  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);

  // Determine mode
  const registryMode = isRegistryMode(props as SmartDockviewProps<TContext, TPanelId>);
  const registry = registryMode ? (props as SmartDockviewRegistryProps<TContext, TPanelId>).registry : undefined;
  const defaultLayout = registryMode ? (props as SmartDockviewRegistryProps<TContext, TPanelId>).defaultLayout : undefined;
  const directComponents = !registryMode ? (props as SmartDockviewComponentsProps<TContext>).components : undefined;

  // Context menu hooks
  const { showContextMenu, setDockviewApi } = useContextMenu();

  // Keep context ref updated
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const { onReady: onSmartReady, loadLayout, getApi } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
  });

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  const components = useMemo(() => {
    // Components mode - use directly
    if (directComponents) {
      return directComponents;
    }

    // Registry mode - build from registry
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};

    if (registry) {
      registry.getAll().forEach((def) => {
        map[def.id] = createPanelWrapper(def, contextRef);
      });
    }

    // Add global registry panels
    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach((panelId) => {
        const globalDef = panelRegistry.get(panelId);
        if (globalDef) {
          const GlobalPanelWrapper = (props: IDockviewPanelProps) => {
            const Component = globalDef.component;
            return <Component context={contextRef.current} params={props.params} />;
          };
          GlobalPanelWrapper.displayName = `GlobalPanel(${panelId})`;
          map[panelId] = GlobalPanelWrapper;
        } else {
          console.warn(`[SmartDockview] Global panel "${panelId}" not found in registry`);
        }
      });
    }

    return map;
  }, [registry, globalPanelIds, directComponents]);

  // Tab components - merge custom with context menu default
  const tabComponents = useMemo(() => ({
    default: CustomTabComponent,
    ...customTabComponents,
  }), [customTabComponents]);

  // Handle dockview ready
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      console.log('[SmartDockview] Ready with context menu, storageKey:', storageKey);
      apiRef.current = event.api;

      // Set dockview API for context menu
      setDockviewApi(event.api);

      // Initialize smart features (tab visibility, persistence)
      onSmartReady(event.api);

      // Register with panel manager if ID provided
      if (panelManagerId) {
        console.log('[SmartDockview] Registering with panel manager:', panelManagerId);
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          panelManager.registerDockview(panelManagerId, event.api);
        }).catch(err => {
          console.warn('[SmartDockview] Failed to register with panel manager:', err);
        });
      }

      // Registry mode: try to load saved layout or create default
      if (registryMode && registry && defaultLayout) {
        const loaded = loadLayout();
        console.log('[SmartDockview] Layout loaded from storage:', loaded);

        if (!loaded && event.api.panels.length === 0) {
          console.log('[SmartDockview] Creating default layout');
          defaultLayout(event.api, registry);
          console.log('[SmartDockview] Default layout created, panels:', event.api.panels.length);
        } else {
          console.log('[SmartDockview] Using existing layout, panels:', event.api.panels.length);
        }
      }
      // Components mode: caller handles layout in onReady

      setIsReady(true);
      onReadyProp?.(event.api);
    },
    [onSmartReady, loadLayout, defaultLayout, registry, onReadyProp, panelManagerId, storageKey, setDockviewApi, registryMode]
  );

  // Update panel params when context changes (registry mode only)
  useEffect(() => {
    if (!isReady || !apiRef.current || !registryMode) return;

    const api = apiRef.current;
    api.panels.forEach((panel) => {
      panel.api.updateParameters({ context });
    });
  }, [context, isReady, registryMode]);

  // Handle background context menu (right-click on empty dockview area)
  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    showContextMenu({
      contextType: 'background',
      position: { x: e.clientX, y: e.clientY },
    });
  }, [showContextMenu]);

  return (
    <div
      className={clsx(styles.smartDockview, className)}
      onContextMenu={handleBackgroundContextMenu}
    >
      <DockviewReact
        components={components}
        tabComponents={tabComponents}
        watermarkComponent={watermarkComponent}
        onReady={handleReady}
        className={theme}
      />
      <ContextMenuPortal />
    </div>
  );
}

/**
 * SmartDockview
 *
 * Unified dockview wrapper with smart features.
 * Supports two usage modes:
 *
 * 1. Registry Mode (for feature-specific dockviews):
 * ```tsx
 * <SmartDockview
 *   registry={myRegistry}
 *   defaultLayout={(api) => { ... }}
 *   storageKey="my-feature-layout"
 *   enableContextMenu
 * />
 * ```
 *
 * 2. Components Mode (for main workspace):
 * ```tsx
 * <SmartDockview
 *   components={{ panel: MyPanel }}
 *   onReady={handleReady}
 *   enableContextMenu
 *   theme="dockview-theme-dark"
 * />
 * ```
 */
export function SmartDockview<TContext = any, TPanelId extends string = string>(
  props: SmartDockviewProps<TContext, TPanelId>
) {
  const { enableContextMenu, contextMenuRegistry, ...innerProps } = props;

  // Without context menu - use simple inner component
  if (!enableContextMenu) {
    return <SmartDockviewInner {...props} />;
  }

  // With context menu - wrap with provider
  return (
    <ContextMenuProvider registry={contextMenuRegistry}>
      <SmartDockviewWithContextMenu {...innerProps} />
    </ContextMenuProvider>
  );
}
