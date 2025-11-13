import { useWorkspaceStore, type PanelId } from '../../stores/workspaceStore';

interface PanelInfo {
  id: PanelId;
  title: string;
  description: string;
  icon: string;
  category: 'content' | 'tools' | 'settings';
}

const PANEL_INFO: PanelInfo[] = [
  {
    id: 'gallery',
    title: 'Gallery',
    description: 'Browse and manage generated assets',
    icon: '🖼️',
    category: 'content',
  },
  {
    id: 'scene',
    title: 'Scene Builder',
    description: 'Create and edit scenes with timeline',
    icon: '🎬',
    category: 'tools',
  },
  {
    id: 'graph',
    title: 'Graph',
    description: 'Visualize asset dependencies and relationships',
    icon: '🔗',
    category: 'tools',
  },
  {
    id: 'inspector',
    title: 'Inspector',
    description: 'View and edit asset properties',
    icon: '🔍',
    category: 'tools',
  },
  {
    id: 'health',
    title: 'Health',
    description: 'Monitor system health and job status',
    icon: '❤️',
    category: 'settings',
  },
  {
    id: 'game',
    title: 'Game Frontend',
    description: 'Interactive game preview and testing',
    icon: '🎮',
    category: 'content',
  },
  {
    id: 'providers',
    title: 'Provider Settings',
    description: 'Manage provider accounts and capacity',
    icon: '⚙️',
    category: 'settings',
  },
];

export function PanelLauncherModule() {
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
  const closedPanels = useWorkspaceStore((s) => s.closedPanels);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);

  // Get list of currently open panels (docked)
  const openPanels = new Set<PanelId>();
  const getLeaves = (node: any): PanelId[] => {
    if (!node) return [];
    if (typeof node === 'string') return [node];
    return [...getLeaves(node.first), ...getLeaves(node.second)];
  };
  getLeaves(currentLayout).forEach((id) => openPanels.add(id));

  // Get list of floating panels
  const floatingPanelIds = new Set(floatingPanels.map(p => p.id));

  const handleOpenPanel = (panelId: PanelId) => {
    restorePanel(panelId);
  };

  const handleOpenFloating = (panelId: PanelId) => {
    openFloatingPanel(panelId);
  };

  // Group panels by category
  const categories: Record<string, PanelInfo[]> = {
    content: [],
    tools: [],
    settings: [],
  };

  PANEL_INFO.forEach((panel) => {
    categories[panel.category].push(panel);
  });

  const categoryLabels = {
    content: 'Content',
    tools: 'Tools',
    settings: 'Settings',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Panel Launcher
        </h3>
        <div className="text-xs text-neutral-500">
          {openPanels.size} / {PANEL_INFO.length} panels open
        </div>
      </div>

      {/* Panel categories */}
      {Object.entries(categories).map(([category, panels]) => (
        <div key={category}>
          <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2 uppercase tracking-wide">
            {categoryLabels[category as keyof typeof categoryLabels]}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {panels.map((panel) => {
              const isOpen = openPanels.has(panel.id);
              const isFloating = floatingPanelIds.has(panel.id);
              const isClosed = closedPanels.includes(panel.id);

              return (
                <div
                  key={panel.id}
                  className={`border rounded-lg p-3 transition-colors ${
                    isOpen || isFloating
                      ? 'bg-green-50/50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-neutral-50/50 dark:bg-neutral-800/50 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {/* Panel header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{panel.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {panel.title}
                        </div>
                        {isOpen && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                            DOCKED
                          </span>
                        )}
                        {isFloating && (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                            FLOATING
                          </span>
                        )}
                        {isClosed && !isOpen && !isFloating && (
                          <span className="text-[10px] text-neutral-500 font-medium">
                            CLOSED
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleOpenPanel(panel.id)}
                        disabled={isOpen}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          isOpen
                            ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                        }`}
                        title={isOpen ? 'Panel is docked' : 'Open panel in workspace (docked)'}
                      >
                        {isOpen ? 'Docked' : 'Dock'}
                      </button>
                      <button
                        onClick={() => handleOpenFloating(panel.id)}
                        className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        title="Open panel as floating window"
                      >
                        Float
                      </button>
                    </div>
                  </div>

                  {/* Panel description */}
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {panel.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Info message */}
      <div className="pt-2 border-t text-xs text-neutral-500 dark:text-neutral-400">
        <p>
          Click <strong className="text-blue-600 dark:text-blue-400">Dock</strong> to add panels to the workspace (draggable/resizable).{' '}
          Click <strong className="text-purple-600 dark:text-purple-400">Float</strong> to open panels as floating windows.
        </p>
      </div>
    </div>
  );
}
