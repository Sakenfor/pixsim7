import { useMemo, useState } from 'react';
import { Select } from '@pixsim7/shared.ui';
import { CubeSettingsPanel } from '../control/CubeSettingsPanel';
import { useCubeSettingsStore, type LinkingGesture } from '../../stores/cubeSettingsStore';
import { panelActionRegistry } from '../../lib/panelActions';

export function SettingsPanel() {
  const [showCubeSettings, setShowCubeSettings] = useState(false);
  const linkingGesture = useCubeSettingsStore((s) => s.linkingGesture);
  const setLinkingGesture = useCubeSettingsStore((s) => s.setLinkingGesture);

  const panelSummary = useMemo(
    () =>
      panelActionRegistry.getAllPanels().map((panelId) => {
        const mappings = panelActionRegistry.getFaceMappings(panelId);
        const mappedCount = Object.values(mappings).filter(Boolean).length;
        return { panelId, mappedCount };
      }),
    []
  );

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900">
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Configure global behavior for cubes, panels, and providers.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Cube System
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Adjust how control cubes behave and how connections between cubes are created.
          </p>

          <div className="mt-2 space-y-2 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
            <div>
              <div className="text-[11px] font-semibold mb-1">Linking Gesture</div>
              <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                Choose how to create connections between cube faces.
              </div>
              <Select
                value={linkingGesture}
                onChange={(e) => setLinkingGesture(e.target.value as LinkingGesture)}
                size="sm"
                className="text-[11px]"
              >
                <option value="middleClick">Middle-click face to connect</option>
                <option value="shiftLeftClick">Shift + Left-click face to connect</option>
              </Select>
              <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                Middle-click works well with a mouse; Shift+Left-click is better on trackpads
                that lack a middle button.
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-200/70 dark:border-neutral-800/70">
              <div className="text-[11px] font-semibold mb-1">Cube Actions Overview</div>
              {panelSummary.length === 0 ? (
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  No panels have registered cube actions yet.
                </div>
              ) : (
                <div className="space-y-1 max-h-32 overflow-auto">
                  {panelSummary.map(({ panelId, mappedCount }) => (
                    <div
                      key={panelId}
                      className="flex items-center justify-between text-[11px] text-neutral-700 dark:text-neutral-200"
                    >
                      <span className="truncate">{panelId}</span>
                      <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">
                        {mappedCount} face{mappedCount === 1 ? '' : 's'} mapped
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex items-center px-2.5 py-1.5 rounded border border-blue-500/70 text-[11px] font-medium text-blue-600 dark:text-blue-300 bg-blue-50/60 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            onClick={() => setShowCubeSettings(true)}
          >
            Open Cube Settings
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Cube Shortcuts
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Keyboard controls for summoning and manipulating cubes:
          </p>
          <ul className="text-[11px] text-neutral-700 dark:text-neutral-200 space-y-0.5">
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                Ctrl+Space
              </span>
              Toggle cube system (summon / dismiss)
            </li>
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                Ctrl+Shift+C
              </span>
              Add control cube
            </li>
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                Ctrl+Shift+P
              </span>
              Add provider cube
            </li>
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                Arrow keys
              </span>
              Rotate active cube to top / bottom / left / right face
            </li>
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                R
              </span>
              Toggle auto‑rotation on active cube
            </li>
            <li>
              <span className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded mr-1">
                E
              </span>
              Expand / collapse active cube
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Providers & Accounts
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Provider configuration still lives in the Provider Settings panel. Use the Panel
            Launcher or the Providers panel to manage accounts, capacities, and quotas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Workspace Layout
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Layout presets and workspace arrangement are managed from the main workspace toolbar.
            Future global layout settings can be added here.
          </p>
        </section>
      </div>

      {showCubeSettings && (
        <CubeSettingsPanel onClose={() => setShowCubeSettings(false)} />
      )}
    </div>
  );
}
