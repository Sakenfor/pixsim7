/**
 * Panel wrapper that adds context menu support, ContextHubHost, and ScopeHost.
 *
 * This extracts the common wrapping pattern used for all three dockview modes
 * (direct components, registry, and global panels).
 */

import type { IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';

import { ContextHubHost, useContextHubState } from '@features/contextHub';
import { getInstanceId, ScopeHost } from '@features/panels';

import {
  useContextMenuOptional,
  useDockviewId,
  extractContextFromElement,
  contextDataRegistry,
} from './contextMenu';

export interface PanelWrapOptions {
  /** Panel definition ID (e.g., "info", "quickGenerate") */
  panelId: string;
  /** Whether context menu is active (enabled + provider exists) */
  contextMenuActive: boolean;
  /** Whether panel content context menus are enabled */
  enablePanelContentContextMenu: boolean;
  /** Getter for the panel registry (used for "Add Panel" menu) */
  getDockviewPanelRegistry: () => any;
  /** Getter for the dockview API ref */
  getApiRef: () => DockviewApi | null;
  /** Callback to reset the dockview layout */
  resetDockviewLayout: () => void;
  /** Default scopes for panels that don't declare their own */
  defaultPanelScopes?: string[];
  /** Panel-specific declared scopes (from definition) */
  declaredScopes?: string[];
  /** Panel tags (from definition) */
  tags?: string[];
  /** Panel category (from definition) */
  category?: string;
}

/**
 * Wraps a panel component with:
 * - Context menu handler (panel-content + component-level contexts)
 * - ContextHubHost for capability scoping
 * - ScopeHost for settings scopes
 * - PanelContextProvider for context injection
 *
 * The returned component is stable and suitable for use in dockview's components map.
 */
export function wrapPanelWithContextMenu(
  Component: React.ComponentType<IDockviewPanelProps & { context?: any; panelId?: string }>,
  options: PanelWrapOptions,
  contextRef: React.RefObject<any>,
  PanelContextProvider: React.ComponentType<{
    context: any;
    instanceId: string;
    children: React.ReactNode;
  }>,
): React.ComponentType<IDockviewPanelProps> {
  const {
    panelId,
    contextMenuActive,
    enablePanelContentContextMenu,
    getDockviewPanelRegistry,
    getApiRef,
    resetDockviewLayout,
    defaultPanelScopes,
    declaredScopes,
    tags,
    category,
  } = options;

  const Wrapped = (panelProps: IDockviewPanelProps) => {
    const menu = useContextMenuOptional();
    const dockviewId = useDockviewId();
    const contextHubState = useContextHubState();
    const instanceId = getInstanceId(dockviewId, panelProps.api?.id ?? panelId);

    const handleContextMenu = (event: React.MouseEvent) => {
      if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;

      // Skip if event target is inside a nested SmartDockview (let the nested one handle it)
      const target = event.target as HTMLElement;
      const nestedDockview = target.closest('[data-smart-dockview]');
      const thisDockview = (event.currentTarget as HTMLElement).closest(
        '[data-smart-dockview]',
      );
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
        panelRegistry: getDockviewPanelRegistry(),
        api: panelProps.containerApi ?? getApiRef() ?? undefined,
        resetDockviewLayout,
        data: panelProps.params,
        contextHubState,
      });
    };

    return (
      <div
        className="h-full w-full"
        onContextMenuCapture={
          contextMenuActive && enablePanelContentContextMenu
            ? handleContextMenu
            : undefined
        }
      >
        <ContextHubHost hostId={instanceId}>
          <ScopeHost
            panelId={panelId}
            instanceId={instanceId}
            dockviewId={dockviewId}
            declaredScopes={declaredScopes}
            fallbackScopes={defaultPanelScopes}
            tags={tags}
            category={category}
          >
            <PanelContextProvider context={contextRef.current} instanceId={instanceId}>
              <Component {...panelProps} context={contextRef.current} panelId={panelId} />
            </PanelContextProvider>
          </ScopeHost>
        </ContextHubHost>
      </div>
    );
  };

  Wrapped.displayName = `SmartPanel(${panelId})`;
  return Wrapped;
}
