/**
 * ContextHub Connection Actions
 *
 * Allows users to connect panels/components by selecting a capability provider.
 */

import type { MenuAction, MenuActionContext } from "../types";
import {
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  CAP_PROMPT_BOX,
  useContextHubOverridesStore,
} from "@features/contextHub";
import type { CapabilityKey, CapabilityProvider } from "@features/contextHub";
import { getCapabilityDescriptor } from "@features/contextHub/descriptorRegistry";

const CONNECT_KEYS: CapabilityKey[] = [
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
];

const CAPABILITY_LABELS: Record<string, string> = {
  [CAP_PROMPT_BOX]: "Prompt Box",
  [CAP_ASSET_INPUT]: "Asset Input",
  [CAP_GENERATE_ACTION]: "Generate Action",
};

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

function getProviders(ctx: MenuActionContext, key: CapabilityKey): CapabilityProvider[] {
  const hub = ctx.contextHubState;
  if (!hub) return [];
  return hub.registry
    .getAll(key)
    .filter((provider) => (provider.isAvailable ? provider.isAvailable() : true));
}

function getPreferredProviderId(key: CapabilityKey): string | undefined {
  const overrides = useContextHubOverridesStore.getState().overrides;
  return overrides[key]?.preferredProviderId;
}

function resolveProvider(
  ctx: MenuActionContext,
  key: CapabilityKey,
  preferredProviderId?: string,
): CapabilityProvider | null {
  let current = ctx.contextHubState;
  if (!current) return null;

  if (preferredProviderId) {
    while (current) {
      const candidates = current.registry.getAll(key);
      const match = candidates.find((provider) => {
        if (!provider?.id || provider.id !== preferredProviderId) {
          return false;
        }
        if (provider.isAvailable && !provider.isAvailable()) {
          return false;
        }
        return true;
      });
      if (match) return match;
      current = current.parent;
    }
  }

  current = ctx.contextHubState;
  while (current) {
    const provider = current.registry.getBest(key);
    if (provider) return provider;
    current = current.parent;
  }
  return null;
}

function hasConnectOptions(ctx: MenuActionContext): boolean {
  return CONNECT_KEYS.some((key) => {
    const providers = getProviders(ctx, key);
    const preferredId = getPreferredProviderId(key);
    return providers.length > 1 || !!preferredId;
  });
}

function buildProviderActions(ctx: MenuActionContext, key: CapabilityKey): MenuAction[] {
  const providers = getProviders(ctx, key);
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

  const preferredId = getPreferredProviderId(key);
  const store = useContextHubOverridesStore.getState();

  const actions: MenuAction[] = [
    {
      id: `connect:${key}:auto`,
      label: preferredId ? "Auto (nearest)" : "Auto (current)",
      availableIn: ["panel-content", "tab"],
      disabled: () => (!preferredId ? "Already auto" : false),
      execute: () => store.clearOverride(key),
    },
  ];

  providers.forEach((provider, index) => {
    const providerId = provider.id;
    const baseLabel = provider.label || providerId || `Provider ${index + 1}`;
    const label = providerId && providerId === preferredId ? `${baseLabel} (forced)` : baseLabel;

    actions.push({
      id: `connect:${key}:${providerId ?? index}`,
      label,
      availableIn: ["panel-content", "tab"],
      disabled: () => (!providerId ? "Missing provider id" : false),
      execute: () => {
        if (providerId) {
          store.setPreferredProvider(key, providerId);
        }
      },
    });
  });

  return actions;
}

function getRegistryChain(ctx: MenuActionContext) {
  const chain: Array<{ label: string; registry: any }> = [];
  let current = ctx.contextHubState;
  let index = 0;
  while (current) {
    const label = current.hostId ? current.hostId : index === 0 ? "local" : `scope-${index}`;
    chain.push({ label, registry: current.registry });
    current = current.parent;
    index += 1;
  }
  return chain;
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
    const preferredId = getPreferredProviderId(key);
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
      label:
        getCapabilityDescriptor(key)?.label ??
        CAPABILITY_LABELS[key] ??
        formatCapabilityLabel(key),
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
    visible: (ctx) => !!ctx.contextHubState,
    children: (ctx) => buildCapabilityListActions(ctx),
    execute: () => {},
  },
  {
    id: "capability:connect",
    label: "Connect",
    icon: "link",
    category: "connect",
    availableIn: ["panel-content", "tab"],
    visible: (ctx) => !!ctx.contextHubState && hasConnectOptions(ctx),
    children: (ctx) => {
      const actions: MenuAction[] = [];

      CONNECT_KEYS.forEach((key) => {
        const providers = getProviders(ctx, key);
        const preferredId = getPreferredProviderId(key);
        if (providers.length <= 1 && !preferredId) {
          return;
        }

        actions.push({
          id: `connect:${key}`,
          label: CAPABILITY_LABELS[key] ?? key,
          availableIn: ["panel-content", "tab"],
          children: buildProviderActions(ctx, key),
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
