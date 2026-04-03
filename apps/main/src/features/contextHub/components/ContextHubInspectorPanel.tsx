import type {
  CapabilityKey,
  CapabilityProvider,
} from "@pixsim7/shared.capabilities.core";
import {
  EmptyState,
  Panel,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
} from "@pixsim7/shared.ui";
import { useMemo, useState } from "react";

import {
  getCapabilityDescriptor,
  useCapability,
  useContextHubState,
  useContextHubOverridesStore,
} from "@features/contextHub";

interface ProviderEntry {
  itemId: string;
  scope: string;
  provider: CapabilityProvider;
  label: string;
  available: boolean;
}

interface CapabilityEntry {
  key: CapabilityKey;
  label: string;
  description?: string;
  kind?: string;
  source?: string;
  preferredId?: string;
  providers: ProviderEntry[];
  providerGroups: ProviderGroupEntry[];
}

interface ProviderGroupEntry {
  itemId: string;
  scope: string;
  providerId?: string;
  label: string;
  instances: ProviderEntry[];
  total: number;
  availableCount: number;
  unavailableCount: number;
  uniqueProviderIds: string[];
}

type ProviderListMode = "grouped" | "raw";

function summarizeProvider(provider: CapabilityProvider) {
  if (provider.label) {
    return provider.label;
  }
  if (provider.id) {
    return provider.id;
  }
  return "anonymous";
}

function stringifyValue(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const raw = JSON.stringify(
      value,
      (_key, current) => {
        if (typeof current === "function") {
          return `[Function ${current.name || "anonymous"}]`;
        }
        if (current instanceof Map) {
          return {
            __type: "Map",
            entries: Array.from(current.entries()),
          };
        }
        if (current instanceof Set) {
          return {
            __type: "Set",
            values: Array.from(current.values()),
          };
        }
        if (current && typeof current === "object") {
          if (seen.has(current as object)) {
            return "[Circular]";
          }
          seen.add(current as object);
        }
        return current;
      },
      2,
    );

    if (!raw) {
      return "null";
    }
    if (raw.length <= 5000) {
      return raw;
    }
    return `${raw.slice(0, 5000)}\n...truncated`;
  } catch (error) {
    return String(error);
  }
}

