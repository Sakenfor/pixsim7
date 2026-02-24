/**
 * ContextHub Connection Actions
 *
 * Allows users to connect panels/components by selecting a capability provider.
 *
 * NOTE: This file uses the LIVE STATE pattern (ctx.contextHubState) because it
 * needs to enumerate all providers, check availability, and support preferred
 * provider selection. See types.ts for capability access pattern documentation.
 */

import type { CapabilityKey, CapabilityProvider } from "@pixsim7/shared.capabilities.core";
import { getCapabilityKeys } from "@pixsim7/shared.ui.panels";

import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { getCapabilityDescriptor, useContextHubOverridesStore } from "@features/contextHub";
import { getDockWidgetByDockviewId } from "@features/panels";
import { CATEGORY_LABELS } from "@features/panels/lib/panelConstants";
import { resolveSiblings } from "@features/panels/lib/siblingResolution";
import { panelPlacementCoordinator } from "@features/workspace/lib/panelPlacementCoordinator";

import {
  getRegistryChain,
  getAllProviders,
  resolveProvider,
  hasLiveState,
} from "../capabilityHelpers";
import { resolveCurrentDockview } from "../resolveCurrentDockview";
import type { MenuAction, MenuActionContext } from "../types";

import { addPanelInCurrentDockview, isPanelOpenInCurrentDockview } from "./panelOpenUtils";

/**
 * Get a human-readable label for a capability key.
 * Resolution order:
 * 1. Descriptor registry label (preferred - registered at capability definition)
 * 2. Auto-formatted from key (fallback for unregistered capabilities)
 */
function getCapabilityLabel(key: CapabilityKey): string {
  return getCapabilityDescriptor(key)?.label ?? formatCapabilityLabel(key);
}

