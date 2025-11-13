import { Rnd } from 'react-rnd';
import { useWorkspaceStore, type PanelId } from '../../stores/workspaceStore';
import { AssetsRoute } from '../../routes/Assets';
import { SceneBuilderPanel } from '../SceneBuilderPanel';
import { GraphPanelWithProvider } from '../GraphPanel';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { HealthPanel } from '../health/HealthPanel';
import { ProviderSettingsPanel } from '../provider/ProviderSettingsPanel';
import { useRef, useEffect } from 'react';
import { previewBridge } from '../../lib/preview-bridge';

// Game iframe
function GameIframePanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = (import.meta as any).env.VITE_GAME_URL || 'http://localhost:5174';

  useEffect(() => {
    if (iframeRef.current) {
      previewBridge.setIframe(iframeRef.current);
    }
  }, []);

  return (
    <div className="w-full h-full">
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        title="Game Frontend"
      />
    </div>
  );
}

const PANEL_MAP: Record<PanelId, { title: string; Component: React.ComponentType }> = {
  gallery: { title: 'Gallery', Component: AssetsRoute },
  scene: { title: 'Scene Builder', Component: SceneBuilderPanel },
  graph: { title: 'Graph', Component: GraphPanelWithProvider },
  inspector: { title: 'Inspector', Component: InspectorPanel },
  health: { title: 'Health', Component: HealthPanel },
  game: { title: 'Game', Component: GameIframePanel },
  providers: { title: 'Provider Settings', Component: ProviderSettingsPanel },
};

export function FloatingPanelsManager() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);
  const updateFloatingPanelPosition = useWorkspaceStore((s) => s.updateFloatingPanelPosition);
  const updateFloatingPanelSize = useWorkspaceStore((s) => s.updateFloatingPanelSize);
  const bringFloatingPanelToFront = useWorkspaceStore((s) => s.bringFloatingPanelToFront);

  return (
    <>
      {floatingPanels.map((panel) => {
        const panelInfo = PANEL_MAP[panel.id];
        if (!panelInfo) return null;

        const { Component, title } = panelInfo;

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
            style={{ zIndex: panel.zIndex }}
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
                <button
                  onClick={() => closeFloatingPanel(panel.id)}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Close floating panel"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                <Component />
              </div>
            </div>
          </Rnd>
        );
      })}
    </>
  );
}
