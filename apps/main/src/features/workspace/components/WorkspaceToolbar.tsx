import { useState, useCallback } from "react";

import { useWorkspacePresets } from "../hooks/useWorkspacePresets";
import { resolveWorkspaceDockview } from "../lib/resolveWorkspaceDockview";
import { useWorkspaceStore } from "../stores/workspaceStore";

import { AddPanelDropdown } from "./workspace-toolbar/AddPanelDropdown";
import { PresetsDropdown } from "./workspace-toolbar/PresetsDropdown";
import { RestoreClosedPanelsMenu } from "./workspace-toolbar/RestoreClosedPanelsMenu";
import { SavePresetDialog } from "./workspace-toolbar/SavePresetDialog";


/** Storage key for workspace layout (must match DockviewWorkspace) */
const WORKSPACE_STORAGE_KEY = "dockview:workspace:v4";

export function WorkspaceToolbar() {
  const [showPresets, setShowPresets] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const presets = useWorkspacePresets("workspace");
  const savePreset = useWorkspaceStore((s) => s.savePreset);
  const getPresetLayout = useWorkspaceStore((s) => s.getPresetLayout);
  const setActivePreset = useWorkspaceStore((s) => s.setActivePreset);
  const deletePreset = useWorkspaceStore((s) => s.deletePreset);
  const closedPanels = useWorkspaceStore((s) => s.closedPanels);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
  const clearClosedPanels = useWorkspaceStore((s) => s.clearClosedPanels);
  const isLocked = useWorkspaceStore((s) => s.isLocked);
  const toggleLock = useWorkspaceStore((s) => s.toggleLock);
  const reset = useWorkspaceStore((s) => s.reset);

  const getWorkspaceHost = useCallback(() => {
    return resolveWorkspaceDockview().host;
  }, []);

  const handleLoadPreset = useCallback((presetId: string) => {
    const host = getWorkspaceHost();
    const api = host?.api;
    if (!api) return;

    const layout = getPresetLayout(presetId);
    if (layout) {
      api.fromJSON(layout);
    } else {
      // Null layout means use default - reset
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      // Force remount by reloading (or we could trigger a state change)
      window.location.reload();
    }
    setActivePreset("workspace", presetId);
  }, [getWorkspaceHost, getPresetLayout, setActivePreset]);

  const handleSavePreset = useCallback((name: string) => {
    const host = getWorkspaceHost();
    const api = host?.api;
    if (!api) return;

    const layout = api.toJSON();
    savePreset(name, "workspace", layout);
    setShowSaveDialog(false);
  }, [getWorkspaceHost, savePreset]);

  const handleReset = useCallback(() => {
    // Clear layout from localStorage and reset store state
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    reset();
    // Reload to apply default layout
    window.location.reload();
  }, [reset]);

  return (
    <div className="border-b px-3 py-2 flex gap-2 items-center bg-neutral-50 dark:bg-neutral-800 relative">
      <span className="text-xs font-semibold">Workspace</span>

      {/* Lock/Unlock */}
      <button
        className={`text-xs px-2 py-1 border rounded transition-colors ${
          isLocked
            ? "bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-200"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-700"
        }`}
        onClick={toggleLock}
        title={isLocked ? "Unlock layout" : "Lock layout"}
      >
        {isLocked ? "🔒 Locked" : "🔓 Unlocked"}
      </button>

      <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-600" />

      {/* Presets Dropdown */}
      <div className="relative">
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => setShowPresets(!showPresets)}
        >
          📐 Presets
        </button>
        <PresetsDropdown
          isOpen={showPresets}
          presets={presets}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={deletePreset}
          onSaveClick={() => setShowSaveDialog(true)}
          onClose={() => setShowPresets(false)}
        />
      </div>

      {/* Add Panel */}
      <div className="relative">
        <button
          className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          onClick={() => setShowAddPanel(!showAddPanel)}
          disabled={isLocked}
        >
          ➕ Add Panel
        </button>
        {showAddPanel && (
          <AddPanelDropdown
            onRestorePanel={restorePanel}
            onClose={() => setShowAddPanel(false)}
          />
        )}
      </div>

      {/* Restore Closed Panels */}
      <RestoreClosedPanelsMenu
        closedPanels={closedPanels}
        onRestorePanel={restorePanel}
        onClearHistory={clearClosedPanels}
      />

      <div className="flex-1" />

      {/* Help Text */}
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        Double-click titlebar to fullscreen • Drag edges to split
      </span>

      <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-600" />

      {/* Reset */}
      <button
        className="text-xs px-2 py-1 border rounded text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
        onClick={handleReset}
      >
        Reset
      </button>

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <SavePresetDialog
          onSave={handleSavePreset}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