function formatCapabilityLabel(key: string): string {
  return key
    .replace(/[:/]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeProvider(provider: CapabilityProvider) {
  if (provider.label) return provider.label;
  if (provider.id) return provider.id;
  return "anonymous";
}

type CapabilityUsage = {
  key: CapabilityKey;
  source: "consumed" | "declared";
};

function getPreferredProviderId(
  key: CapabilityKey,
  hostId?: string,
): string | undefined {
  const store = useContextHubOverridesStore.getState();
  return store.getPreferredProviderId(key, hostId);
}

function resolvePanelDefinitionId(ctx: MenuActionContext): string | undefined {
  const candidates = [
    ctx.panelId,
    typeof ctx.data?.panelId === "string" ? ctx.data.panelId : undefined,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (panelSelectors.get(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getDeclaredCapabilities(ctx: MenuActionContext): CapabilityKey[] {
  const panelId = resolvePanelDefinitionId(ctx);
  if (!panelId) return [];
  const definition = panelSelectors.get(panelId);
  return getCapabilityKeys(definition?.consumesCapabilities);
}

function getPanelCapabilityUsage(ctx: MenuActionContext): CapabilityUsage[] {
  const hostId = ctx.instanceId;
  const hub = ctx.contextHubState;
  const consumedKeys = new Set<CapabilityKey>();

  if (hostId && hub) {
    let root = hub;
    while (root.parent) {
      root = root.parent;
    }
    root.registry.getConsumptionForHost(hostId).forEach((record) => {
      consumedKeys.add(record.key);
    });
  }

  const declaredKeys = new Set(getDeclaredCapabilities(ctx));

  const ordered: CapabilityUsage[] = [];
  consumedKeys.forEach((key) => ordered.push({ key, source: "consumed" }));
  declaredKeys.forEach((key) => {
    if (!consumedKeys.has(key)) {
      ordered.push({ key, source: "declared" });
    }
  });

  return ordered;
}

function buildProviderActions(
  ctx: MenuActionContext,
  key: CapabilityKey,
  usageSource: CapabilityUsage["source"],
): MenuAction[] {
  const providers = getAllProviders(ctx, key);
  if (providers.length === 0) {
    return [
      {
        id: `connect:${key}:none`,
        label: "No providers available",
        availableIn: ["panel-content", "tab"],
        disabled: () => true,
        execute: () => {},
      },
    ];
  }

  const preferredId = getPreferredProviderId(key, ctx.instanceId);
  const store = useContextHubOverridesStore.getState();

  const actions: MenuAction[] = [];

  if (usageSource === "declared") {
    actions.push({
      id: `connect:${key}:inactive`,
      label: "Not active in this mode",
      availableIn: ["panel-content", "tab"],
      disabled: () => true,
      execute: () => {},
    });
  }

  actions.push(
    {
      id: `connect:${key}:auto`,
      label: preferredId ? "Auto (nearest)" : "Auto (current)",
      availableIn: ["panel-content", "tab"],
      disabled: () => (!preferredId ? "Already auto" : false),
      execute: () => store.clearOverride(key, ctx.instanceId),
    },
  );

  providers.forEach((entry, index) => {
    const providerId = entry.provider.id;
    const baseLabel = entry.provider.label || providerId || `Provider ${index + 1}`;
    const label =
      providerId && providerId === preferredId
        ? `${entry.scope} - ${baseLabel} (forced)`
        : `${entry.scope} - ${baseLabel}`;

    actions.push({
      id: `connect:${key}:${providerId ?? index}`,
      label,
      availableIn: ["panel-content", "tab"],
      disabled: () => {
        if (!providerId) return "Missing provider id";
        if (!entry.available) return "Unavailable";
        return false;
      },
      execute: () => {
        if (providerId) {
          store.setPreferredProvider(key, providerId, ctx.instanceId);
        }
      },
    });
  });

  return actions;
}

// Kept for potential dedicated inspector menu/panel reuse.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildCapabilityListActions(ctx: MenuActionContext): MenuAction[] {
  const chain = getRegistryChain(ctx);
  if (chain.length === 0) {
    return [
      {
        id: "capabilities:none",
        label: "No capabilities available",
        availableIn: ["panel-content", "tab"],
        disabled: () => true,
        execute: () => {},
      },
    ];
  }

  const keySet = new Set<CapabilityKey>();
  chain.forEach((scope) => {
    scope.registry.getKeys().forEach((key: CapabilityKey) => keySet.add(key));
  });
  const keys = Array.from(keySet).sort();

  return keys.map((key) => {
    const preferredId = getPreferredProviderId(key, ctx.instanceId);
    const activeProvider = resolveProvider(ctx, key, preferredId);
    const activeLabel = activeProvider ? summarizeProvider(activeProvider) : "none";
    const providers = chain.flatMap((scope) =>
      scope.registry.getAll(key).map((provider: CapabilityProvider) => ({
        scope: scope.label,
        provider,
      })),
    );

    const children: MenuAction[] = [
      {
        id: `capabilities:${key}:active`,
        label: `Active: ${activeLabel}`,
        availableIn: ["panel-content", "tab"],
        disabled: () => true,
        divider: providers.length > 0,
        execute: () => {},
      },
    ];

    if (providers.length === 0) {
      children.push({
        id: `capabilities:${key}:empty`,
        label: "No providers registered",
        availableIn: ["panel-content", "tab"],
        disabled: () => true,
        execute: () => {},
      });
    } else {
      providers.forEach(({ scope, provider }, index) => {
        const available = provider.isAvailable ? provider.isAvailable() : true;
        const isActive = provider === activeProvider;
        const isPreferred = provider.id && provider.id === preferredId;
        const suffix = [
          isActive ? "active" : null,
          isPreferred ? "preferred" : null,
          provider.priority !== undefined ? `priority ${provider.priority}` : null,
        ]
          .filter(Boolean)
          .join(", ");

        children.push({
          id: `capabilities:${key}:${provider.id ?? index}`,
          label: `${scope} - ${summarizeProvider(provider)}${suffix ? ` (${suffix})` : ""}`,
          availableIn: ["panel-content", "tab"],
          disabled: () => (available ? true : "Unavailable"),
          execute: () => {},
        });
      });
    }

    return {
      id: `capabilities:${key}`,
      label: getCapabilityLabel(key),
      availableIn: ["panel-content", "tab"],
      children,
      execute: () => {},
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Related Panels (capability-based discovery)
// ─────────────────────────────────────────────────────────────────────────────

interface RelatedPanelCandidate {
  id: string;
  title: string;
  icon?: string;
  category?: string;
}

/**
 * Find panels related to the current one by capability overlap.
 *
 * A panel is "related" if:
 * - It provides capabilities that the current panel consumes, OR
 * - It consumes capabilities that the current panel provides
 *
 * Falls back to static siblings if no capability matches are found.
 */
function resolveRelatedPanels(ctx: MenuActionContext): RelatedPanelCandidate[] {
  const panelDefId = resolvePanelDefinitionId(ctx);
  if (!panelDefId) return [];

  const currentDef = panelSelectors.get(panelDefId);
  if (!currentDef) return [];

  // 1. Gather consumed capability keys (runtime + declared)
  const consumedKeys = new Set<string>();
  const hostId = ctx.instanceId;
  if (hostId && ctx.contextHubState) {
    let root = ctx.contextHubState;
    while (root.parent) root = root.parent;
    for (const rec of root.registry.getConsumptionForHost(hostId)) {
      consumedKeys.add(rec.key);
    }
  }
  for (const key of getCapabilityKeys(currentDef.consumesCapabilities)) {
    consumedKeys.add(key);
  }

  // 2. Gather provided capability keys
  const providedKeys = new Set(
    getCapabilityKeys(currentDef.providesCapabilities),
  );

  // 3. Find panels whose provides overlap our consumes, or whose consumes overlap our provides
  const allPanels = panelSelectors.getPublicPanels();
  const matches = new Map<string, RelatedPanelCandidate>();

  for (const panel of allPanels) {
    if (panel.id === panelDefId || panel.isInternal) continue;

    const theirProvides = new Set(
      getCapabilityKeys(panel.providesCapabilities),
    );
    const theirConsumes = new Set(
      getCapabilityKeys(panel.consumesCapabilities),
    );

    const providesMatch = [...consumedKeys].some((k) => theirProvides.has(k));
    const consumesMatch = [...providedKeys].some((k) => theirConsumes.has(k));

    if (providesMatch || consumesMatch) {
      matches.set(panel.id, {
        id: panel.id,
        title: panel.title,
        icon: panel.icon,
        category: panel.category,
      });
    }
  }

  // 4. Fallback to static siblings if no capability matches
  if (matches.size === 0) {
    return resolveSiblings(panelDefId, allPanels);
  }

  return Array.from(matches.values());
}

/**
 * Check if a single-instance panel is already open.
 * Returns a disabled reason string, or false if it can be opened.
 */
/**
 * Open a related panel in the same group as the current panel.
 */
function openRelatedPanel(ctx: MenuActionContext, panelId: string) {
  const { api } = resolveCurrentDockview(ctx);
  if (!api) return;
  const def = panelSelectors.get(panelId);
  const allowMultiple = !!def?.supportsMultipleInstances;
  const title = def?.title ?? panelId;

  addPanelInCurrentDockview(ctx, panelId, {
    allowMultiple,
    title,
    position: ctx.panelId
      ? { direction: "within", referencePanel: ctx.panelId }
      : undefined,
  });
}

function formatDockviewIdLabel(dockviewId: string): string {
  return dockviewId
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveDockviewLabel(dockviewId: string): string {
  return getDockWidgetByDockviewId(dockviewId)?.label
    ?? formatDockviewIdLabel(dockviewId)
    ?? dockviewId;
}

function focusPanelInDockview(ctx: MenuActionContext, dockviewId: string, panelId: string): boolean {
  const host = ctx.getDockviewHost?.(dockviewId);
  if (host?.focusPanel(panelId)) {
    return true;
  }

  const api = ctx.getDockviewApi?.(dockviewId) ?? (dockviewId === ctx.currentDockviewId ? ctx.api : undefined);
  const panel = (api as any)?.getPanel?.(panelId);
  if (panel?.api?.setActive) {
    panel.api.setActive();
    return true;
  }
  return false;
}

function buildRelatedPanelItemActions(ctx: MenuActionContext, panel: RelatedPanelCandidate): MenuAction[] {
  const def = panelSelectors.get(panel.id);
  const allowMultiple = !!def?.supportsMultipleInstances;
  const placements = panelPlacementCoordinator.getPlacements(panel.id);
  const currentDockId = ctx.currentDockviewId;
  const currentDockOpen = currentDockId
    ? placements.some((p) => p.kind === "docked" && p.dockviewId === currentDockId)
    : isPanelOpenInCurrentDockview(ctx, panel.id, false);
  const otherDockPlacements = placements.filter(
    (p): p is { kind: "docked"; dockviewId: string } =>
      p.kind === "docked" && p.dockviewId !== currentDockId
  );
  const isFloating = placements.some((p) => p.kind === "floating");

  const actions: MenuAction[] = [];

  if (currentDockOpen) {
    actions.push({
      id: `connect:related:${panel.id}:focus-here`,
      label: "Focus Here",
      icon: "target",
      availableIn: ["panel-content", "tab"],
      execute: () => {
        if (!currentDockId) return;
        focusPanelInDockview(ctx, currentDockId, panel.id);
      },
    });
  }

  actions.push({
    id: `connect:related:${panel.id}:add-here`,
    label: "Add Here",
    icon: "plus-circle",
    availableIn: ["panel-content", "tab"],
    disabled: () =>
      allowMultiple
        ? false
        : isPanelOpenInCurrentDockview(ctx, panel.id, false) ? "Already open here" : false,
    execute: () => openRelatedPanel(ctx, panel.id),
  });

  if (isFloating) {
    actions.push({
      id: `connect:related:${panel.id}:focus-floating`,
      label: "Bring Floating To Front",
      icon: "external-link",
      availableIn: ["panel-content", "tab"],
      execute: () => {
        panelPlacementCoordinator.bringFloatingPanelDefinitionToFront(panel.id);
      },
    });
  }

  for (const placement of otherDockPlacements) {
    actions.push({
      id: `connect:related:${panel.id}:focus-dock:${placement.dockviewId}`,
      label: `Focus in ${resolveDockviewLabel(placement.dockviewId)}`,
      icon: "layout",
      availableIn: ["panel-content", "tab"],
      execute: () => {
        focusPanelInDockview(ctx, placement.dockviewId, panel.id);
      },
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: `connect:related:${panel.id}:none`,
      label: "No actions available",
      availableIn: ["panel-content", "tab"],
      disabled: () => true,
      execute: () => {},
    });
  }

  return actions;
}

function buildRelatedPanelMenuItem(ctx: MenuActionContext, p: RelatedPanelCandidate): MenuAction {
  const placements = panelPlacementCoordinator.getPlacements(p.id);
  const currentDockId = ctx.currentDockviewId;
  const status =
    placements.some((x) => x.kind === "docked" && x.dockviewId === currentDockId)
      ? "open here"
      : placements.some((x) => x.kind === "floating")
        ? "floating"
        : placements.find((x): x is { kind: "docked"; dockviewId: string } => x.kind === "docked")
          ? `open in ${resolveDockviewLabel(
              (placements.find((x): x is { kind: "docked"; dockviewId: string } => x.kind === "docked")!).dockviewId
            )}`
          : null;

  return {
    id: `connect:related:${p.id}`,
    label: status ? `${p.title} (${status})` : p.title,
    icon: p.icon,
    availableIn: ["panel-content", "tab"],
    children: buildRelatedPanelItemActions(ctx, p),
    execute: () => {},
  };
}

/**
 * Build the "Related Panels" submenu actions from capability-matched panels.
 */
function buildRelatedPanelActions(ctx: MenuActionContext): MenuAction[] | null {
  const related = resolveRelatedPanels(ctx);
  if (related.length === 0) return null;

  // Group by category
  const byCategory = new Map<string, RelatedPanelCandidate[]>();
  for (const panel of related) {
    const cat = panel.category ?? "other";
    const list = byCategory.get(cat) ?? [];
    list.push(panel);
    byCategory.set(cat, list);
  }

  const relatedActions: MenuAction[] = [];

  if (byCategory.size > 1) {
    // Use category submenus when multiple categories
    for (const [category, panels] of byCategory) {
      relatedActions.push({
        id: `connect:related:${category}`,
        label:
          CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
        availableIn: ["panel-content", "tab"],
        children: panels.map((p) => ({
          ...buildRelatedPanelMenuItem(ctx, p),
          availableIn: ["panel-content", "tab"] as const,
        })),
        execute: () => {},
      });
    }
  } else {
    // Flat list when single category
    for (const panels of byCategory.values()) {
      for (const p of panels) {
        relatedActions.push({
          ...buildRelatedPanelMenuItem(ctx, p),
          availableIn: ["panel-content", "tab"],
        });
      }
    }
  }

  return relatedActions;
}

export const contextHubActions: MenuAction[] = [
  {
    id: "capability:connect",
    label: "Connect",
    icon: "link",
    category: "connect",
    availableIn: ["panel-content", "tab"],
    visible: (ctx) => hasLiveState(ctx),
    children: (ctx) => {
      const usage = getPanelCapabilityUsage(ctx);
      const actions: MenuAction[] = [];

      usage.forEach(({ key, source }) => {
        actions.push({
          id: `connect:${key}`,
          label: getCapabilityLabel(key),
          availableIn: ["panel-content", "tab"],
          children: buildProviderActions(ctx, key, source),
          execute: () => {},
        });
      });

      // Related Panels section
      const relatedActions = buildRelatedPanelActions(ctx);
      if (relatedActions && relatedActions.length > 0) {
        actions.push({
          id: "connect:related",
          label: "Related Panels",
          icon: "plus-circle",
          divider: true,
          sectionLabel: "Add",
          availableIn: ["panel-content", "tab"],
          children: relatedActions,
          execute: () => {},
        });
      }

      if (actions.length === 0) {
        return [
          {
            id: "connect:none",
            label: "No connections available",
            availableIn: ["panel-content", "tab"],
            disabled: () => true,
            execute: () => {},
          },
        ];
      }

      return actions;
    },
    execute: () => {},
  },
];
