/**
 * Panel Actions
 *
 * Context menu actions for panel operations:
 * - Close Panel
 * - Maximize Panel
 * - Float Panel (open as floating window)
 * - Duplicate Panel
 */

import { menuActionsToCapabilityActions } from '@pixsim7/shared.ui.context-menu';
import { isTabPinned, setTabPinned } from '@pixsim7/shared.ui.dockview';

import { registerActionsFromDefinitions } from '@lib/capabilities';
import {
  buildFloatingOriginMetaRecord,
  deriveFloatingGroupRestoreHint,
  removePanelAndPruneEmptyGroup,
  readFloatingHostContextPayload,
} from '@lib/dockview/floatingPanelInterop';

import { getDockviewPanels, resolvePanelDefinitionId as resolveDockviewPanelDefinitionId } from '../../panelAdd';
import { usePropertiesPopupStore } from '../PanelPropertiesPopup';
import { resolveCurrentDockviewApi } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

import { DOCKVIEW_ACTION_FEATURE_ID, ensureDockviewActionFeature } from './feature';

/**
 * Close the current panel
 */
export const closePanelAction: MenuAction = {
  id: 'panel:close',
  label: 'Close Panel',
  icon: 'x',
  category: 'panel',
  shortcut: '⌘W',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!resolveCurrentDockviewApi(ctx),
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.panelId) return;
    const panel = api.getPanel(ctx.panelId);
    if (panel) {
      api.removePanel(panel);
    }
  },
};

/**
 * Helper to check if panel is maximized
 */
function isPanelMaximized(ctx: MenuActionContext): boolean {
  const api = resolveCurrentDockviewApi(ctx);
  if (!api || !ctx.panelId) return false;
  const panel = api.getPanel(ctx.panelId);
  return panel?.api?.isMaximized?.() ?? false;
}

/**
 * Maximize the current panel (only visible when not maximized)
 */
export const maximizePanelAction: MenuAction = {
  id: 'panel:maximize',
  label: 'Maximize Panel',
  icon: 'maximize-2',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => !!ctx.panelId && !!resolveCurrentDockviewApi(ctx) && !isPanelMaximized(ctx),
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.panelId) return;
    const panel = api.getPanel(ctx.panelId);
    if (panel) {
      panel.api.maximize();
    }
  },
};

/**
 * Restore a maximized panel
 */
export const restorePanelAction: MenuAction = {
  id: 'panel:restore',
  label: 'Restore Panel',
  icon: 'minimize-2',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => isPanelMaximized(ctx),
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.panelId) return;
    const panel = api.getPanel(ctx.panelId);
    if (panel?.api?.isMaximized?.()) {
      panel.api.exitMaximized();
    }
  },
};

/**
 * Float the panel as a separate window
 *
 * This action is available for any dockview that provides a floatPanelHandler.
 * No assumptions about implementation - fully dynamic and extensible.
 */
export const floatPanelAction: MenuAction = {
  id: 'panel:float',
  label: 'Float Panel',
  icon: 'external-link',
  category: 'panel',
  availableIn: [
    'background',
    'tab',
    'panel-content',
    'asset',
    'asset-card',
    'node',
    'edge',
    'canvas',
    'item',
    'list-item',
  ],
  visible: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    const panelId = ctx.panelId ?? (api as any)?.activePanel?.id;
    if (!api || !panelId) return false;
    if (ctx.floatPanelHandler) return true;
    return !!ctx.workspaceStore;
  },
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    const panelId = ctx.panelId ?? (api as any)?.activePanel?.id;
    if (!panelId || !api) return;

    const panel = api.getPanel(panelId) ?? (api as any)?.activePanel;
    if (!panel) return;

    const resolvedPanelId = resolveDockviewPanelDefinitionId(panel);
    if (!resolvedPanelId) {
      console.warn("[panel:float] Could not resolve panel definition id", {
        panelId,
        dockviewId: ctx.currentDockviewId ?? null,
      });
      return;
    }
    const existingContext =
      typeof (panel as any)?.params === 'object' && (panel as any).params !== null
        ? (panel as any).params
        : {};
    const floatingHostContext = readFloatingHostContextPayload(panel);
    const existingPanelContext =
      typeof existingContext.context === "object" && existingContext.context !== null
        ? (existingContext.context as Record<string, unknown>)
        : undefined;
    const mergedPanelContext = floatingHostContext
      ? {
          ...(existingPanelContext ?? {}),
          ...floatingHostContext,
        }
      : existingPanelContext;
    const sourceGroupRestoreHint = deriveFloatingGroupRestoreHint(api, ctx.groupId ?? panel?.group?.id);
    const floatOptions = {
      // Don't hard-code dimensions — let the store resolve from lastFloatingPanelStates
      // so user-resized floating panels remember their size.
      context: {
        ...existingContext,
        ...(mergedPanelContext ? { context: mergedPanelContext } : {}),
        ...buildFloatingOriginMetaRecord({
          sourceDockviewId: ctx.currentDockviewId ?? null,
          sourceGroupId: ctx.groupId ?? null,
          sourceInstanceId:
            ctx.currentDockviewId && ctx.currentDockviewId.length > 0
              ? `${ctx.currentDockviewId}:${panelId}`
              : panelId,
          sourceDefinitionId: resolvedPanelId,
          sourceGroupRestoreHint,
        }),
      },
    };

    if (ctx.floatPanelHandler) {
      // Call the dockview's float handler with panel info
      try {
        ctx.floatPanelHandler(panelId, panel, floatOptions);
      } catch (error) {
        console.warn("[panel:float] Float handler failed", {
          panelId,
          dockviewId: ctx.currentDockviewId ?? null,
          error,
        });
        return;
      }
    } else if (ctx.workspaceStore && resolvedPanelId) {
      ctx.workspaceStore.getState().openFloatingPanel(resolvedPanelId, floatOptions);
    } else {
      return;
    }

    // Close from dockview after floating
    removePanelAndPruneEmptyGroup(api, panel, {
      sourceGroupId: ctx.groupId ?? panel?.group?.id ?? null,
    });
  },
};

