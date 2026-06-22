/**
 * Add Panel Actions
 *
 * Context menu actions for adding panels to dockview:
 * - Shows available panels grouped by category
 * - Only shows panels registered in the panel catalog
 */

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { getDockWidgetByDockviewId, getDockWidgetPanelIds } from '@features/panels';

import { resolvePanelOpenPolicy } from '../../panelInstancePolicy';
import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuAction, MenuActionContext } from '../types';

import { addPanelInCurrentDockview, isPanelOpenAnywhere, isPanelOpenInCurrentDockview } from './panelOpenUtils';

/** Cap on how many scoped panels surface as Default Panels — beyond this the
 * full Add Panel browser is the better surface. */
const DEFAULT_PANELS_MAX = 20;

function getAddPanelEquivalentIds(panelId: string): string[] {
  const panelDef = panelSelectors.get(panelId) as { addPanelEquivalentIds?: unknown } | undefined;
  if (!Array.isArray(panelDef?.addPanelEquivalentIds)) {
    return [];
  }
  return panelDef.addPanelEquivalentIds.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

/**
 * Check reverse equivalence: is any open panel in this dockview declaring
 * `panelId` as one of its equivalents?
 */
function isRepresentedByOpenPanel(ctx: MenuActionContext, panelId: string): boolean {
  const allPanels = ctx.panelRegistry?.getAll?.() ?? [];
  for (const panel of allPanels) {
    if (panel.id === panelId) continue;
    const equivalents = getAddPanelEquivalentIds(panel.id);
    if (equivalents.includes(panelId) && isPanelOpenInCurrentDockview(ctx, panel.id, false)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a short suffix flagging where this panel is currently open, so the
 * menu can lightly mark already-added panels without hiding them. Probes with
 * allowMultiple=false because the indicator is informational — even
 * multi-instance panels should signal that an instance already exists.
 */
function getOpenIndicator(
  ctx: MenuActionContext,
  panelId: string,
): 'open' | 'open elsewhere' | null {
  if (isPanelOpenInCurrentDockview(ctx, panelId, false)) return 'open';
  if (isPanelOpenAnywhere(ctx, panelId)) return 'open elsewhere';
  return null;
}

function decoratePanelEntry(
  panel: { title: string; icon?: string },
  indicator: 'open' | 'open elsewhere' | null,
): { label: string; iconColor: string | undefined } {
  if (!indicator) return { label: panel.title, iconColor: undefined };
  return {
    label: `${panel.title}  ·  ${indicator}`,
    iconColor: 'text-neutral-500',
  };
}

function getPanelAddDisabledReason(
  ctx: MenuActionContext,
  panelId: string,
  allowMultiple: boolean,
  hasApi: boolean,
): string | false {
  if (!hasApi) return false;

  if (isPanelOpenInCurrentDockview(ctx, panelId, allowMultiple)) {
    return 'Already open';
  }

  if (allowMultiple) return false;

  // Forward: candidate declares equivalents that are already open
  for (const equivalentId of getAddPanelEquivalentIds(panelId)) {
    if (isPanelOpenInCurrentDockview(ctx, equivalentId, false)) {
      return 'Already represented';
    }
  }

  // Reverse: an open panel declares this candidate as its equivalent
  if (isRepresentedByOpenPanel(ctx, panelId)) {
    return 'Already represented';
  }

  // Cross-dockview: panel lives in some other dockview host in the app.
  // Mirrors the Quick Add logic so a panel open elsewhere is flagged here too,
  // keeping both menu surfaces consistent.
  if (isPanelOpenAnywhere(ctx, panelId)) {
    return 'Already open elsewhere';
  }

  return false;
}

/**
 * Get panels grouped by category from the panel catalog.
 *
 * Shows the full public catalog so users can browse every panel regardless of
 * the dock they right-clicked in. Earlier iterations restricted Add Panel to
 * `scopedPanelIds` (dock layout + scope-discovered extras) to "cut noise",
 * but that made discovery too restrictive — workspace-scope docks only
 * declare a handful of panels in `availableIn`, so the menu surfaced almost
 * nothing. Add Panel is now purely a browsable catalog.
 *
 * Filtering:
 *   - Self-exclusion: never offer the host dockview's own panel id.
 *   - Already-open panels stay listed (with a "· open" suffix + dimmed icon
 *     via decoratePanelEntry). Single-instance ones are then disabled with a
 *     reason; multi-instance ones remain enabled so the user can add another
 *     copy intentionally.
 */
function getPanelsByCategory(ctx: MenuActionContext): Map<string, Array<{
  id: string;
  title: string;
  icon?: string;
  supportsMultipleInstances?: boolean;
}>> {
  if (!ctx.panelRegistry) return new Map();

  const categories = new Map<string, Array<{
    id: string;
    title: string;
    icon?: string;
    supportsMultipleInstances?: boolean;
  }>>();
  const allPanels = ctx.panelRegistry.getPublicPanels
    ? ctx.panelRegistry.getPublicPanels()
    : ctx.panelRegistry.getAll();

  const hostPanelId = ctx.currentDockviewId;
  const defaultCategory = 'Other';

  for (const panel of allPanels) {
    if (hostPanelId && panel.id === hostPanelId) continue;

    const category = panel.category || defaultCategory;
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push({
      id: panel.id,
      title: panel.title,
      icon: panel.icon,
      supportsMultipleInstances: resolvePanelOpenPolicy(panel.id).allowMultiple,
    });
  }

  return categories;
}

function formatCategoryLabel(category: string): string {
  if (category === 'dev') return 'Dev';
  if (category === 'ui') return 'UI';
  if (category === 'api') return 'API';
  return category
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

/**
 * Add panel to the current dockview
 */
function addPanel(ctx: MenuActionContext, panelId: string, allowMultiple: boolean) {
  const registryEntry = ctx.panelRegistry?.getAll?.().find(p => p.id === panelId);
  const panelTitle = registryEntry?.title ?? panelId;

  if (getPanelAddDisabledReason(ctx, panelId, allowMultiple, true)) {
    return;
  }

  addPanelInCurrentDockview(ctx, panelId, {
    allowMultiple,
    title: panelTitle,
  });
}

/**
 * Add Panel action with nested category submenus
 */
export const addPanelAction: MenuAction = {
  id: 'panel:add',
  label: 'Add Panel',
  icon: 'plus-square',
  category: 'add',
  availableIn: ['background', 'tab', 'panel-content'],
  visible: (ctx) => !!resolveCurrentDockview(ctx).api,
  children: (ctx) => {
    if (!ctx.panelRegistry) {
      return [{
        id: 'panel:add:missing',
        label: 'Panels unavailable',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    const categories = getPanelsByCategory(ctx);

    if (categories.size === 0) {
      return [{
        id: 'panel:add:empty',
        label: 'No panels available',
        availableIn: ['background', 'tab', 'panel-content'],
        disabled: () => true,
        execute: () => {},
      }];
    }

    // Create category submenus
    const categoryActions: MenuAction[] = [];
    const { api } = resolveCurrentDockview(ctx);

    // Sort categories (put "Core" first, "Other" last)
    const sortedCategories = Array.from(categories.entries()).sort(([a], [b]) => {
      if (a === 'Core') return -1;
      if (b === 'Core') return 1;
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    for (const [category, panels] of sortedCategories) {
      // Create category submenu
      categoryActions.push({
        id: `panel:add:category:${category}`,
        label: formatCategoryLabel(category),
        availableIn: ['background', 'tab', 'panel-content'],
        children: panels.map(panel => {
          const allowMultiple = resolvePanelOpenPolicy(panel.id).allowMultiple;
          const { label, iconColor } = decoratePanelEntry(panel, getOpenIndicator(ctx, panel.id));
          return {
            id: `panel:add:${panel.id}`,
            label,
            icon: panel.icon,
            iconColor,
            availableIn: ['background', 'tab', 'panel-content'] as const,
            disabled: () => getPanelAddDisabledReason(ctx, panel.id, allowMultiple, !!api),
            execute: () => addPanel(ctx, panel.id, allowMultiple),
          };
        }),
        execute: () => {},
      });
    }

    return categoryActions;
  },
  execute: () => {}, // Parent doesn't execute
};

/**
 * Default Panels submenu — curated list of panels declared for the current
 * dock zone (via `getDockWidgetPanelIds`) or scoped via `ctx.scopedPanelIds`
 * (set by SmartDockview/PanelHostDockview from `allowedPanels` or `panelScope`).
 *
 * Only surfaces when the scope is small enough to be useful (≤ DEFAULT_PANELS_MAX).
 * Workspace-style docks expose hundreds of panels via their scope, in which case
 * Add Panel → category is the right surface and this submenu stays hidden.
 */
export function getDefaultScopePanelSubmenu(
  ctx: MenuActionContext,
  api: ReturnType<typeof resolveCurrentDockview>['api'],
): MenuAction | null {
  if (!ctx.currentDockviewId || !ctx.panelRegistry) return null;

  const dockZonePanelIds = getDockWidgetPanelIds(ctx.currentDockviewId);
  const scopedIds = dockZonePanelIds.length > 0
    ? dockZonePanelIds
    : ctx.scopedPanelIds ?? [];

  if (scopedIds.length === 0 || scopedIds.length > DEFAULT_PANELS_MAX) return null;

  const dockWidget = getDockWidgetByDockviewId(ctx.currentDockviewId);
  const scopeLabel = dockWidget?.label ?? ctx.currentDockviewId;
  const allPanels = ctx.panelRegistry.getPublicPanels
    ? ctx.panelRegistry.getPublicPanels()
    : ctx.panelRegistry.getAll();
  const panelMap = new Map(allPanels.map((p) => [p.id, p]));

  const children: MenuAction[] = [];
  for (const panelId of scopedIds) {
    if (panelId === ctx.currentDockviewId) continue;
    const panel = panelMap.get(panelId);
    if (!panel) continue;
    const allowMultiple = resolvePanelOpenPolicy(panel.id).allowMultiple;
    const { label, iconColor } = decoratePanelEntry(panel, getOpenIndicator(ctx, panel.id));
    children.push({
      id: `panel:add:default-scope:${panel.id}`,
      label,
      icon: panel.icon,
      iconColor,
      availableIn: ['background', 'tab', 'panel-content'],
      disabled: () => getPanelAddDisabledReason(ctx, panel.id, allowMultiple, !!api),
      execute: () => addPanel(ctx, panel.id, allowMultiple),
    });
  }

  if (children.length === 0) return null;

  return {
    id: `panel:add:defaults:${ctx.currentDockviewId}`,
    label: `Default Panels (${scopeLabel})`,
    icon: 'layout',
    availableIn: ['background', 'tab', 'panel-content'],
    children,
    execute: () => {},
  };
}

/**
 * All add panel actions
 */
export const addPanelActions: MenuAction[] = [
  addPanelAction,
];
