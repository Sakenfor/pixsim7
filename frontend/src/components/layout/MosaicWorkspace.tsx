import { useRef, useEffect, useState } from 'react';
import {
  Mosaic,
  MosaicWindow,
  getLeaves,
} from 'react-mosaic-component';
import type { MosaicNode, MosaicBranch } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { AssetsRoute } from '../../routes/Assets';
import { SceneBuilderPanel } from '../SceneBuilderPanel';
import { GraphPanelWithProvider } from '../GraphPanel';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { HealthPanel } from '../health/HealthPanel';
import { ProviderSettingsPanel } from '../provider/ProviderSettingsPanel';
import { previewBridge } from '../../lib/preview-bridge';
import { useWorkspaceStore, type PanelId } from '../../stores/workspaceStore';

// Game iframe with preview bridge connection
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

// Panel registry - store component types, not instances
const PANEL_MAP: Record<PanelId, { title: string; Component: React.ComponentType }> = {
  gallery: { title: 'Gallery', Component: AssetsRoute },
  scene: { title: 'Scene Builder', Component: SceneBuilderPanel },
  graph: { title: 'Graph', Component: GraphPanelWithProvider },
  inspector: { title: 'Inspector', Component: InspectorPanel },
  health: { title: 'Health', Component: HealthPanel },
  game: { title: 'Game', Component: GameIframePanel },
  providers: { title: 'Provider Settings', Component: ProviderSettingsPanel },
};

// Panel switcher dropdown component
function PanelSwitcher({
  currentId,
  onSwitch
}: {
  currentId: PanelId;
  onSwitch: (newId: PanelId) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="mosaic-default-control panel-switcher-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Switch panel type"
      >
        ⇄
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded shadow-lg z-20 min-w-[160px]">
            {(Object.keys(PANEL_MAP) as PanelId[]).map((panelId) => (
              <button
                key={panelId}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors ${
                  panelId === currentId
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-semibold'
                    : 'text-neutral-700 dark:text-neutral-300'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitch(panelId);
                  setIsOpen(false);
                }}
              >
                {PANEL_MAP[panelId].title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MosaicWorkspace() {
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);
  const setLayout = useWorkspaceStore((s) => s.setLayout);
  const closePanel = useWorkspaceStore((s) => s.closePanel);
  const fullscreenPanel = useWorkspaceStore((s) => s.fullscreenPanel);
  const setFullscreen = useWorkspaceStore((s) => s.setFullscreen);
  const isLocked = useWorkspaceStore((s) => s.isLocked);

  // Function to replace a panel in the layout tree
  const replacePanelInLayout = (
    node: MosaicNode<PanelId> | null,
    oldId: PanelId,
    newId: PanelId
  ): MosaicNode<PanelId> | null => {
    if (!node) return null;
    if (typeof node === 'string') {
      return node === oldId ? newId : node;
    }
    return {
      ...node,
      first: replacePanelInLayout(node.first, oldId, newId),
      second: replacePanelInLayout(node.second, oldId, newId),
    };
  };

  const handlePanelSwitch = (currentId: PanelId, newId: PanelId) => {
    if (currentId === newId || isLocked) return;
    const newLayout = replacePanelInLayout(currentLayout, currentId, newId);
    setLayout(newLayout);
  };

  const renderTile = (id: PanelId, path: MosaicBranch[]) => {
    const panel = PANEL_MAP[id];
    const { Component } = panel;

    // Handle fullscreen mode
    if (fullscreenPanel && fullscreenPanel !== id) {
      return null;
    }

    const isFullscreen = fullscreenPanel === id;

    return (
      <MosaicWindow<PanelId>
        path={path}
        title={panel.title}
        createNode={() => 'gallery'}
        additionalControls={[
          <PanelSwitcher
            key="switcher"
            currentId={id}
            onSwitch={(newId) => handlePanelSwitch(id, newId)}
          />,
          <button
            key="fullscreen"
            className="mosaic-default-control fullscreen-btn"
            onClick={() => setFullscreen(isFullscreen ? null : id)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? '⊡' : '□'}
          </button>
        ]}
      >
        <div className="h-full overflow-auto bg-white dark:bg-neutral-900">
          <Component />
        </div>
      </MosaicWindow>
    );
  };

  const onChange = (newNode: MosaicNode<PanelId> | null) => {
    // Track closed panels
    if (currentLayout && newNode) {
      const prevLeaves = getLeaves(currentLayout);
      const newLeaves = getLeaves(newNode);
      const closedIds = prevLeaves.filter((id) => !newLeaves.includes(id));
      closedIds.forEach((id) => closePanel(id));
    }

    setLayout(newNode);
  };

  // Override layout for fullscreen
  const displayLayout = fullscreenPanel ? fullscreenPanel : currentLayout;

  return (
    <div className="h-full w-full">
      <Mosaic<PanelId>
        renderTile={renderTile}
        value={displayLayout}
        onChange={onChange}
        className={`mosaic-blueprint-theme ${isLocked ? 'pointer-events-none' : ''}`}
      />
    </div>
  );
}
