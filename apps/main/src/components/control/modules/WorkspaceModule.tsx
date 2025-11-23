/**
 * Workspace Module for Control Center
 *
 * Quick workspace controls:
 * - Workspace presets
 * - Panel quick launch
 * - Layout management
 * - Recent workspaces
 */

import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { usePanelConfigStore } from '../../../stores/panelConfigStore';
import type { ControlCenterModuleProps } from '../../../lib/control/controlCenterModuleRegistry';

export function WorkspaceModule({ }: ControlCenterModuleProps) {
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
  const closedPanels = useWorkspaceStore((s) => s.closedPanels);
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const presets = useWorkspaceStore((s) => s.presets);
  const savePreset = useWorkspaceStore((s) => s.savePreset);
  const loadPreset = useWorkspaceStore((s) => s.loadPreset);

  const panelConfigs = usePanelConfigStore((s) => s.panelConfigs);

  // Get enabled panels
  const enabledPanels = Object.values(panelConfigs).filter(p => p.enabled);

  return (
    <div className="p-4 space-y-4">
      {/* Workspace Stats */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>🏗️</span>
          Workspace Status
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Enabled Panels:</span>
            <span className="font-semibold">{enabledPanels.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Floating:</span>
            <span className="font-semibold">{floatingPanels.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Closed:</span>
            <span className="font-semibold">{closedPanels.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Presets:</span>
            <span className="font-semibold">{presets.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Panel Launch */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Quick Launch</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {enabledPanels.slice(0, 6).map(panel => (
            <button
              key={panel.id}
              onClick={() => openFloatingPanel(panel.id)}
              className="px-2 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left"
              title={`Open ${panel.title}`}
            >
              <span className="mr-1">{panel.icon}</span>
              {panel.title}
            </button>
          ))}
        </div>
      </div>

      {/* Closed Panels */}
      {closedPanels.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Restore Panels</h3>
          <div className="space-y-1">
            {closedPanels.slice(0, 4).map(panelId => {
              const panel = panelConfigs[panelId];
              if (!panel) return null;

              return (
                <button
                  key={panelId}
                  onClick={() => restorePanel(panelId)}
                  className="w-full px-2 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left flex items-center justify-between"
                >
                  <span>
                    <span className="mr-1">{panel.icon}</span>
                    {panel.title}
                  </span>
                  <span className="text-[10px] text-neutral-500">Restore</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Workspace Presets */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Workspace Presets</h3>
        {presets.length === 0 ? (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            No saved presets. Arrange your workspace and save it!
          </div>
        ) : (
          <div className="space-y-1 mb-2">
            {presets.slice(0, 3).map(preset => (
              <button
                key={preset.id}
                onClick={() => loadPreset(preset.id)}
                className="w-full px-2 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors text-left"
              >
                <div className="font-medium">{preset.name}</div>
                {preset.description && (
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {preset.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            const name = prompt('Preset name:');
            if (name) {
              savePreset(name, `Saved on ${new Date().toLocaleDateString()}`);
            }
          }}
          className="w-full px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          💾 Save Current Layout
        </button>
      </div>
    </div>
  );
}
