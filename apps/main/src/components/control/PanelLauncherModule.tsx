import { useWorkspaceStore, type PanelId } from '@/stores/workspaceStore';
import { Icon, type IconName } from '@/lib/icons';

interface PanelInfo {
  id: PanelId;
  title: string;
  description: string;
  icon: IconName;
  category: 'content' | 'tools' | 'settings';
}

const PANEL_INFO: PanelInfo[] = [
  {
    id: 'gallery',
    title: 'Gallery',
    description: 'Browse and manage generated assets',
    icon: 'image',
    category: 'content',
  },
  {
    id: 'scene',
    title: 'Scene Builder',
    description: 'Create and edit scenes with timeline',
    icon: 'clapperboard',
    category: 'tools',
  },
  {
    id: 'graph',
    title: 'Graph',
    description: 'Visualize asset dependencies and relationships',
    icon: 'graph',
    category: 'tools',
  },
  {
    id: 'inspector',
    title: 'Inspector',
    description: 'View and edit asset properties',
    icon: 'search',
    category: 'tools',
  },
  {
    id: 'health',
    title: 'Health',
    description: 'Monitor system health and job status',
    icon: 'heart',
    category: 'settings',
  },
  {
    id: 'game',
    title: 'Game Frontend',
    description: 'Interactive game preview and testing',
    icon: 'gamepad',
    category: 'content',
  },
  {
    id: 'providers',
    title: 'Provider Settings',
    description: 'Manage provider accounts and capacity',
    icon: 'settings',
    category: 'settings',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Configure app behavior and preferences',
    icon: 'settings',
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Panel Launcher
        </h3>
        <div className="text-xs text-neutral-500">
          {openPanels.size} / {PANEL_INFO.length} open
        </div>
      </div>

      {/* All panels in compact grid */}
      <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1">
        {PANEL_INFO.map((panel) => {
          const isOpen = openPanels.has(panel.id);
          const isFloating = floatingPanelIds.has(panel.id);
          const isClosed = closedPanels.includes(panel.id);

          return (
            <div
              key={panel.id}
              className={`border rounded p-1 transition-all hover:shadow-sm flex flex-col items-center justify-between gap-0.5 aspect-square text-center ${
                isOpen
                  ? 'bg-green-50/50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                  : isFloating
                  ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600'
                  : 'bg-neutral-50/50 dark:bg-neutral-800/50 border-neutral-300 dark:border-neutral-700 hover:border-blue-300'
              }`}
            >
              {/* Icon and Status */}
              <div className="flex flex-col items-center gap-0.5 flex-1 justify-center">
                <Icon
                  name={panel.icon}
                  size={16}
                  className={isOpen ? 'text-green-600 dark:text-green-400' : isFloating ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-600 dark:text-neutral-400'}
                />
                {/* Title */}
                <div className="text-[9px] font-medium text-neutral-800 dark:text-neutral-200 leading-tight line-clamp-2">
                  {panel.title}
                </div>
              </div>

              {/* Compact Action buttons - icon only */}
              <div className="flex gap-0.5 w-full">
                <button
                  onClick={() => handleOpenPanel(panel.id)}
                  disabled={isOpen}
                  className={`flex-1 text-[10px] h-4 flex items-center justify-center rounded transition-colors ${
                    isOpen
                      ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                  title={isOpen ? 'Already docked' : 'Dock panel'}
                >
                  {isOpen ? '✓' : '⬇'}
                </button>
                <button
                  onClick={() => handleOpenFloating(panel.id)}
                  className="flex-1 text-[10px] h-4 flex items-center justify-center bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                  title="Open as floating"
                >
                  ⊡
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

