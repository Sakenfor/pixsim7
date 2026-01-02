import { Panel } from "@pixsim7/shared.ui";
import { useMemo } from "react";

import {
  getCapabilityDescriptor,
  useCapability,
  useContextHubState,
  useContextHubOverridesStore,
  type CapabilityKey,
  type CapabilityProvider,
} from "@features/contextHub";

function summarizeProvider(provider: CapabilityProvider) {
  if (provider.label) {
    return provider.label;
  }
  if (provider.id) {
    return provider.id;
  }
  return "anonymous";
}

interface CapabilityRowProps {
  capabilityKey: CapabilityKey;
  preferredId?: string;
  providers: { scope: string; provider: CapabilityProvider }[];
  onPreferredChange: (value?: string) => void;
}

function CapabilityRow({
  capabilityKey,
  preferredId,
  providers,
  onPreferredChange,
}: CapabilityRowProps) {
  const { provider: activeProvider } = useCapability(capabilityKey);
  const descriptor = getCapabilityDescriptor(capabilityKey);

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            {descriptor?.label ?? capabilityKey}
          </div>
          <div className="text-[11px] text-neutral-500">
            Active: {activeProvider ? summarizeProvider(activeProvider) : "none"}
          </div>
          {descriptor?.description && (
            <div className="text-[10px] text-neutral-400">
              {descriptor.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-neutral-500">Preferred</label>
          <select
            value={preferredId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onPreferredChange(value || undefined);
            }}
            className="text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
          >
            <option value="">Auto</option>
            {providers.map(({ provider }) => (
              <option
                key={provider.id ?? summarizeProvider(provider)}
                value={provider.id ?? ""}
                disabled={!provider.id}
              >
                {summarizeProvider(provider)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {providers.length === 0 ? (
        <div className="text-xs text-neutral-500">
          No providers registered for this capability.
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          {providers.map(({ scope, provider }) => {
            const available =
              provider.isAvailable ? provider.isAvailable() : true;
            const isActive = provider === activeProvider;
            return (
              <div
                key={`${scope}-${provider.id ?? summarizeProvider(provider)}`}
                className="flex items-center justify-between rounded bg-neutral-50 dark:bg-neutral-900 px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase text-neutral-400">
                    {scope}
                  </span>
                  <span className={isActive ? "font-semibold" : undefined}>
                    {summarizeProvider(provider)}
                  </span>
                  {provider.priority !== undefined && (
                    <span className="text-[10px] text-neutral-500">
                      priority {provider.priority}
                    </span>
                  )}
                </div>
                <span
                  className={
                    available
                      ? "text-[10px] text-green-600"
                      : "text-[10px] text-neutral-400"
                  }
                >
                  {available ? "available" : "unavailable"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ContextHubInspectorPanel() {
  const hub = useContextHubState();
  const overrides = useContextHubOverridesStore((state) => state.overrides);
  const setPreferredProvider = useContextHubOverridesStore(
    (state) => state.setPreferredProvider,
  );

  const registryChain = useMemo(() => {
    const chain = [];
    let current = hub;
    let index = 0;
    while (current) {
      const label = current.hostId
        ? current.hostId
        : index === 0
          ? "local"
          : `scope-${index}`;
      const providersByKey: Record<CapabilityKey, CapabilityProvider[]> = {};
      for (const key of current.registry.getKeys()) {
        providersByKey[key] = current.registry.getAll(key);
      }
      chain.push({ label, providersByKey });
      current = current.parent;
      index += 1;
    }
    return chain;
  }, [hub]);

  const allKeys = useMemo(() => {
    const keys = new Set<CapabilityKey>();
    registryChain.forEach((scope) => {
      Object.keys(scope.providersByKey).forEach((key) =>
        keys.add(key as CapabilityKey),
      );
    });
    return Array.from(keys).sort();
  }, [registryChain]);

  return (
    <Panel className="p-4 space-y-4" padded>
      <div>
        <h2 className="text-base font-semibold">Context Hub Inspector</h2>
        <p className="text-xs text-neutral-500">
          Inspect active capability providers and override preferred sources.
        </p>
      </div>

      {allKeys.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No capabilities registered in this scope.
        </div>
      ) : (
        <div className="space-y-4">
          {allKeys.map((key) => {
            const preferredId = overrides[key]?.preferredProviderId;
            const providers = registryChain.flatMap((scope) =>
              scope.providersByKey[key]
                ? scope.providersByKey[key].map((provider) => ({
                    scope: scope.label,
                    provider,
                  }))
                : [],
            );

            return (
              <CapabilityRow
                key={key}
                capabilityKey={key}
                preferredId={preferredId}
                providers={providers}
                onPreferredChange={(value) => setPreferredProvider(key, value)}
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
}
