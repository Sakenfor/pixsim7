import { useState } from 'react';
import { useWorkspaceStore, type PanelId } from '../../stores/workspaceStore';
import type { MosaicNode } from 'react-mosaic-component';

const PANEL_NAMES: Record<PanelId, string> = {
  gallery: 'Gallery',
  scene: 'Scene Builder',
  graph: 'Graph',
  inspector: 'Inspector',
  health: 'Health',
  game: 'Game',
};

export function WorkspaceToolbar() {
  const [showPresets, setShowPresets] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');

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

  const handleSavePreset = () => {
    if (presetName.trim()) {
      savePreset(presetName);
      setPresetName('');
      setShowSaveDialog(false);
    }
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
        {showPresets && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[200px]">
            <div className="p-2 space-y-1">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <button
                    className="flex-1 text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                    onClick={() => {
                      loadPreset(preset.id);
                      setShowPresets(false);
                    }}
                  >
                    {preset.name}
                  </button>
                  {!['default', 'minimal', 'creative'].includes(preset.id) && (
                    <button
                      className="text-xs px-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      onClick={() => deletePreset(preset.id)}
                      title="Delete preset"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t dark:border-neutral-700 my-1" />
              <button
                className="w-full text-left text-xs px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-600 dark:text-blue-400"
                onClick={() => {
                  setShowPresets(false);
                  setShowSaveDialog(true);
                }}
              >
                💾 Save Current Layout
              </button>
            </div>
          </div>
        )}
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
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[150px]">
            <div className="p-2 space-y-1">
              {(Object.keys(PANEL_NAMES) as PanelId[]).map((panelId) => {
                const currentLayout = useWorkspaceStore.getState().currentLayout;
                const getAllLeaves = (node: MosaicNode<PanelId> | null): PanelId[] => {
                  if (!node) return [];
                  if (typeof node === 'string') return [node as PanelId];
                  return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
                };
                const existingPanels = getAllLeaves(currentLayout);
                const alreadyExists = existingPanels.includes(panelId);

                return (
                  <button
                    key={panelId}
                    className={`w-full text-left text-xs px-2 py-1 rounded ${
                      alreadyExists
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                    }`}
                    onClick={() => {
                      if (!alreadyExists) {
                        restorePanel(panelId);
                        setShowAddPanel(false);
                      }
                    }}
                    disabled={alreadyExists}
                    title={alreadyExists ? 'Already in layout' : ''}
                  >
                    {PANEL_NAMES[panelId]} {alreadyExists && '✓'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Restore Closed Panels */}
      {closedPanels.length > 0 && (
        <div className="relative">
          <button
            className="text-xs px-2 py-1 border rounded bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300"
            onClick={() => document.getElementById('closed-panels-menu')?.classList.toggle('hidden')}
          >
            ↶ Restore ({closedPanels.length})
          </button>
          <div
            id="closed-panels-menu"
            className="hidden absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[150px]"
          >
            <div className="p-2 space-y-1">
              {closedPanels.map((panelId) => (
                <button
                  key={panelId}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
                  onClick={() => restorePanel(panelId)}
                >
                  {PANEL_NAMES[panelId]}
                </button>
              ))}
              <div className="border-t dark:border-neutral-700 my-1" />
              <button
                className="w-full text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400"
                onClick={clearClosedPanels}
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-semibold mb-2">Save Workspace Preset</h3>
            <input
              type="text"
              className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-900 dark:border-neutral-700"
              placeholder="Preset name..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              autoFocus
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button
                className="text-xs px-3 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
                onClick={() => {
                  setShowSaveDialog(false);
                  setPresetName('');
                }}
              >
                Cancel
              </button>
              <button
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
