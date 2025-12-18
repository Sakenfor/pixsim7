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

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';
import clsx from 'clsx';
import 'dockview/dist/styles/dockview.css';
import styles from './SmartDockview.module.css';
import { useSmartDockview } from './useSmartDockview';
import type { LocalPanelRegistry } from './LocalPanelRegistry';
import type { LocalPanelDefinition } from './types';
import { panelRegistry } from '@features/panels';
import { CustomTabComponent, useContextMenuOptional, DockviewIdProvider } from './contextMenu';

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
  /** Optional: Enable context menu support (requires ContextMenuProvider at app root) */
  enableContextMenu?: boolean;
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
    enableContextMenu = false,
    watermarkComponent,
    tabComponents: customTabComponents,
    theme = 'dockview-theme-abyss',
  } = props;

  // Context menu (optional - returns null if no provider)
  const contextMenu = useContextMenuOptional();

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

  const { onReady: onSmartReady, loadLayout } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
  });

  // Build components map from local registry + global registry (registry mode)
  // Or use direct components (components mode)
  const components = useMemo(() => {
    if (directComponents) {
      return directComponents;
    }

    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};

    if (registry) {
      registry.getAll().forEach((def) => {
        map[def.id] = createPanelWrapper(def, contextRef);
      });
    }

    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach((panelId) => {
        const globalDef = panelRegistry.get(panelId);
        if (globalDef) {
          const GlobalPanelWrapper = (dockviewProps: IDockviewPanelProps) => {
            const Component = globalDef.component;
            return <Component context={contextRef.current} params={dockviewProps.params} />;
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
      apiRef.current = event.api;

      // Initialize smart features (tab visibility, persistence)
      onSmartReady(event.api);

      // Register with panel manager if ID provided
      if (panelManagerId) {
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          panelManager.registerDockview(panelManagerId, event.api);
        }).catch(() => {
          // Panel manager not available
        });

        // Register with global context menu provider (if available)
        if (contextMenu) {
          contextMenu.registerDockview(panelManagerId, event.api);
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
    [onSmartReady, loadLayout, defaultLayout, registry, onReadyProp, panelManagerId, registryMode, contextMenu]
  );

  // Unregister on unmount
  useEffect(() => {
    return () => {
      if (panelManagerId && contextMenu) {
        contextMenu.unregisterDockview(panelManagerId);
      }
    };
  }, [panelManagerId, contextMenu]);

  // Update panel params when context changes (registry mode only)
  useEffect(() => {
    if (!isReady || !apiRef.current || !registryMode) return;

    const api = apiRef.current;
    api.panels.forEach((panel) => {
      panel.api.updateParameters({ context });
    });
  }, [context, isReady, registryMode]);

  // Determine if context menu features should be active
  const contextMenuActive = enableContextMenu && contextMenu !== null;

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
    });
  }, [contextMenuActive, contextMenu, panelManagerId]);

  return (
    <DockviewIdProvider dockviewId={panelManagerId}>
      <div
        className={clsx(styles.smartDockview, className)}
        onContextMenu={contextMenuActive ? handleBackgroundContextMenu : undefined}
      >
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          watermarkComponent={watermarkComponent}
          onReady={handleReady}
          className={theme}
        />
      </div>
    </DockviewIdProvider>
  );
}
