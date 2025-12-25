/**
 * Widget Presets Settings Module
 *
 * Manages dockview layout presets per widget container (workspace, control center, asset viewer).
 * This is a layout-only view today; future UI presets can extend this surface.
 */

import { useEffect, useMemo, useState } from "react";
import { settingsRegistry } from "../../lib/core/registry";
import {
  dockWidgetRegistry,
  getDockWidgetPanelIds,
  type DockWidgetDefinition,
  panelRegistry,
} from "@features/panels";
import { getDockviewHost } from "@lib/dockview/hostRegistry";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import type { LayoutPreset } from "@features/workspace/stores/workspaceStore";
import type { DockviewApi } from "dockview-core";

type PresetScope = LayoutPreset["scope"];

function resolvePanelTitle(panelId: string): string {
  return panelRegistry.get(panelId)?.title ?? panelId;
}

function getDockviewPanels(api: DockviewApi): any[] {
  const rawPanels = (api as any).panels;
  if (Array.isArray(rawPanels)) return rawPanels;
  if (rawPanels && typeof rawPanels.values === "function") {
    return Array.from(rawPanels.values());
  }
  return [];
}

function clearDockview(api: DockviewApi) {
  const panels = getDockviewPanels(api);
  panels.forEach((panel) => {
    try {
      api.removePanel(panel);
    } catch (err) {
      console.warn("[WidgetPresets] Failed to remove panel:", err);
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

function getWidgetPresets(
  presets: LayoutPreset[],
  scope: PresetScope,
): LayoutPreset[] {
  return presets.filter((preset) => preset.scope === scope || preset.scope === "all");
}

function resolveWidgetHost(widget: DockWidgetDefinition) {
  return getDockviewHost(widget.dockviewId);
}

export function WidgetPresetsSettings() {
  const [registryVersion, setRegistryVersion] = useState(0);
  const presets = useWorkspaceStore((s) => s.presets);
  const activePresetByScope = useWorkspaceStore((s) => s.activePresetByScope);
  const savePreset = useWorkspaceStore((s) => s.savePreset);
  const deletePreset = useWorkspaceStore((s) => s.deletePreset);
  const setActivePreset = useWorkspaceStore((s) => s.setActivePreset);

  useEffect(() => {
    return dockWidgetRegistry.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });
  }, []);

  const widgets = useMemo(
    () =>
      dockWidgetRegistry
        .getAll()
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [registryVersion],
  );

  const handleApply = (widget: DockWidgetDefinition, preset: LayoutPreset) => {
    const host = resolveWidgetHost(widget);
    if (!host?.api) {
      window.alert(`Open the ${widget.label} widget to apply presets.`);
      return;
    }

    try {
      if (preset.layout) {
        host.api.fromJSON(preset.layout);
      } else {
        if (widget.storageKey) {
          localStorage.removeItem(widget.storageKey);
        }
        clearDockview(host.api);
        const panelIds = getDockWidgetPanelIds(widget.dockviewId);
        applyFallbackLayout(host.api, panelIds);
      }
      setActivePreset(widget.presetScope, preset.id);
    } catch (err) {
      console.warn("[WidgetPresets] Failed to apply preset:", err);
      window.alert("Failed to apply preset. Check console for details.");
    }
  };

  const handleSave = (widget: DockWidgetDefinition) => {
    const host = resolveWidgetHost(widget);
    if (!host?.api) {
      window.alert(`Open the ${widget.label} widget to save presets.`);
      return;
    }
    const name = window.prompt("Enter preset name:");
    if (!name) return;
    try {
      const layout = host.api.toJSON();
      savePreset(name, widget.presetScope, layout);
    } catch (err) {
      console.warn("[WidgetPresets] Failed to save preset:", err);
      window.alert("Failed to save preset. Check console for details.");
    }
  };

  const handleExport = async (preset: LayoutPreset) => {
    const payload = {
      name: preset.name,
      scope: preset.scope,
      layout: preset.layout,
      description: preset.description,
      icon: preset.icon,
    };
    const json = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(json);
      window.alert("Preset copied to clipboard.");
    } catch {
      window.prompt("Copy preset JSON:", json);
    }
  };

  const handleImport = (widget: DockWidgetDefinition) => {
    const raw = window.prompt("Paste preset JSON:");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<LayoutPreset>;
      if (!parsed.layout) {
        window.alert("Invalid preset: missing layout.");
        return;
      }
      const name = parsed.name ?? "Imported Preset";
      savePreset(name, widget.presetScope, parsed.layout);
    } catch (err) {
      console.warn("[WidgetPresets] Failed to import preset:", err);
      window.alert("Invalid preset JSON.");
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-6 text-xs text-neutral-800 dark:text-neutral-100">
      <div className="p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40">
        Layout presets apply to dockview containers (widgets) like Workspace, Control Center, and Asset Viewer.
        These presets currently store layout only. Future UI presets can add per-panel settings and overrides.
      </div>

      {widgets.length === 0 ? (
        <div className="text-sm text-neutral-500">No dock widgets registered.</div>
      ) : (
        widgets.map((widget) => {
          const widgetPresets = getWidgetPresets(presets, widget.presetScope);
          const activeId = activePresetByScope[widget.presetScope] ?? null;
          const isMounted = !!resolveWidgetHost(widget);

          return (
            <section
              key={widget.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">
                    {widget.label}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {widget.description ?? `Dockview: ${widget.dockviewId}`}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Status: {isMounted ? "open" : "closed"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSave(widget)}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] hover:bg-blue-700"
                  >
                    Save Current
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImport(widget)}
                    className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Import
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {widgetPresets.length === 0 ? (
                  <div className="text-[11px] text-neutral-500">
                    No presets available for this widget.
                  </div>
                ) : (
                  widgetPresets.map((preset) => {
                    const isActive = preset.id === activeId;
                    return (
                      <div
                        key={preset.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold">
                            {preset.name}
                          </span>
                          {preset.isDefault && (
                            <span className="text-[10px] text-neutral-400">default</span>
                          )}
                          {isActive && (
                            <span className="text-[10px] text-emerald-500">active</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleApply(widget, preset)}
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] hover:bg-emerald-700"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExport(preset)}
                            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            Export
                          </button>
                          {!preset.isDefault && (
                            <button
                              type="button"
                              onClick={() => deletePreset(preset.id)}
                              className="px-2 py-1 rounded border border-red-300 text-red-600 text-[11px] hover:bg-red-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

settingsRegistry.register({
  id: "widget-presets",
  label: "UI Presets",
  icon: "layout",
  component: WidgetPresetsSettings,
  order: 18,
});
