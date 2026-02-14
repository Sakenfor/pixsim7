import { panelSelectors } from "@lib/plugins/catalogSelectors";

interface RestoreClosedPanelsMenuProps {
  closedPanels: string[];
  onRestorePanel: (panelId: string) => void;
  onClearHistory: () => void;
}

export function RestoreClosedPanelsMenu({
  closedPanels,
  onRestorePanel,
  onClearHistory,
}: RestoreClosedPanelsMenuProps) {
  if (closedPanels.length === 0) return null;

  return (
    <div className="relative">
      <button
        className="text-xs px-2 py-1 border rounded bg-accent-subtle border-accent-muted text-accent hover:bg-accent-subtle/80"
        onClick={() =>
          document
            .getElementById("closed-panels-menu")
            ?.classList.toggle("hidden")
        }
      >
        ↶ Restore ({closedPanels.length})
      </button>
      <div
        id="closed-panels-menu"
        className="hidden absolute top-full left-0 mt-1 bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-50 min-w-[150px]"
      >
        <div className="p-2 space-y-1">
          {closedPanels.map((panelId) => (
            <button
              key={panelId}
              className="w-full text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded"
              onClick={() => onRestorePanel(panelId)}
            >
              {panelSelectors.get(panelId)?.title ?? panelId}
            </button>
          ))}
          <div className="border-t dark:border-neutral-700 my-1" />
          <button
            className="w-full text-left text-xs px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400"
            onClick={onClearHistory}
          >
            Clear History
          </button>
        </div>
      </div>
    </div>
  );
}
