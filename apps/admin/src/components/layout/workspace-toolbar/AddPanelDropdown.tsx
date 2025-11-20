import { useWorkspaceStore, type PanelId, type LayoutNode } from '../../../stores/workspaceStore';
import { Icon } from '../../../lib/icons';

const PANEL_NAMES: Record<PanelId, string> = {
  gallery: 'Gallery',
  scene: 'Scene Builder',
  graph: 'Graph',
  inspector: 'Inspector',
  health: 'Health',
  game: 'Game',
  providers: 'Provider Settings',
  settings: 'Settings',
};

interface AddPanelDropdownProps {
  onRestorePanel: (panelId: PanelId) => void;
  onClose: () => void;
}

export function AddPanelDropdown({ onRestorePanel, onClose }: AddPanelDropdownProps) {
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);

  const getAllLeaves = (node: LayoutNode<PanelId> | null): PanelId[] => {
    if (!node) return [];
    if (typeof node === 'string') return [node as PanelId];
    return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
  };

  const existingPanels = getAllLeaves(currentLayout);

  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[150px]">
      <div className="p-2 space-y-1">
        {(Object.keys(PANEL_NAMES) as PanelId[]).map((panelId) => {
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
                  onRestorePanel(panelId);
                  onClose();
                }
              }}
              disabled={alreadyExists}
              title={alreadyExists ? 'Already in layout' : ''}
            >
              {PANEL_NAMES[panelId]} {alreadyExists && <Icon name="check" size={14} className="inline ml-1" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