export const pinTabAction: MenuAction = {
  id: 'panel:pin-tab',
  label: 'Pin Tab',
  icon: 'pin',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.panelId) return false;
    return !isTabPinned(ctx.panelId);
  },
  execute: (ctx) => {
    if (!ctx.panelId) return;
    setTabPinned(ctx.panelId, true);
  },
};

export const unpinTabAction: MenuAction = {
  id: 'panel:unpin-tab',
  label: 'Unpin Tab',
  icon: 'pin',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    if (!ctx.panelId) return false;
    return isTabPinned(ctx.panelId);
  },
  execute: (ctx) => {
    if (!ctx.panelId) return;
    setTabPinned(ctx.panelId, false);
  },
};

function getOpenPanels(ctx: MenuActionContext) {
  const api = resolveCurrentDockviewApi(ctx);
  if (!api) return [];
  const rawPanels = getDockviewPanels(api);

  return rawPanels.map((panel: any) => {
    const title =
      panel?.api?.title ??
      panel?.title ??
      panel?.params?.title ??
      panel?.id;
    return {
      id: panel?.id,
      title: title ?? panel?.id,
      panel,
    };
  }).filter((entry) => typeof entry.id === 'string');
}

/**
 * Focus an existing panel in this dockview
 */
export const focusPanelAction: MenuAction = {
  id: 'panel:focus',
  label: 'Focus Panel',
  icon: 'target',
  category: 'panel',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!resolveCurrentDockviewApi(ctx),
  children: (ctx) => {
    const openPanels = getOpenPanels(ctx).sort((a, b) => {
      return String(a.title).localeCompare(String(b.title));
    });

    if (openPanels.length === 0) {
      return [{
        id: 'panel:focus:empty',
        label: 'No panels open',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    return openPanels.map(({ id, title, panel }) => ({
      id: `panel:focus:${id}`,
      label: String(title),
      availableIn: ['background', 'tab', 'panel-content'] as const,
      execute: () => {
        panel?.api?.setActive?.();
      },
    }));
  },
  execute: () => {},
};

function resolvePanelDefinitionId(ctx: MenuActionContext): string | undefined {
  const dataPanelId = ctx.data?.panelId;
  if (typeof dataPanelId === 'string') return dataPanelId;
  if (typeof ctx.panelId === 'string') return ctx.panelId;
  return undefined;
}

/**
 * Context-aware Properties action.
 * Shows different properties based on what was clicked:
 * - Panel: shows panel info, instance, scopes
 * - Node/Asset/etc: shows item properties from ctx.data
 */
export const propertiesAction: MenuAction = {
  id: 'panel:properties', // Keep original ID for backwards compatibility
  label: 'Properties',
  icon: 'info',
  category: 'zzz', // Sort to end of menu
  availableIn: ['tab', 'panel-content', 'node', 'edge', 'asset', 'asset-card', 'canvas', 'item'],
  visible: (ctx) => {
    // For panel contexts, need a panel ID
    if (ctx.contextType === 'tab' || ctx.contextType === 'panel-content') {
      return !!resolvePanelDefinitionId(ctx);
    }
    // For other contexts, always show if we have position
    return !!ctx.position;
  },
  execute: (ctx) => {
    if (!ctx.position) return;

    const panelDefinitionId = resolvePanelDefinitionId(ctx);

    // Try to get panel definition from local registry (for feature dockviews)
    let panelDef: { title?: string; settingScopes?: string[]; scopes?: string[]; tags?: string[]; category?: string } | undefined;
    if (panelDefinitionId && ctx.panelRegistry) {
      panelDef = ctx.panelRegistry.getAll().find(p => p.id === panelDefinitionId);
    }

    // For panel contexts, use the panel's instanceId as hostId (matches per-panel ContextHubHost)
    // For other contexts, fall back to the contextHubState's hostId
    const isPanelContext = ctx.contextType === 'tab' || ctx.contextType === 'panel-content';
    const effectiveHostId = isPanelContext
      ? (ctx.instanceId ?? ctx.panelId)
      : ctx.contextHubState?.hostId;

    usePropertiesPopupStore.getState().open({
      position: ctx.position,
      contextType: ctx.contextType,
      panelId: panelDefinitionId,
      instanceId: ctx.instanceId ?? ctx.panelId,
      panelTitle: panelDef?.title,
      panelDefinition: panelDef,
      hostId: effectiveHostId,
      data: ctx.data as Record<string, unknown> | undefined,
      capabilities: ctx.capabilities,
    });
  },
};

/**
 * @deprecated Use propertiesAction instead
 */
export const panelPropertiesAction = propertiesAction;

/**
 * Close all other panels in the same group
 */
export const closeOtherPanelsAction: MenuAction = {
  id: 'panel:close-others',
  label: 'Close Other Tabs',
  icon: 'x-circle',
  category: 'panel',
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.groupId) return false;
    const group = api.getGroup(ctx.groupId);
    return group ? group.panels.length > 1 : false;
  },
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.groupId || !ctx.panelId) return;
    const group = api.getGroup(ctx.groupId);
    if (!group) return;

    // Get all panels except the current one
    const panelsToClose = group.panels.filter(p => p.id !== ctx.panelId);
    panelsToClose.forEach(panel => {
      api.removePanel(panel);
    });
  },
};