export function ContextHubInspectorPanel() {
  const hub = useContextHubState();
  const overrides = useContextHubOverridesStore((state) => state.overrides);
  const setPreferredProvider = useContextHubOverridesStore(
    (state) => state.setPreferredProvider,
  );

  const registryChain = useMemo(() => {
    const chain: Array<{
      label: string;
      providersByKey: Record<CapabilityKey, CapabilityProvider[]>;
    }> = [];
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

  const capabilityEntries = useMemo<CapabilityEntry[]>(() => {
    return allKeys.map((key) => {
      const descriptor = getCapabilityDescriptor(key);
      const providers = registryChain.flatMap((scope) => {
        const scopeProviders = scope.providersByKey[key] ?? [];
        return scopeProviders.map((provider, index) => {
          const providerLabel = summarizeProvider(provider);
          const providerKey = provider.id ?? providerLabel;
          return {
            itemId: `${scope.label}::${providerKey}::${index}`,
            scope: scope.label,
            provider,
            label: providerLabel,
            available: provider.isAvailable ? provider.isAvailable() : true,
          };
        });
      });

      const groupedMap = new Map<string, ProviderEntry[]>();
      providers.forEach((providerEntry) => {
        const groupKey = `${providerEntry.scope}::${providerEntry.label}`;
        const current = groupedMap.get(groupKey);
        if (current) {
          current.push(providerEntry);
        } else {
          groupedMap.set(groupKey, [providerEntry]);
        }
      });

      const providerGroups: ProviderGroupEntry[] = Array.from(groupedMap.entries()).map(
        ([groupKey, instances]) => {
          const sample = instances[0];
          const availableCount = instances.filter((entry) => entry.available).length;
          const unavailableCount = instances.length - availableCount;
          const uniqueProviderIds = Array.from(
            new Set(
              instances
                .map((entry) => entry.provider.id)
                .filter((id): id is string => Boolean(id)),
            ),
          );
          return {
            itemId: `group::${groupKey}`,
            scope: sample.scope,
            providerId: sample.provider.id,
            label: sample.label,
            instances,
            total: instances.length,
            availableCount,
            unavailableCount,
            uniqueProviderIds,
          };
        },
      );

      return {
        key,
        label: descriptor?.label ?? key,
        description: descriptor?.description,
        kind: descriptor?.kind,
        source: descriptor?.source,
        preferredId: overrides[key]?.preferredProviderId,
        providers,
        providerGroups,
      };
    });
  }, [allKeys, registryChain, overrides]);

  const [providerListMode, setProviderListMode] = useState<ProviderListMode>("grouped");

  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    return capabilityEntries.map((entry) => ({
      id: entry.key,
      label:
        providerListMode === "grouped"
          ? `${entry.label} (${entry.providerGroups.length})`
          : `${entry.label} (${entry.providers.length})`,
      children:
        providerListMode === "grouped"
          ? entry.providerGroups.map((group) => ({
              id: group.itemId,
              label: group.label,
              extra: (
                <span className="text-neutral-500 dark:text-neutral-400">
                  {group.scope} - {group.total}x ({group.availableCount} ok, {group.unavailableCount} off)
                </span>
              ),
            }))
          : entry.providers.map((provider) => ({
              id: provider.itemId,
              label: provider.label,
              extra: (
                <span
                  className={
                    provider.available
                      ? "text-green-600 dark:text-green-400"
                      : "text-neutral-500 dark:text-neutral-400"
                  }
                >
                  {provider.scope} - {provider.available ? "available" : "unavailable"}
                </span>
              ),
            })),
    }));
  }, [capabilityEntries, providerListMode]);

  const nav = useSidebarNav({
    sections,
    storageKey: `context-hub-inspector:nav:${providerListMode}`,
    defaultAllExpanded: true,
  });

  const selectedCapability = useMemo(() => {
    if (capabilityEntries.length === 0) return null;
    return (
      capabilityEntries.find((entry) => entry.key === nav.activeSectionId) ??
      capabilityEntries[0]
    );
  }, [capabilityEntries, nav.activeSectionId]);

  const selectedCapabilityKey = (selectedCapability?.key ?? "__none__") as CapabilityKey;
  const { provider: activeProvider, value: activeValue } =
    useCapability(selectedCapabilityKey);

  const selectedProviderEntry = useMemo(() => {
    if (providerListMode !== "raw" || !selectedCapability || !nav.activeChildId) return null;
    return (
      selectedCapability.providers.find(
        (provider) => provider.itemId === nav.activeChildId,
      ) ?? null
    );
  }, [providerListMode, selectedCapability, nav.activeChildId]);

  const selectedProviderGroupEntry = useMemo(() => {
    if (providerListMode !== "grouped" || !selectedCapability || !nav.activeChildId) {
      return null;
    }
    return (
      selectedCapability.providerGroups.find(
        (group) => group.itemId === nav.activeChildId,
      ) ?? null
    );
  }, [providerListMode, selectedCapability, nav.activeChildId]);

  const detailProvider =
    selectedProviderEntry?.provider ??
    selectedProviderGroupEntry?.instances[0]?.provider ??
    activeProvider ??
    null;
  const detailValue = useMemo(() => {
    if (selectedProviderEntry?.provider) {
      try {
        return selectedProviderEntry.provider.getValue();
      } catch (error) {
        return {
          error: String(error),
        };
      }
    }
    if (selectedProviderGroupEntry?.instances[0]?.provider) {
      try {
        return selectedProviderGroupEntry.instances[0].provider.getValue();
      } catch (error) {
        return {
          error: String(error),
        };
      }
    }
    return activeValue;
  }, [selectedProviderEntry, selectedProviderGroupEntry, activeValue]);

  const detailValueText = useMemo(() => stringifyValue(detailValue), [detailValue]);
  const preferredProviderOptions = useMemo(() => {
    if (!selectedCapability) return [];
    const seen = new Set<string>();
    const options: Array<{ id: string; label: string; scope: string }> = [];
    selectedCapability.providers.forEach((entry) => {
      if (!entry.provider.id) return;
      if (seen.has(entry.provider.id)) return;
      seen.add(entry.provider.id);
      options.push({
        id: entry.provider.id,
        label: entry.label,
        scope: entry.scope,
      });
    });
    return options;
  }, [selectedCapability]);

  if (capabilityEntries.length === 0) {
    return (
      <Panel className="p-4" padded>
        <EmptyState message="No capabilities registered in this scope." size="sm" />
      </Panel>
    );
  }

  return (
    <Panel className="h-full min-h-0" padded={false}>
      <div className="h-full min-h-0 flex flex-col">
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Context Hub Inspector</h2>
              <p className="text-xs text-neutral-500">
                Browse capabilities on the left and inspect metadata/provider value details on the right.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className={`px-2 py-1 rounded border ${
                  providerListMode === "grouped"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
                }`}
                onClick={() => setProviderListMode("grouped")}
              >
                Grouped
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded border ${
                  providerListMode === "raw"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
                }`}
                onClick={() => setProviderListMode("raw")}
              >
                Raw
              </button>
            </div>
          </div>
        </div>

        <SidebarContentLayout
          sections={sections}
          activeSectionId={nav.activeSectionId}
          onSelectSection={nav.selectSection}
          activeChildId={nav.activeChildId}
          onSelectChild={nav.selectChild}
          expandedSectionIds={nav.expandedSectionIds}
          onToggleExpand={nav.toggleExpand}
          sidebarTitle="Capabilities"
          variant="light"
          collapsible
          resizable
          expandedWidth={260}
          persistKey="context-hub-inspector:sidebar"
          contentClassName="overflow-y-auto"
          className="flex-1 min-h-0"
        >
          {!selectedCapability ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState message="Select a capability from the sidebar." size="sm" />
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{selectedCapability.label}</div>
                    <div className="text-[11px] text-neutral-500">{selectedCapability.key}</div>
                  </div>
                  <div className="text-[11px] text-neutral-500 text-right">
                    <div>Kind: {selectedCapability.kind ?? "unknown"}</div>
                    <div>Source: {selectedCapability.source ?? "unknown"}</div>
                  </div>
                </div>
                {selectedCapability.description && (
                  <div className="text-xs text-neutral-500">
                    {selectedCapability.description}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-500">Preferred Provider</label>
                  <select
                    value={selectedCapability.preferredId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPreferredProvider(selectedCapability.key, value || undefined);
                    }}
                    className="text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900"
                  >
                    <option value="">Auto</option>
                    {preferredProviderOptions.map((entry) => (
                      <option
                        key={entry.id}
                        value={entry.id}
                      >
                        {entry.label} ({entry.scope})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Providers ({providerListMode})
                </div>
                {providerListMode === "grouped" && selectedCapability.providerGroups.length === 0 ? (
                  <EmptyState message="No providers registered for this capability." size="sm" />
                ) : providerListMode === "raw" && selectedCapability.providers.length === 0 ? (
                  <EmptyState message="No providers registered for this capability." size="sm" />
                ) : providerListMode === "grouped" ? (
                  <div className="space-y-1">
                    {selectedCapability.providerGroups.map((group) => {
                      const containsActiveProvider = group.instances.some(
                        (entry) => entry.provider === activeProvider,
                      );
                      const isFocusedGroup = selectedProviderGroupEntry?.itemId === group.itemId;
                      const availabilityLabel =
                        group.availableCount === group.total
                          ? "all available"
                          : group.availableCount === 0
                            ? "all unavailable"
                            : `${group.availableCount}/${group.total} available`;
                      return (
                        <button
                          type="button"
                          key={group.itemId}
                          onClick={() =>
                            nav.selectChild(selectedCapability.key, group.itemId)
                          }
                          className={`w-full text-left rounded border px-2 py-1.5 transition-colors ${
                            isFocusedGroup
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                              : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium truncate">
                              {group.label} ({group.total}x)
                              {containsActiveProvider ? " (active)" : ""}
                            </div>
                            <span
                              className={`text-[10px] ${
                                group.unavailableCount === 0
                                  ? "text-green-600 dark:text-green-400"
                                  : group.availableCount === 0
                                    ? "text-neutral-500 dark:text-neutral-400"
                                    : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {availabilityLabel}
                            </span>
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {group.scope} - {group.uniqueProviderIds.length} id variants
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selectedCapability.providers.map((entry) => {
                      const isActiveProvider = activeProvider === entry.provider;
                      const isFocusedProvider = selectedProviderEntry?.itemId === entry.itemId;
                      return (
                        <button
                          type="button"
                          key={entry.itemId}
                          onClick={() =>
                            nav.selectChild(selectedCapability.key, entry.itemId)
                          }
                          className={`w-full text-left rounded border px-2 py-1.5 transition-colors ${
                            isFocusedProvider
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                              : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium truncate">
                              {entry.label}
                              {isActiveProvider ? " (active)" : ""}
                            </div>
                            <span
                              className={`text-[10px] ${
                                entry.available
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-neutral-500 dark:text-neutral-400"
                              }`}
                            >
                              {entry.available ? "available" : "unavailable"}
                            </span>
                          </div>
                          <div className="text-[10px] text-neutral-500">{entry.scope}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Selected Detail
                </div>
                {providerListMode === "grouped" && selectedProviderGroupEntry && (
                  <div className="grid grid-cols-2 gap-2 text-xs rounded border border-neutral-200 dark:border-neutral-800 p-2 bg-neutral-50 dark:bg-neutral-900">
                    <div>
                      <div className="text-neutral-500">Group Scope</div>
                      <div>{selectedProviderGroupEntry.scope}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500">Provider ID</div>
                      <div className="font-mono text-[11px] break-all">
                        {selectedProviderGroupEntry.providerId ?? "none"}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-500">Instances</div>
                      <div>{selectedProviderGroupEntry.total}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500">Availability</div>
                      <div>
                        {selectedProviderGroupEntry.availableCount} available /{" "}
                        {selectedProviderGroupEntry.unavailableCount} unavailable
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-neutral-500">Provider ID Variants</div>
                      <div className="font-mono text-[11px] break-all">
                        {selectedProviderGroupEntry.uniqueProviderIds.length > 0
                          ? selectedProviderGroupEntry.uniqueProviderIds.slice(0, 6).join(", ")
                          : "none"}
                        {selectedProviderGroupEntry.uniqueProviderIds.length > 6
                          ? ` (+${selectedProviderGroupEntry.uniqueProviderIds.length - 6} more)`
                          : ""}
                      </div>
                    </div>
                  </div>
                )}
                {!detailProvider ? (
                  <EmptyState message="No active provider resolved for this capability." size="sm" />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-neutral-500">Label</div>
                        <div className="font-medium">{summarizeProvider(detailProvider)}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Provider ID</div>
                        <div className="font-mono text-[11px] break-all">
                          {detailProvider.id ?? "none"}
                        </div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Priority</div>
                        <div>{detailProvider.priority ?? 0}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Expose To Menu</div>
                        <div>{detailProvider.exposeToContextMenu ? "yes" : "no"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Value Snapshot</div>
                      <pre className="text-[11px] bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 p-2 overflow-auto max-h-80 whitespace-pre-wrap break-words">
                        {detailValueText}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </SidebarContentLayout>
      </div>
    </Panel>
  );
}
