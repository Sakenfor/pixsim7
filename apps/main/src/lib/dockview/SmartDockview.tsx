/**
 * SmartDockview
 *
 * A lightweight dockview wrapper with smart tab visibility.
 * - Auto-hides tabs when a group has only 1 panel
 * - Shows tabs when 2+ panels are grouped together (user can drag to rearrange)
 * - Persists layout to localStorage
 * - Minimal chrome styling
 *
 * Usage:
 * ```tsx
 * const registry = createLocalPanelRegistry<'preview' | 'settings'>();
 * registry.register({ id: 'preview', title: 'Preview', component: PreviewPanel });
 * registry.register({ id: 'settings', title: 'Settings', component: SettingsPanel });
 *
 * <SmartDockview
 *   registry={registry}
 *   storageKey="my-feature-layout"
 *   context={{ someData }}
 *   defaultLayout={(api) => {
 *     api.addPanel({ id: 'preview', component: 'preview' });
 *     api.addPanel({ id: 'settings', component: 'settings', position: { direction: 'right' } });
 *   }}
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

export interface SmartDockviewProps<TContext = any, TPanelId extends string = string> {
  /** Panel registry with component definitions */
  registry: LocalPanelRegistry<TPanelId>;
  /** Storage key for layout persistence */
  storageKey?: string;
  /** Shared context passed to all panel components */
  context?: TContext;
  /**
   * Function to create the default layout
   * Called when no saved layout exists
   */
  defaultLayout: (api: DockviewReadyEvent['api'], registry: LocalPanelRegistry<TPanelId>) => void;
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

function SmartDockviewInner<TContext = any, TPanelId extends string = string>({
  registry,
  storageKey,
  context,
  defaultLayout,
  minPanelsForTabs = 2,
  className,
  onLayoutChange,
  onReady: onReadyProp,
  panelManagerId,
  globalPanelIds = [],
  enableContextMenu = false,
}: SmartDockviewProps<TContext, TPanelId>) {
  const [isReady, setIsReady] = useState(false);
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const contextRef = useRef<TContext | undefined>(context);

  // Keep context ref updated
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const { onReady: onSmartReady, loadLayout, getApi } = useSmartDockview({
    storageKey,
    minPanelsForTabs,
    onLayoutChange,
  });

  // Build components map from local registry + global registry
  const components = useMemo(() => {
    const map: Record<string, React.ComponentType<IDockviewPanelProps>> = {};

    // Add local registry panels
    registry.getAll().forEach((def) => {
      map[def.id] = createPanelWrapper(def, contextRef);
    });

    // Add global registry panels
    if (globalPanelIds.length > 0) {
      globalPanelIds.forEach((panelId) => {
        const globalDef = panelRegistry.get(panelId);
        if (globalDef) {
          // Wrap global panel component to match local panel interface
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
  }, [registry, globalPanelIds]);

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
        // Lazy load to avoid circular dependency
        import('@features/panels/lib/PanelManager').then(({ panelManager }) => {
          panelManager.registerDockview(panelManagerId, event.api);
        }).catch(err => {
          console.warn('[SmartDockview] Failed to register with panel manager:', err);
        });
      }

      // Try to load saved layout
      const loaded = loadLayout();
      console.log('[SmartDockview] Layout loaded from storage:', loaded);

      // If no saved layout, create default
      // Note: Check if panels exist to handle React StrictMode double-mount
      if (!loaded && event.api.panels.length === 0) {
        console.log('[SmartDockview] Creating default layout');
        defaultLayout(event.api, registry);
        console.log('[SmartDockview] Default layout created, panels:', event.api.panels.length);
      } else {
        console.log('[SmartDockview] Using existing layout, panels:', event.api.panels.length);
      }

      setIsReady(true);
      onReadyProp?.(event.api);
    },
    [onSmartReady, loadLayout, defaultLayout, registry, onReadyProp, panelManagerId, storageKey]
  );

  // Update panel params when context changes
  useEffect(() => {
    if (!isReady || !apiRef.current) return;

    const api = apiRef.current;

    // Update params for all panels
    api.panels.forEach((panel) => {
      panel.api.updateParameters({ context });
    });
  }, [context, isReady]);

  return (
    <div className={clsx(styles.smartDockview, className)}>
      <DockviewReact
        components={components}
        onReady={handleReady}
        className="dockview-theme-abyss"
      />
    </div>
  );
}
