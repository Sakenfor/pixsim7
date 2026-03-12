import { useMemo, useState, useEffect } from 'react';

import { getDockviewPanels, resolvePanelDefinitionId } from '@lib/dockview';
import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import {
  openFloatingWorkspacePanel,
  openWorkspacePanel,
  resolveWorkspaceDockview,
  useWorkspaceStore,
} from '@features/workspace';


export function PanelLauncherModule() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const [panelCatalogVersion, setPanelCatalogVersion] = useState(0);

  useEffect(() => {
    // Ensure panel registry is hydrated when launcher is opened.
    void import('@features/panels/lib/initializePanels')
      .then(({ initializePanels }) => initializePanels({ contexts: ['workspace', 'control-center'] }))
      .catch((error) => {
        console.warn('[PanelLauncherModule] Failed to initialize panels:', error);
      });
  }, []);

  useEffect(() => {
    return panelSelectors.subscribe(() => setPanelCatalogVersion((version) => version + 1));
  }, []);

  // Get all panels from catalog
  const allPanels = useMemo(
    () => panelSelectors.getPublicPanels(),
    [panelCatalogVersion],
  );

  // Get list of currently open panels (docked) from dockview API
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const host = resolveWorkspaceDockview().host;
    const api = host?.api;
    if (!api) return;

    const updateOpenPanels = () => {
      const panels = new Set<string>();
      for (const panel of getDockviewPanels(api)) {
        const panelId = resolvePanelDefinitionId(panel);
        if (typeof panelId === 'string') {
          panels.add(panelId);
        }
      }
      setOpenPanels(panels);
    };

    // Initial update
    updateOpenPanels();

    // Subscribe to layout changes
    const disposable = api.onDidLayoutChange(updateOpenPanels);
    return () => disposable.dispose();
  }, []);

  // Get list of floating panels
  const floatingPanelIds = useMemo(
    () => new Set(floatingPanels.map(p => p.id)),
    [floatingPanels]
  );

  const handleOpenPanel = (panelId: string) => {
    openWorkspacePanel(panelId);
  };

  const handleOpenFloating = (panelId: string) => {
    openFloatingWorkspacePanel(panelId);
  };

  // Group panels by category
  const panelsByCategory = useMemo(() => {
    const groups: Record<string, typeof allPanels> = {};
    allPanels.forEach(panel => {
      if (!groups[panel.category]) {
        groups[panel.category] = [];
      }
      groups[panel.category].push(panel);
    });
    return groups;
  }, [allPanels]);

  const categoryLabels: Record<string, string> = {
    workspace: 'Workspace',
    scene: 'Scene',
    game: 'Game',
    dev: 'Development',
    tools: 'Tools',
    utilities: 'Utilities',
    system: 'System',
    custom: 'Custom',
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Panels
        </h3>
        <div className="text-xs text-neutral-500">
          {openPanels.size} / {allPanels.length} open
        </div>
      </div>

      {/* Panels by category */}
      <div className="space-y-1.5">
        {Object.entries(panelsByCategory).map(([category, panels]) => (
          <div key={category}>
            <div className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide px-1 mb-0.5">
              {categoryLabels[category] || category}
            </div>
            <div className="flex flex-wrap gap-1">
              {panels.map((panel) => {
                const isOpen = openPanels.has(panel.id);
                const isFloating = floatingPanelIds.has(panel.id);

                return (
                  <button
                    key={panel.id}
                    onClick={() => isOpen ? handleOpenFloating(panel.id) : handleOpenPanel(panel.id)}
                    title={`${panel.title}${isOpen ? ' (docked)' : isFloating ? ' (floating)' : ''}\nClick: ${isOpen ? 'Float' : 'Dock'} · Right-click: Float`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenFloating(panel.id);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      isOpen
                        ? 'bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/25'
                        : isFloating
                        ? 'bg-accent/15 text-accent hover:bg-accent/25'
                        : 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700/60'
                    }`}
                  >
                    <Icon name={panel.icon as string} size={13} />
                    <span className="whitespace-nowrap">{panel.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
