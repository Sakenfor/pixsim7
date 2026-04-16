import type { SubNavItem } from '@pixsim7/shared.modules.core';

import type { PanelDefinition } from '@features/panels';

type PageEntry = {
  id: string;
  name: string;
  route: string;
  icon: string;
  category: string;
  featureId?: string;
  featured?: boolean;
  subNav?: SubNavItem[] | (() => SubNavItem[]);
};

interface BuildSubNavOptions {
  page: PageEntry;
  allPages: PageEntry[];
  panels: PanelDefinition[];
  openPanelIds: string[];
  recentPanelIds: string[];
  pinnedPanelIds: string[];
  maxItems?: number;
}

interface PageNavHints {
  panelIds?: string[];
  routePageIds?: string[];
  featureTagHints?: string[];
  maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 5;
const MAX_ROUTE_ITEMS = 2;

const PAGE_NAV_HINTS: Record<string, PageNavHints> = {
  'interaction-demo': {
    panelIds: ['dev-tools', 'health'],
    routePageIds: ['gizmo-lab'],
    featureTagHints: ['dev', 'debug', 'diagnostics', 'tools', 'interaction'],
  },
  workspace: {
    panelIds: ['scene-management', 'inspector'],
    routePageIds: ['arc-graph', 'routine-graph-page', 'interaction-studio'],
    featureTagHints: ['scene', 'workspace', 'editor'],
  },
  'generation-page': {
    panelIds: ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks', 'providers'],
    featureTagHints: ['generation', 'quickgen'],
  },
  automation: {
    panelIds: ['automation', 'template-library', 'template-builder'],
    featureTagHints: ['automation', 'template'],
  },
  game: {
    panelIds: ['game-world', 'npc-brain-lab', 'npc-portraits', 'game-theming', 'world-context', 'world-visual-roles'],
    routePageIds: ['npc-brain-lab', 'npcs'],
    featureTagHints: ['game', 'world', 'npc'],
  },
  'game-2d': {
    panelIds: ['game', 'hud-designer', 'edge-effects'],
    routePageIds: ['game'],
    featureTagHints: ['game', 'hud', 'interactive'],
  },
  'arc-graph': {
    panelIds: ['arc-graph', 'routine-graph', 'scene-management'],
    routePageIds: ['routine-graph-page', 'workspace'],
    featureTagHints: ['graph', 'arc', 'narrative'],
  },
  'routine-graph-page': {
    panelIds: ['routine-graph', 'arc-graph', 'npc-brain-lab'],
    routePageIds: ['arc-graph', 'workspace'],
    featureTagHints: ['routine', 'npc', 'graph'],
  },
  'interaction-studio': {
    panelIds: ['interaction-studio', 'npc-brain-lab', 'npc-portraits', 'game-world'],
    routePageIds: ['npc-brain-lab', 'npcs'],
    featureTagHints: ['interaction', 'npc', 'game'],
  },
  'npc-brain-lab': {
    panelIds: ['npc-brain-lab', 'npc-portraits', 'interaction-studio', 'game-world'],
    routePageIds: ['interaction-studio', 'npcs'],
    featureTagHints: ['npc', 'brain', 'behavior'],
  },
  npcs: {
    panelIds: ['npc-portraits', 'npc-brain-lab', 'interaction-studio', 'game-world'],
    routePageIds: ['npc-brain-lab', 'interaction-studio'],
    featureTagHints: ['npc', 'portrait', 'expression'],
  },
};

const FEATURE_TAG_HINTS: Record<string, string[]> = {
  generation: ['generation', 'quickgen'],
  automation: ['automation', 'template'],
  game: ['game', 'world', 'npc', 'hud', 'interaction'],
  workspace: ['scene', 'workspace'],
  graph: ['graph', 'arc'],
  'routine-graph': ['routine', 'graph'],
  interactions: ['interaction', 'npc'],
};

export function buildSubNavForPage(options: BuildSubNavOptions): SubNavItem[] | undefined {
  const {
    page,
    allPages,
    panels,
    openPanelIds,
    recentPanelIds,
    pinnedPanelIds,
  } = options;
  const maxItems = options.maxItems ?? PAGE_NAV_HINTS[page.id]?.maxItems ?? DEFAULT_MAX_ITEMS;

  const manualItems = resolveManualSubNav(page.subNav);
  if (manualItems.length > 0) {
    return manualItems;
  }

  const defaultItem: SubNavItem = {
    id: `${page.id}:home`,
    label: page.name,
    icon: page.icon,
  };

  const routeItems = buildRouteItems(page, allPages);
  const panelItems = buildPanelItems({
    page,
    panels,
    openPanelIds,
    recentPanelIds,
    pinnedPanelIds,
    maxItems: Math.max(0, maxItems - 1 - routeItems.length),
  });

  // If any panel item already covers the default (same label + icon),
  // drop the default — the panel item is strictly more informative
  // (carries open-preference chip + modifier-click semantics).
  const panelCoversDefault = panelItems.some(
    (item) => item.label === defaultItem.label && item.icon === defaultItem.icon,
  );
  const base = panelCoversDefault ? [] : [defaultItem];

  const merged = dedupeItems([...base, ...routeItems, ...panelItems]);
  // Show the flyout when there's more than one entry, or when the only
  // entry is an actionable panel/route item (not just the default stub).
  const hasActionableItem = merged.some((item) => item.id !== defaultItem.id);
  return merged.length > 1 || hasActionableItem ? merged : undefined;
}

function resolveManualSubNav(subNav: PageEntry['subNav']): SubNavItem[] {
  if (!subNav) {
    return [];
  }
  try {
    return (typeof subNav === 'function' ? subNav() : subNav) ?? [];
  } catch (error) {
    console.warn('[subNavBuilder] Failed to resolve manual subNav:', error);
    return [];
  }
}

function buildRouteItems(page: PageEntry, allPages: PageEntry[]): SubNavItem[] {
  const hints = PAGE_NAV_HINTS[page.id];
  const explicitRouteItems: SubNavItem[] = [];

  for (const routePageId of hints?.routePageIds ?? []) {
    const target = allPages.find((p) => p.id === routePageId);
    if (!target || target.route === page.route || !isConcreteRoute(target.route)) {
      continue;
    }
    explicitRouteItems.push({
      id: `route:${target.id}`,
      label: target.name,
      icon: target.icon,
      route: target.route,
    });
  }

  const siblingRouteItems = allPages
    .filter((candidate) => {
      if (candidate.id === page.id) return false;
      if (!page.featureId || candidate.featureId !== page.featureId) return false;
      if (!isConcreteRoute(candidate.route)) return false;
      return true;
    })
    .sort((a, b) => {
      const aScore = (a.featured ? 10 : 0) + (a.id === page.id ? -100 : 0);
      const bScore = (b.featured ? 10 : 0) + (b.id === page.id ? -100 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return a.name.localeCompare(b.name);
    })
    .map((candidate) => ({
      id: `route:${candidate.id}`,
      label: candidate.name,
      icon: candidate.icon,
      route: candidate.route,
    }));

  const routeItems = dedupeItems([...explicitRouteItems, ...siblingRouteItems]);
  return routeItems.slice(0, MAX_ROUTE_ITEMS);
}

function buildPanelItems(options: {
  page: PageEntry;
  panels: PanelDefinition[];
  openPanelIds: string[];
  recentPanelIds: string[];
  pinnedPanelIds: string[];
  maxItems: number;
}): SubNavItem[] {
  const { page, panels, openPanelIds, recentPanelIds, pinnedPanelIds, maxItems } = options;
  if (maxItems <= 0) {
    return [];
  }

  const routeSlug = normalizeRouteSlug(page.route);
  const hints = PAGE_NAV_HINTS[page.id];
  const panelIdsFromHints = hints?.panelIds ?? [];
  const featureTagHints = new Set<string>([
    ...(hints?.featureTagHints ?? []),
    ...(page.featureId ? FEATURE_TAG_HINTS[page.featureId] ?? [] : []),
  ]);

  const openSet = new Set(openPanelIds);
  const pinnedSet = new Set(pinnedPanelIds);
  const recentBoost = new Map<string, number>();
  recentPanelIds.forEach((panelId, index) => recentBoost.set(panelId, Math.max(1, 25 - index)));

  const ranked = new Map<string, { panel: PanelDefinition; score: number }>();

  function consider(panel: PanelDefinition, score: number) {
    if (!isWorkspacePanel(panel)) return;
    const existing = ranked.get(panel.id);
    if (!existing || score > existing.score) {
      ranked.set(panel.id, { panel, score });
    }
  }

  for (const panel of panels) {
    const nav = panel.navigation;
    if (nav?.hidden) continue;

    const isExplicitlyContributed =
      (nav?.modules?.includes(page.id) ?? false) ||
      (nav?.routes?.includes(page.route) ?? false) ||
      (!!page.featureId && (nav?.featureIds?.includes(page.featureId) ?? false));

    if (isExplicitlyContributed) {
      const order = nav?.order ?? panel.order ?? 100;
      consider(panel, 1000 - order);
    }
  }

  panelIdsFromHints.forEach((panelId, index) => {
    const panel = panels.find((candidate) => candidate.id === panelId);
    if (!panel) return;
    consider(panel, 900 - index * 10);
  });

  for (const panel of panels) {
    if (panel.id === routeSlug) {
      consider(panel, 840);
    }

    const matchingTags = (panel.tags ?? []).filter((tag) => featureTagHints.has(tag)).length;
    if (matchingTags > 0) {
      consider(panel, 700 + matchingTags * 4);
    }
  }

  for (const [panelId, entry] of ranked.entries()) {
    let score = entry.score;
    if (openSet.has(panelId)) score += 150;
    if (pinnedSet.has(panelId)) score += 75;
    score += recentBoost.get(panelId) ?? 0;
    ranked.set(panelId, { panel: entry.panel, score });
  }

  const ordered = Array.from(ranked.values())
    .sort((a, b) => b.score - a.score)
    .map(({ panel }) => panel);

  return ordered.slice(0, maxItems).map((panel) => ({
    id: `panel:${panel.id}`,
    label: panel.navigation?.label ?? panel.title,
    icon: panel.navigation?.icon ?? panel.icon ?? 'layoutGrid',
    route: panel.navigation?.openRoute ?? `/workspace?openPanel=${encodeURIComponent(panel.id)}`,
  }));
}

function dedupeItems(items: SubNavItem[]): SubNavItem[] {
  const seen = new Set<string>();
  const deduped: SubNavItem[] = [];

  for (const item of items) {
    const key = toItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function toItemKey(item: SubNavItem): string {
  if (item.route) return `route:${item.route}`;
  if (item.param) return `param:${item.param.key}=${item.param.value}`;
  return 'default';
}

function normalizeRouteSlug(route: string): string {
  return route.replace(/^\//, '').split('?')[0].split('/')[0];
}

function isConcreteRoute(route: string): boolean {
  return route.length > 1 && !route.includes(':');
}

function isWorkspacePanel(panel: PanelDefinition): boolean {
  if (panel.isInternal) {
    return false;
  }
  const docks = panel.availability?.docks ?? panel.availableIn;
  if (!docks || docks.length === 0) {
    return true;
  }
  return docks.includes('workspace');
}
