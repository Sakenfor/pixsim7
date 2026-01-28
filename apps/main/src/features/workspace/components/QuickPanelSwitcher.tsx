/**
 * Quick Panel Switcher
 *
 * Compact dropdown menu for quickly opening panels and switching profiles.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 */

import { useState, useRef, useEffect, useCallback } from "react";

import { usePanelConfigStore } from "@features/panels";
import { getWorkspaceDockviewHost } from "@features/workspace";

import { useWorkspaceStore, type PanelId } from "../stores/workspaceStore";

/** Storage key for workspace layout (must match DockviewWorkspace) */
const WORKSPACE_STORAGE_KEY = "dockview:workspace:v4";

export function QuickPanelSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"panels" | "profiles">("panels");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const panelConfigs = usePanelConfigStore((s) => s.panelConfigs);
  const getEnabledPanels = usePanelConfigStore((s) => s.getEnabledPanels);

  const presets = useWorkspaceStore((s) => s.presets);
  const getPresetLayout = useWorkspaceStore((s) => s.getPresetLayout);
  const setActivePreset = useWorkspaceStore((s) => s.setActivePreset);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const enabledPanelIds = getEnabledPanels();
  const enabledPanels = enabledPanelIds
    .map((id) => panelConfigs[id])
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const handleOpenPanel = (panelId: string) => {
    openFloatingPanel(panelId as PanelId, { width: 800, height: 600 });
    setIsOpen(false);
  };

  const handleLoadPreset = useCallback((presetId: string) => {
    const host = getWorkspaceDockviewHost();
    const api = host?.api;
    if (!api) return;

    const layout = getPresetLayout(presetId);
    if (layout) {
      api.fromJSON(layout);
    } else {
      // Null layout means use default - reset
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      window.location.reload();
    }
    setActivePreset("workspace", presetId);
    setIsOpen(false);
  }, [getPresetLayout, setActivePreset]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded transition-colors flex items-center gap-2"
        title="Quick Panel Switcher"
      >
        <span className="text-sm">🚀</span>
        <span className="text-sm font-medium">Panels</span>
        <span className="text-xs">▼</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-lg z-50">
          {/* Tabs */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-700">
            <button
              onClick={() => setActiveTab("panels")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "panels"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              Panels ({enabledPanels.length})
            </button>
            <button
              onClick={() => setActiveTab("profiles")}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "profiles"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              Profiles ({presets.length})
            </button>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === "panels" ? (
              <div className="p-2">
                {enabledPanels.length === 0 ? (
                  <div className="text-center py-8 text-sm text-neutral-500">
                    No enabled panels
                  </div>
                ) : (
                  enabledPanels.map((panel) => (
                    <button
                      key={panel.id}
                      onClick={() => handleOpenPanel(panel.id)}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors flex items-center gap-2"
                    >
                      {panel.icon && <span>{panel.icon}</span>}
                      <div className="flex-1">
                        <div className="text-sm font-medium">{panel.id}</div>
                        {panel.description && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {panel.description}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          panel.category === "workspace"
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : panel.category === "scene"
                              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                              : panel.category === "game"
                                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                : panel.category === "dev"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                  : panel.category === "tools"
                                    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                                    : panel.category === "utilities"
                                      ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                                      : panel.category === "system"
                                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                        : "bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400"
                        }`}
                      >
                        {panel.category}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="p-2">
                {presets.length === 0 ? (
                  <div className="text-center py-8 text-sm text-neutral-500">
                    No profiles available
                  </div>
                ) : (
                  presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleLoadPreset(preset.id)}
                      className="w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors flex items-center gap-2"
                    >
                      {preset.icon && (
                        <span className="text-lg">{preset.icon}</span>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {preset.name}
                          {preset.isDefault && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                        {preset.description && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {preset.description}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 p-2">
            <button
              onClick={() => {
                openFloatingPanel("settings" as PanelId, {
                  width: 900,
                  height: 700,
                });
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
            >
              ⚙️ Manage Panels & Profiles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
