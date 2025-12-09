import { useWorkspaceStore, type PanelId, type LayoutNode } from '@/stores/workspaceStore';
import { Icon } from '@/lib/icons';
import { panelRegistry } from '@/lib/panels/panelRegistry';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '@/lib/panels/panelConstants';

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
  const allPanels = panelRegistry.getAll();

  // Group panels by category
  const panelsByCategory = CATEGORY_ORDER.map((category) => ({
    category,
    panels: allPanels.filter((p) => p.category === category),
  })).filter((group) => group.panels.length > 0);

  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[200px] max-h-[500px] overflow-y-auto">
      <div className="p-2">
        {panelsByCategory.map(({ category, panels }) => (
          <div key={category} className="mb-3 last:mb-0">
            <div className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 px-2 py-1">
              {CATEGORY_LABELS[category]}
            </div>
            <div className="space-y-0.5">
              {panels.map((panel) => {
                const alreadyExists = existingPanels.includes(panel.id);

                return (
                  <button
                    key={panel.id}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 ${
                      alreadyExists
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                    }`}
                    onClick={() => {
                      if (!alreadyExists) {
                        onRestorePanel(panel.id);
                        onClose();
                      }
                    }}
                    disabled={alreadyExists}
                    title={alreadyExists ? 'Already in layout' : panel.description || ''}
                  >
                    {panel.icon && <span className="text-sm">{panel.icon}</span>}
                    <span className="flex-1">{panel.title}</span>
                    {alreadyExists && <Icon name="check" size={12} className="opacity-50" />}
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
