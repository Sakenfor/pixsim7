import { useMemo } from "react";
import { useWorkspaceStore, type PanelId } from "../../stores/workspaceStore";
import { Icon } from "@lib/icons";
import { panelRegistry } from "@features/panels";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@features/panels";

interface AddPanelDropdownProps {
  onRestorePanel: (panelId: PanelId) => void;
  onClose: () => void;
}

export function AddPanelDropdown({
  onRestorePanel,
  onClose,
}: AddPanelDropdownProps) {
  const layout = useWorkspaceStore((s) => s.getLayout("workspace"));

  const existingPanels = useMemo(() => {
    const ids = new Set<PanelId>();
    const layoutPanels = (layout as any)?.panels;

    if (Array.isArray(layoutPanels)) {
      for (const panel of layoutPanels) {
        const panelId = panel?.params?.panelId;
        if (typeof panelId === "string") {
          ids.add(panelId as PanelId);
        }
      }
    }

    return ids;
  }, [layout]);
  const allPanels = panelRegistry.getPublicPanels();

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
                const alreadyExists = existingPanels.has(panel.id as PanelId);

                return (
                  <button
                    key={panel.id}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 ${
                      alreadyExists
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    }`}
                    onClick={() => {
                      if (!alreadyExists) {
                        onRestorePanel(panel.id);
                        onClose();
                      }
                    }}
                    disabled={alreadyExists}
                    title={
                      alreadyExists
                        ? "Already in layout"
                        : panel.description || ""
                    }
                  >
                    {panel.icon && (
                      <span className="text-sm">{panel.icon}</span>
                    )}
                    <span className="flex-1">{panel.title}</span>
                    {alreadyExists && (
                      <Icon name="check" size={12} className="opacity-50" />
                    )}
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
