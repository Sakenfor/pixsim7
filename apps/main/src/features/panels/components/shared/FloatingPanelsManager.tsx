import { Rnd } from "react-rnd";

import { devToolSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";

import { ContextHubHost } from "@features/contextHub";
import { useWorkspaceStore } from "@features/workspace";

import { DevToolDynamicPanel } from "@/components/dev/DevToolDynamicPanel";


export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelPosition = useWorkspaceStore(
    (s) => s.updateFloatingPanelPosition,
  );
  const updateFloatingPanelSize = useWorkspaceStore(
    (s) => s.updateFloatingPanelSize,
  );
  const bringFloatingPanelToFront = useWorkspaceStore(
    (s) => s.bringFloatingPanelToFront,
  );

  return (
    <>
      {floatingPanels.map((panel) => {
        // Check if this is a dev-tool panel (format: "dev-tool:toolId")
        const isDevToolPanel =
          typeof panel.id === "string" && panel.id.startsWith("dev-tool:");

        let Component: React.ComponentType<any>;
        let title: string;

        // For dev-tool panels, extract toolId from panel ID and ensure it's in context
        let panelContext = panel.context || {};

        if (isDevToolPanel) {
          // Extract tool ID from panel ID
          const toolId = panel.id.slice("dev-tool:".length);
          const devTool = devToolSelectors.get(toolId);

          Component = DevToolDynamicPanel;
          title = devTool?.label || toolId;

          // Ensure toolId is in context (critical for persistence/restore)
          panelContext = { ...panelContext, toolId };
        } else {
          // Regular panel from catalog
          const panelDef = panelSelectors.get(panel.id);
          if (!panelDef) return null;

          Component = panelDef.component;
          title = panelDef.title;
        }

        return (
          <Rnd
            key={panel.id}
            position={{ x: panel.x, y: panel.y }}
            size={{ width: panel.width, height: panel.height }}
            onDragStop={(e, d) => {
              updateFloatingPanelPosition(panel.id, d.x, d.y);
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
              updateFloatingPanelSize(
                panel.id,
                parseInt(ref.style.width),
                parseInt(ref.style.height),
              );
              updateFloatingPanelPosition(panel.id, position.x, position.y);
            }}
            onMouseDown={() => bringFloatingPanelToFront(panel.id)}
            minWidth={300}
            minHeight={200}
            bounds="window"
            dragHandleClassName="floating-panel-header"
            style={{ zIndex: 10100 + panel.zIndex }}
            className="floating-panel"
          >
            <div className="h-full flex flex-col bg-white dark:bg-neutral-900 rounded-lg shadow-2xl border border-neutral-300 dark:border-neutral-700 overflow-hidden">
              {/* Header */}
              <div className="floating-panel-header flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700 cursor-move">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {title}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded font-medium">
                    FLOATING
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => closeFloatingPanel(panel.id)}
                    className="text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Close floating panel"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                <ContextHubHost hostId={`floating:${panel.id}`}>
                  {isDevToolPanel ? (
                    <Component context={panelContext} />
                  ) : (
                    <Component {...panelContext} />
                  )}
                </ContextHubHost>
              </div>
            </div>
          </Rnd>
        );
      })}
    </>
  );
}
