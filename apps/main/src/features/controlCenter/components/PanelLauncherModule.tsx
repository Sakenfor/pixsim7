import { useMemo } from 'react';
import { useWorkspaceStore, type PanelId } from '@features/workspace';
import { panelRegistry } from '@features/panels';

export function PanelLauncherModule() {
  const layout = useWorkspaceStore((s) => s.getLayout('workspace'));
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);

  // Get all panels from registry
  const allPanels = useMemo(() => panelRegistry.getAll(), []);

  // Get list of currently open panels (docked)
  const openPanels = useMemo(() => {
    const panels = new Set<PanelId>();

    const layoutPanels = (layout as any)?.panels;
    if (Array.isArray(layoutPanels)) {
      for (const panel of layoutPanels) {
        const panelId = panel?.params?.panelId;
        if (typeof panelId === 'string') {
          panels.add(panelId as PanelId);
        }
      }
    }

    return panels;
  }, [layout]);

  // Get list of floating panels
  const floatingPanelIds = useMemo(
    () => new Set(floatingPanels.map(p => p.id)),
    [floatingPanels]
  );

  const handleOpenPanel = (panelId: PanelId) => {
    restorePanel(panelId);
  };

  const handleOpenFloating = (panelId: PanelId) => {
    openFloatingPanel(panelId);
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Panels
        </h3>
        <div className="text-xs text-neutral-500">
          {openPanels.size} / {allPanels.length} open
        </div>
      </div>

      {/* Panels grouped by category */}
      <div className="space-y-3">
        {Object.entries(panelsByCategory).map(([category, panels]) => (
          <div key={category} className="space-y-1.5">
            {/* Category header */}
            <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
              {categoryLabels[category] || category}
            </div>

            {/* Panel grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {panels.map((panel) => {
                const isOpen = openPanels.has(panel.id as PanelId);
                const isFloating = floatingPanelIds.has(panel.id as PanelId);

                return (
                  <div
                    key={panel.id}
                    className={`relative flex flex-col p-2 rounded border transition-all hover:shadow-sm ${
                      isOpen
                        ? 'bg-green-50/50 dark:bg-green-900/20 border-green-400/50 dark:border-green-600/50'
                        : isFloating
                        ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-400/50 dark:border-blue-600/50'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}
                  >
                    {/* Status indicator dot */}
                    {(isOpen || isFloating) && (
                      <div className="absolute top-1 right-1">
                        <span
                          className={`block w-2 h-2 rounded-full ${
                            isOpen ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          title={isOpen ? 'Docked' : 'Floating'}
                        />
                      </div>
                    )}

                    {/* Icon */}
                    <div className="text-2xl mb-1 text-center">
                      {panel.icon}
                    </div>

                    {/* Title */}
                    <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100 text-center mb-2 line-clamp-2 min-h-[2rem]">
                      {panel.title}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-1 mt-auto">
                      <button
                        onClick={() => handleOpenPanel(panel.id as PanelId)}
                        disabled={isOpen}
                        className={`flex-1 text-[10px] py-1 px-1 rounded transition-colors ${
                          isOpen
                            ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                        title={isOpen ? 'Already docked' : 'Dock panel'}
                      >
                        {isOpen ? '✓' : 'Dock'}
                      </button>
                      <button
                        onClick={() => handleOpenFloating(panel.id as PanelId)}
                        className="flex-1 text-[10px] py-1 px-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                        title="Open as floating window"
                      >
                        Float
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
