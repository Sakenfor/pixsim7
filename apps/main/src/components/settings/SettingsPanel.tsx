import { useMemo, useState, useEffect } from 'react';
import { Select } from '@pixsim7/shared.ui';
import { CubeSettingsPanel } from '../control/CubeSettingsPanel';
import { PanelConfigurationPanel } from './PanelConfigurationPanel';
import { WorkspaceProfileManager } from './WorkspaceProfileManager';
import { useCubeSettingsStore, type LinkingGesture } from '../../stores/cubeSettingsStore';
import { panelActionRegistry } from '../../lib/panelActions';
import { controlCenterRegistry } from '../../lib/plugins/controlCenterPlugin';

type SettingsTab = 'general' | 'panels' | 'profiles';

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showCubeSettings, setShowCubeSettings] = useState(false);
  const [controlCenters, setControlCenters] = useState(() => controlCenterRegistry.getAll());
  const [activeControlCenterId, setActiveControlCenterId] = useState(() => controlCenterRegistry.getActiveId());
  const [switchMessage, setSwitchMessage] = useState('');
  const linkingGesture = useCubeSettingsStore((s) => s.linkingGesture);
  const setLinkingGesture = useCubeSettingsStore((s) => s.setLinkingGesture);

  // Update control centers when they change
  useEffect(() => {
    const interval = setInterval(() => {
      setControlCenters(controlCenterRegistry.getAll());
      setActiveControlCenterId(controlCenterRegistry.getActiveId());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Clear switch message after 3 seconds
  useEffect(() => {
    if (switchMessage) {
      const timeout = setTimeout(() => setSwitchMessage(''), 3000);
      return () => clearTimeout(timeout);
    }
  }, [switchMessage]);

  const handleControlCenterSwitch = (id: string) => {
    const success = controlCenterRegistry.setActive(id);
    if (success) {
      setActiveControlCenterId(id);
      const cc = controlCenters.find(c => c.id === id);
      if (cc) {
        setSwitchMessage(`Switched to ${cc.displayName}`);
      }
    }
  };

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
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
        <div className="mb-3">
          <h1 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Settings
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Configure global behavior for cubes, panels, and providers.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'general'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('panels')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'panels'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Panels
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'profiles'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Profiles
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'panels' ? (
        <PanelConfigurationPanel />
      ) : activeTab === 'profiles' ? (
        <WorkspaceProfileManager />
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
        {/* Control Center Mode Selection */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Control Center
          </h2>
          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Choose your preferred control center interface. All modes provide the same functionality through different UIs.
          </p>

          {/* Switch Success Message */}
          {switchMessage && (
            <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-[11px] text-green-700 dark:text-green-300">
              ✅ {switchMessage}
            </div>
          )}

          <div className="mt-2 space-y-2">
            {controlCenters.map((cc) => {
              const isActive = activeControlCenterId === cc.id;

              return (
                <button
                  key={cc.id}
                  onClick={() => handleControlCenterSwitch(cc.id)}
                  className={`
                    w-full text-left p-3 rounded-md border-2 transition-all
                    ${isActive
                      ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
                      {cc.displayName}
                    </div>
                    {isActive && (
                      <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">
                        ACTIVE
                      </span>
                    )}
                    {cc.default && !isActive && (
                      <span className="px-1.5 py-0.5 bg-neutral-400 text-white text-[10px] font-bold rounded">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mb-2">
                    {cc.description}
                  </div>
                  {cc.features && cc.features.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cc.features.map((feature) => (
                        <span
                          key={feature}
                          className="px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-[9px] rounded"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
            💡 <strong>Tip:</strong> Press <kbd className="px-1 py-0.5 bg-white dark:bg-neutral-700 rounded border text-[9px]">Ctrl+Shift+X</kbd> to quickly open the Control Center selector overlay.
          </div>
        </section>

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
            Layout presets and workspace arrangement are managed from the Profiles tab above.
          </p>
        </section>
        </div>
      )}

      {showCubeSettings && (
        <CubeSettingsPanel onClose={() => setShowCubeSettings(false)} />
      )}
    </div>
  );
}