/**
 * Close all panels in the group
 */
export const closeAllInGroupAction: MenuAction = {
  id: 'panel:close-all-in-group',
  label: 'Close All in Group',
  icon: 'trash-2',
  category: 'panel',
  variant: 'danger',
  divider: true,
  availableIn: ['tab', 'panel-content'],
  visible: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.groupId) return false;
    const group = api.getGroup(ctx.groupId);
    return group ? group.panels.length > 1 : false;
  },
  execute: (ctx) => {
    const api = resolveCurrentDockviewApi(ctx);
    if (!api || !ctx.groupId) return;
    const group = api.getGroup(ctx.groupId);
    if (!group) return;

    // Close all panels in the group
    const panelsToClose = [...group.panels];
    panelsToClose.forEach(panel => {
      api.removePanel(panel);
    });
  },
};

const panelActionDescriptions: Record<string, string> = {
  [closePanelAction.id]: 'Close the current panel',
  [closeOtherPanelsAction.id]: 'Close other tabs in the same group',
  [closeAllInGroupAction.id]: 'Close all tabs in the current group',
  [maximizePanelAction.id]: 'Maximize the current panel',
  [restorePanelAction.id]: 'Restore the current panel',
  [floatPanelAction.id]: 'Float the current panel',
  [pinTabAction.id]: 'Keep this tab visible in compact mode',
  [unpinTabAction.id]: 'Remove this tab from pinned compact visibility',
  [propertiesAction.id]: 'Show properties for the current context',
};

const panelCapabilityActions: MenuAction[] = [
  closePanelAction,
  closeOtherPanelsAction,
  closeAllInGroupAction,
  maximizePanelAction,
  restorePanelAction,
  floatPanelAction,
  pinTabAction,
  unpinTabAction,
  propertiesAction,
];

const panelCapabilityMapping = menuActionsToCapabilityActions(panelCapabilityActions, {
  featureId: DOCKVIEW_ACTION_FEATURE_ID,
  descriptions: panelActionDescriptions,
});

export const panelActionDefinitions = panelCapabilityMapping.actionDefinitions;

let panelActionCapabilitiesRegistered = false;

export function registerPanelActionCapabilities() {
  if (panelActionCapabilitiesRegistered) return;
  panelActionCapabilitiesRegistered = true;

  ensureDockviewActionFeature();
  registerActionsFromDefinitions(panelActionDefinitions);
}

/**
 * All panel actions
 */
export const panelActions: MenuAction[] = [
  floatPanelAction,
  pinTabAction,
  unpinTabAction,
  focusPanelAction,
];
