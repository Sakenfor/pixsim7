import { Rnd } from 'react-rnd';
import { useWorkspaceStore, type PanelId } from '@/stores/workspaceStore';
import { useControlCubeStore } from '@/stores/controlCubeStore';
import { panelRegistry } from '@/lib/panels/panelRegistry';
import { BASE_CUBE_SIZE } from '@/config/cubeConstants';
import { DevToolDynamicPanel } from '@/components/dev/DevToolDynamicPanel';
import { devToolRegistry } from '@/lib/devtools/devToolRegistry';

export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const minimizeFloatingPanel = useWorkspaceStore((s) => s.minimizeFloatingPanel);
  const updateFloatingPanelPosition = useWorkspaceStore((s) => s.updateFloatingPanelPosition);
  const updateFloatingPanelSize = useWorkspaceStore((s) => s.updateFloatingPanelSize);
  const bringFloatingPanelToFront = useWorkspaceStore((s) => s.bringFloatingPanelToFront);

  const minimizePanelToCube = useControlCubeStore((s) => s.minimizePanelToCube);
  const cubes = useControlCubeStore((s) => s.cubes);
  const addCube = useControlCubeStore((s) => s.addCube);
  const setActiveCube = useControlCubeStore((s) => s.setActiveCube);
  const updateCube = useControlCubeStore((s) => s.updateCube);

  const handleMinimize = (panelId: PanelId) => {
    const panel = floatingPanels.find(p => p.id === panelId);
    if (!panel) return;

    // Calculate center position of the panel (where cube will appear)
    const cubeSize = BASE_CUBE_SIZE;
    const centerX = panel.x + panel.width / 2 - cubeSize / 2;
    const centerY = panel.y + panel.height / 2 - cubeSize / 2;

    // Create cube at panel's center
    minimizePanelToCube(
      {
        panelId: panel.id,
        originalPosition: { x: panel.x, y: panel.y },
        originalSize: { width: panel.width, height: panel.height },
        zIndex: panel.zIndex,
      },
      { x: centerX, y: centerY }
    );

    // Remove panel from floating panels
    minimizeFloatingPanel(panelId);
  };

  return (
    <>
      {floatingPanels.map((panel) => {
        // Check if this is a dev-tool panel (format: "dev-tool:toolId")
        const isDevToolPanel = typeof panel.id === 'string' && panel.id.startsWith('dev-tool:');

        let Component: React.ComponentType<any>;
        let title: string;

        if (isDevToolPanel) {
          // Extract tool ID from panel ID
          const toolId = panel.id.slice('dev-tool:'.length);
          const devTool = devToolRegistry.get(toolId);

          Component = DevToolDynamicPanel;
          title = devTool?.label || toolId;
        } else {
          // Regular panel from registry
          const panelDef = panelRegistry.get(panel.id);
          if (!panelDef) return null;

          Component = panelDef.component;
          title = panelDef.title;
        }
        const dockedCubes = Object.values(cubes).filter(
          (cube) => cube.dockedToPanelId === panel.id
        );
        const dockedCount = dockedCubes.length;

        const handlePanelCubeClick = () => {
          // If there are docked cubes for this panel, bring them into focus
          if (dockedCount > 0) {
            dockedCubes.forEach((cube) => {
              updateCube(cube.id, { visible: true });
            });
            setActiveCube(dockedCubes[0].id);
            return;
          }

          // Otherwise, spawn a new panel cube at the panel's center and dock it
          const cubeSize = BASE_CUBE_SIZE;
          const centerX = panel.x + panel.width / 2 - cubeSize / 2;
          const centerY = panel.y + panel.height / 2 - cubeSize / 2;

          const cubeId = addCube('panel', { x: centerX, y: centerY });
          updateCube(cubeId, {
            mode: 'docked',
            dockedToPanelId: panel.id,
          });
          setActiveCube(cubeId);
        };

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
                parseInt(ref.style.height)
              );
              updateFloatingPanelPosition(panel.id, position.x, position.y);
            }}
            onMouseDown={() => bringFloatingPanelToFront(panel.id)}
            minWidth={300}
            minHeight={200}
            bounds="window"
            dragHandleClassName="floating-panel-header"
            // Use a high base z-index so floating panels appear above
            // other overlays like the Control Center dock (z-50).
            style={{ zIndex: 100 + panel.zIndex }}
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
                    onClick={handlePanelCubeClick}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-600"
                    title="Open or focus a cube for this panel"
                  >
                    Cube{dockedCount > 0 ? ` (${dockedCount})` : ''}
                  </button>
                  <button
                    onClick={() => handleMinimize(panel.id)}
                    className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-base leading-none"
                    title="Minimize to cube"
                  >
                    📦
                  </button>
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
                <Component {...(panel.context || {})} />
              </div>
            </div>
          </Rnd>
        );
      })}
    </>
  );
}
