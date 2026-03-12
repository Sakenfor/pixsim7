/**
 * Panel Groups Workbench
 *
 * Runtime controls for applying registered panel-group presets to dock widgets.
 * Group authoring (defining slots/presets/layout logic) remains code-defined.
 */

import type { DockviewApi } from "dockview-core";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getDockviewHost,
  getDockviewPanels,
  resolvePanelDefinitionId,
  type DockZoneDefinition,
} from "@lib/dockview";
import { dockWidgetSelectors, panelGroupSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";

import type { PanelGroupDefinition } from "@features/panels/lib/definePanelGroup";

type AnyPanelGroupDefinition = PanelGroupDefinition<string, string>;

interface GroupPresetEntry {
  id: string;
  description?: string;
  slots: string[];
  panelIds: string[];
}

export interface PanelGroupsWorkbenchProps {
  /** Context in which this workbench is rendered. */
  mode?: "panel" | "settings";
  /** Optional root class override. */
  className?: string;
}

function resolvePanelTitle(panelId: string): string {
  return panelSelectors.get(panelId)?.title ?? panelId;
}

function clearDockview(api: DockviewApi) {
  const panels = getDockviewPanels(api);
  panels.forEach((panel) => {
    try {
      api.removePanel(panel);
    } catch (err) {
      console.warn("[PanelGroupsWorkbench] Failed to remove panel:", err);
    }
  });
}

function applyFallbackLayout(api: DockviewApi, panelIds: string[]) {
  if (panelIds.length === 0) return;
  const first = panelIds[0];
  api.addPanel({
    id: first,
    component: first,
    title: resolvePanelTitle(first),
  });
  for (let i = 1; i < panelIds.length; i += 1) {
    const id = panelIds[i];
    api.addPanel({
      id,
      component: id,
      title: resolvePanelTitle(id),
      position: { referencePanel: first },
    });
  }
}

function ensurePanelsPresent(api: DockviewApi, panelIds: string[]) {
  if (panelIds.length === 0) return;

  const existing = new Set<string>();
  for (const panel of getDockviewPanels(api)) {
    const record = panel as { id?: unknown };
    const rawId = typeof record.id === "string" ? record.id : undefined;
    const resolved = resolvePanelDefinitionId(panel) ?? rawId;
    if (resolved) existing.add(resolved);
  }

  let anchor = panelIds.find((id) => existing.has(id));
  if (!anchor) {
    const first = panelIds[0];
    api.addPanel({
      id: first,
      component: first,
      title: resolvePanelTitle(first),
    });
    existing.add(first);
    anchor = first;
  }

  for (const panelId of panelIds) {
    if (existing.has(panelId)) continue;
    try {
      api.addPanel({
        id: panelId,
        component: panelId,
        title: resolvePanelTitle(panelId),
        position: anchor ? { referencePanel: anchor } : undefined,
      });
      existing.add(panelId);
    } catch (err) {
      console.warn("[PanelGroupsWorkbench] Failed to add panel:", { panelId, err });
    }
  }
}

function resolveCompatiblePanelIds(widget: DockZoneDefinition, panelIds: string[]): string[] {
  const allowed = dockWidgetSelectors.getPanelIds(widget.dockviewId);
  if (allowed.length === 0) return panelIds;
  const allowedSet = new Set(allowed);
  return panelIds.filter((id) => allowedSet.has(id));
}

function resolveGroupPresets(group: AnyPanelGroupDefinition | null): GroupPresetEntry[] {
  if (!group) return [];
  return Object.entries(group.presets).map(([presetId, preset]) => {
    const slots = [...preset.slots];
    return {
      id: presetId,
      description: preset.description,
      slots,
      panelIds: group.getPanelIds(slots),
    };
  });
}

function resolveWidgetHost(widget: DockZoneDefinition) {
  return getDockviewHost(widget.dockviewId);
}

export function PanelGroupsWorkbench({
  mode = "panel",
  className,
}: PanelGroupsWorkbenchProps) {
  const [registryVersion, setRegistryVersion] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    const unsubGroups = panelGroupSelectors.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });
    const unsubWidgets = dockWidgetSelectors.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });
    return () => {
      unsubGroups();
      unsubWidgets();
    };
  }, []);

  const groups = useMemo(
    () => {
      void registryVersion;
      return (panelGroupSelectors.getAll() as AnyPanelGroupDefinition[])
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    [registryVersion],
  );
  const widgets = useMemo(
    () => {
      void registryVersion;
      return dockWidgetSelectors
        .getAll()
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    [registryVersion],
  );

  useEffect(() => {
    if (groups.length === 0) {
      if (selectedGroupId !== null) {
        setSelectedGroupId(null);
      }
      return;
    }
    if (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const presets = useMemo(() => resolveGroupPresets(selectedGroup), [selectedGroup]);

  const handleApplyPreset = useCallback(
    (widget: DockZoneDefinition, preset: GroupPresetEntry) => {
      if (!selectedGroup) return;
      const host = resolveWidgetHost(widget);
      if (!host?.api) {
        window.alert(`Open the ${widget.label} widget before applying a panel group.`);
        return;
      }

      const compatiblePanelIds = resolveCompatiblePanelIds(widget, preset.panelIds);
      if (compatiblePanelIds.length === 0) {
        window.alert(
          `No panels from "${selectedGroup.title} / ${preset.id}" are available in ${widget.label}.`
        );
        return;
      }

      const activeSlots = preset.slots.filter((slotName) => {
        const panelId = selectedGroup.panels[slotName];
        return typeof panelId === "string" && compatiblePanelIds.includes(panelId);
      });

      try {
        clearDockview(host.api);
        if (selectedGroup.defaultLayout?.create && activeSlots.length > 0) {
          selectedGroup.defaultLayout.create(host.api, selectedGroup.panels, activeSlots);
        } else {
          applyFallbackLayout(host.api, compatiblePanelIds);
        }
        ensurePanelsPresent(host.api, compatiblePanelIds);
      } catch (err) {
        console.warn("[PanelGroupsWorkbench] Failed to apply group preset:", {
          widgetId: widget.id,
          dockviewId: widget.dockviewId,
          groupId: selectedGroup.id,
          presetId: preset.id,
          err,
        });
        window.alert("Failed to apply panel group preset. Check console for details.");
      }
    },
    [selectedGroup],
  );

  const rootClassName =
    className ??
    "flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100";

  return (
    <div className={rootClassName}>
      <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40 space-y-1">
        <div className="font-semibold">Panel Group Runtime Controls</div>
        <div>
          {mode === "settings" ? (
            <>
              You can apply registered group presets to open dock widgets here.
              Authoring new groups is currently code-defined via <code>definePanelGroup()</code>.
            </>
          ) : (
            <>
              Apply registered panel-group presets directly to open dock widgets.
              Group authoring remains code-defined via <code>definePanelGroup()</code>.
            </>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="text-sm text-neutral-500">No panel groups registered.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-3 space-y-2">
            <h2 className="text-sm font-semibold">Groups</h2>
            <div className="space-y-1.5">
              {groups.map((group) => {
                const selected = group.id === selectedGroupId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${
                      selected
                        ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                        : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    }`}
                  >
                    <div className="text-[12px] font-semibold">{group.title}</div>
                    <div className="text-[10px] text-neutral-500">{group.id}</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      {Object.keys(group.panels).length} slots | {Object.keys(group.presets).length} presets
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 space-y-4">
            {!selectedGroup ? (
              <div className="text-sm text-neutral-500">Select a panel group.</div>
            ) : (
              <>
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold">{selectedGroup.title}</h2>
                  <div className="text-[11px] text-neutral-500">{selectedGroup.description || selectedGroup.id}</div>
                </div>

                {presets.length === 0 ? (
                  <div className="text-sm text-neutral-500">No presets in this group.</div>
                ) : (
                  <div className="space-y-3">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/50 p-3 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[12px] font-semibold">{preset.id}</div>
                            <div className="text-[10px] text-neutral-500">
                              {preset.slots.join(", ")}
                            </div>
                            {preset.description && (
                              <div className="text-[10px] text-neutral-500 mt-0.5">{preset.description}</div>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {preset.panelIds.length} panel{preset.panelIds.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {preset.panelIds.map((panelId) => (
                            <span
                              key={panelId}
                              className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-[10px] text-neutral-700 dark:text-neutral-200"
                              title={panelId}
                            >
                              {resolvePanelTitle(panelId)}
                            </span>
                          ))}
                        </div>

                        <div className="space-y-1.5">
                          {widgets.map((widget) => {
                            const host = resolveWidgetHost(widget);
                            const compatiblePanelIds = resolveCompatiblePanelIds(widget, preset.panelIds);
                            const isCompatible = compatiblePanelIds.length > 0;
                            const isOpen = !!host?.api;

                            return (
                              <div
                                key={`${preset.id}:${widget.id}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 dark:border-neutral-800 px-2 py-1.5"
                              >
                                <div className="space-y-0.5">
                                  <div className="text-[11px] font-medium">{widget.label}</div>
                                  <div className="text-[10px] text-neutral-500">
                                    {isOpen ? "open" : "closed"} | {compatiblePanelIds.length}/{preset.panelIds.length} compatible
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={!isOpen || !isCompatible}
                                  onClick={() => handleApplyPreset(widget, preset)}
                                  className={`px-2 py-1 rounded text-[11px] ${
                                    !isOpen || !isCompatible
                                      ? "bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500 cursor-not-allowed"
                                      : "bg-blue-600 text-white hover:bg-blue-700"
                                  }`}
                                >
                                  Apply
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

