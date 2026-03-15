/**
 * Panel wrapper that adds context menu support, ContextHubHost, and ScopeHost.
 *
 * This extracts the common wrapping pattern used for all three dockview modes
 * (direct components, registry, and global panels).
 */

import type { IDockviewPanelProps } from 'dockview';
import type { DockviewApi } from 'dockview-core';

import { Icon } from '@lib/icons';

import { ContextHubHost, useContextHubState } from '@features/contextHub';
import { getInstanceId, ScopeHost } from '@features/panels';


import { resolveBadgesForScopes } from './capabilityBadges';
import {
  useContextMenuOptional,
  useDockviewContext,
  extractContextFromElement,
  contextDataRegistry,
} from './contextMenu';
import { buildDockviewContext } from './contextMenu/buildDockviewContext';
import { setFloatingHostContextPayload } from './floatingPanelInterop';
import { PanelErrorBoundary } from './PanelErrorBoundary';

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
  /** Whether this panel is a dockview container (hosts sub-panels) */
  isDockviewContainer?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeFloatingContextValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth <= 0) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeFloatingContextValue(entry, seen, depth - 1))
      .filter((entry) => entry !== undefined);
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const next = sanitizeFloatingContextValue(entry, seen, depth - 1);
    if (next !== undefined) {
      out[key] = next;
    }
  }
  return out;
}

function buildFloatingContextPayload(context: unknown): Record<string, unknown> | undefined {
  const sanitized = sanitizeFloatingContextValue(context, new WeakSet<object>(), 5);
  return isPlainObject(sanitized) ? sanitized : undefined;
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
    isDockviewContainer,
  } = options;

  const Wrapped = (panelProps: IDockviewPanelProps) => {
    const menu = useContextMenuOptional();
    const { dockviewId, scopedPanelIds } = useDockviewContext();
    const contextHubState = useContextHubState();
    const instanceId = getInstanceId(dockviewId, panelProps.api?.id ?? panelId);
    const floatingContextPayload = buildFloatingContextPayload(contextRef.current);

    // Expose a runtime-only, sanitized host context snapshot for float actions.
    // Do not store this in panel params (those are persisted by dockview layouts).
    setFloatingHostContextPayload(panelProps.api, floatingContextPayload);

    const handleContextMenu = (event: React.MouseEvent) => {
      if (!contextMenuActive || !enablePanelContentContextMenu || !menu) return;
      if (event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement;
      // Opt-out escape hatch for interactive children that manage their own
      // right-click behavior (e.g. upload target pickers).
      if (target.closest('[data-context-ignore="true"]')) {
        return;
      }

      // Skip if event target is inside a nested SmartDockview (let the nested one handle it)
      const nestedDockview = target.closest('[data-smart-dockview]');
      const thisDockview = (event.currentTarget as HTMLElement).closest(
        '[data-smart-dockview]',
      );
      if (nestedDockview && nestedDockview !== thisDockview) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const baseContext = {
        currentDockviewId: dockviewId,
        panelRegistry: getDockviewPanelRegistry(),
        api: panelProps.containerApi ?? getApiRef() ?? undefined,
        resetDockviewLayout,
        contextHubState,
        scopedPanelIds,
      };

      // Check for component-level context (data-context-type attribute)
      const componentContext = extractContextFromElement(event.target);
      if (componentContext) {
        const resolvedData = contextDataRegistry.resolve(
          componentContext.type,
          componentContext.id,
        );
        menu.showContextMenu(
          buildDockviewContext(baseContext, {
            contextType: componentContext.type,
            position: { x: event.clientX, y: event.clientY },
            panelId: panelProps.api?.id,
            instanceId,
            groupId: panelProps.api?.group?.id,
            data: resolvedData ?? {
              id: componentContext.id,
              name: componentContext.label,
            },
          }),
        );
        return;
      }

      // Fall back to panel-content context
      menu.showContextMenu(
        buildDockviewContext(baseContext, {
          contextType: 'panel-content',
          position: { x: event.clientX, y: event.clientY },
          panelId: panelProps.api?.id,
          instanceId,
          groupId: panelProps.api?.group?.id,
          data: panelProps.params,
        }),
      );
    };

    // Skip badges for dockview-container panels — they render their own badge
    // inside their component (inner dockview covers this wrapper's absolute badge).
    // Also skip for sub-panels to avoid noise — only non-container scope owners show it.
    const badges = isDockviewContainer ? [] : resolveBadgesForScopes(declaredScopes);

    return (
      <div
        className="dv-panel-cq h-full w-full relative"
        onContextMenuCapture={
          contextMenuActive && enablePanelContentContextMenu
            ? handleContextMenu
            : undefined
        }
      >
        {badges.length > 0 && (
          <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 pointer-events-none opacity-30">
            {badges.map((badge) => (
              <span key={badge.scopeId} title={badge.tooltip}>
                <Icon name={badge.icon} size={11} />
              </span>
            ))}
          </div>
        )}
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
              <PanelErrorBoundary panelId={panelId}>
                <Component {...panelProps} context={contextRef.current} panelId={panelId} />
              </PanelErrorBoundary>
            </PanelContextProvider>
          </ScopeHost>
        </ContextHubHost>
      </div>
    );
  };

  Wrapped.displayName = `SmartPanel(${panelId})`;
  return Wrapped;
}
