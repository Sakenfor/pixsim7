/**
 * ContextHub Connection Actions
 *
 * Allows users to connect panels/components by selecting a capability provider.
 *
 * NOTE: This file uses the LIVE STATE pattern (ctx.contextHubState) because it
 * needs to enumerate all providers, check availability, and support preferred
 * provider selection. See types.ts for capability access pattern documentation.
 */

import type { CapabilityKey, CapabilityProvider } from "@pixsim7/capabilities-core";

import { panelSelectors } from "@lib/plugins/catalogSelectors";

import { getCapabilityDescriptor, useContextHubOverridesStore } from "@features/contextHub";
import { getCapabilityKeys } from "@features/panels/lib/panelTypes";

import {
  getRegistryChain,
  getAllProviders,
  resolveProvider,
  hasLiveState,
} from "../capabilityHelpers";
import type { MenuAction, MenuActionContext } from "../types";

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

export const contextHubActions: MenuAction[] = [
  {
    id: "capability:inspect",
    label: "Capabilities",
    icon: "info",
    category: "zzz",
    divider: true,
    availableIn: ["panel-content", "tab"],
    visible: (ctx) => hasLiveState(ctx),
    children: (ctx) => buildCapabilityListActions(ctx),
    execute: () => {},
  },
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
