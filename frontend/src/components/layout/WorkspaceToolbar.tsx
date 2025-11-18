import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { PresetsDropdown } from './workspace-toolbar/PresetsDropdown';
import { AddPanelDropdown } from './workspace-toolbar/AddPanelDropdown';
import { RestoreClosedPanelsMenu } from './workspace-toolbar/RestoreClosedPanelsMenu';
import { SavePresetDialog } from './workspace-toolbar/SavePresetDialog';

export function WorkspaceToolbar() {
  const [showPresets, setShowPresets] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const presets = useWorkspaceStore((s) => s.presets);
  const loadPreset = useWorkspaceStore((s) => s.loadPreset);
  const savePreset = useWorkspaceStore((s) => s.savePreset);
  const deletePreset = useWorkspaceStore((s) => s.deletePreset);
  const closedPanels = useWorkspaceStore((s) => s.closedPanels);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
  const clearClosedPanels = useWorkspaceStore((s) => s.clearClosedPanels);
  const isLocked = useWorkspaceStore((s) => s.isLocked);
  const toggleLock = useWorkspaceStore((s) => s.toggleLock);
  const reset = useWorkspaceStore((s) => s.reset);

  const handleSavePreset = (name: string) => {
    savePreset(name);
    setShowSaveDialog(false);
  };

  return (
    <div className="border-b px-3 py-2 flex gap-2 items-center bg-neutral-50 dark:bg-neutral-800 relative">
      <span className="text-xs font-semibold">Workspace</span>

      {/* Lock/Unlock */}
      <button
        className={`text-xs px-2 py-1 border rounded transition-colors ${
          isLocked
            ? 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-200'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
        }`}
        onClick={toggleLock}
        title={isLocked ? 'Unlock layout' : 'Lock layout'}
      >
        {isLocked ? '🔒 Locked' : '🔓 Unlocked'}
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
          onLoadPreset={loadPreset}
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
        onClick={reset}
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
