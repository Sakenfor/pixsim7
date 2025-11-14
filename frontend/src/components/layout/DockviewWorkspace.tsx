import { useRef, useEffect, useState } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import 'dockview/dist/styles.css';
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

// Panel registry
const PANEL_COMPONENTS: Record<PanelId, React.ComponentType> = {
  gallery: AssetsRoute,
  scene: SceneBuilderPanel,
  graph: GraphPanelWithProvider,
  inspector: InspectorPanel,
  health: HealthPanel,
  game: GameIframePanel,
  providers: ProviderSettingsPanel,
};

const PANEL_TITLES: Record<PanelId, string> = {
  gallery: 'Gallery',
  scene: 'Scene Builder',
  graph: 'Graph',
  inspector: 'Inspector',
  health: 'Health',
  game: 'Game',
  providers: 'Provider Settings',
};

// Wrapper for panels to provide data-panel-id
function PanelWrapper(props: IDockviewPanelProps<{ panelId: PanelId }>) {
  const { params } = props;
  const panelId = params?.panelId;

  if (!panelId) {
    return <div className="p-4 text-red-500">Error: No panel ID</div>;
  }

  const Component = PANEL_COMPONENTS[panelId];

  if (!Component) {
    return <div className="p-4 text-red-500">Unknown panel: {panelId}</div>;
  }

  return (
    <div className="h-full w-full overflow-auto bg-white dark:bg-neutral-900" data-panel-id={panelId}>
      <Component />
    </div>
  );
}

export function DockviewWorkspace() {
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const [isReady, setIsReady] = useState(false);

  const dockviewLayout = useWorkspaceStore((s) => s.dockviewLayout);
  const setDockviewLayout = useWorkspaceStore((s) => s.setDockviewLayout);
  const isLocked = useWorkspaceStore((s) => s.isLocked);

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    setIsReady(true);

    // Load saved layout or create default
    if (dockviewLayout) {
      try {
        event.api.fromJSON(dockviewLayout);
      } catch (error) {
        console.error('Failed to load layout:', error);
        createDefaultLayout(event.api);
      }
    } else {
      createDefaultLayout(event.api);
    }

    // Set locked state
    if (isLocked) {
      event.api.groups.forEach((group) => {
        group.locked = 'no-drop-target';
      });
    }
  };

  const createDefaultLayout = (api: DockviewReadyEvent['api']) => {
    // Create default layout similar to mosaic default
    api.addPanel({
      id: 'gallery-panel',
      component: 'panel',
      params: { panelId: 'gallery' as PanelId },
      title: PANEL_TITLES.gallery,
      position: { direction: 'left' },
    });

    api.addPanel({
      id: 'health-panel',
      component: 'panel',
      params: { panelId: 'health' as PanelId },
      title: PANEL_TITLES.health,
      position: { direction: 'below', referencePanel: 'gallery-panel' },
    });

    api.addPanel({
      id: 'graph-panel',
      component: 'panel',
      params: { panelId: 'graph' as PanelId },
      title: PANEL_TITLES.graph,
      position: { direction: 'right' },
    });

    api.addPanel({
      id: 'inspector-panel',
      component: 'panel',
      params: { panelId: 'inspector' as PanelId },
      title: PANEL_TITLES.inspector,
      position: { direction: 'right', referencePanel: 'graph-panel' },
    });

    api.addPanel({
      id: 'game-panel',
      component: 'panel',
      params: { panelId: 'game' as PanelId },
      title: PANEL_TITLES.game,
      position: { direction: 'below', referencePanel: 'inspector-panel' },
    });
  };

  // Save layout on changes
  useEffect(() => {
    if (!apiRef.current || !isReady) return;

    const disposable = apiRef.current.onDidLayoutChange(() => {
      if (apiRef.current) {
        const layout = apiRef.current.toJSON();
        setDockviewLayout(layout);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [isReady, setDockviewLayout]);

  // Update locked state
  useEffect(() => {
    if (!apiRef.current) return;

    apiRef.current.groups.forEach((group) => {
      if (isLocked) {
        group.locked = 'no-drop-target';
      } else {
        group.locked = false;
      }
    });
  }, [isLocked]);

  const components = {
    panel: PanelWrapper,
  };

  return (
    <div className="h-full w-full dockview-theme-dark">
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-dark"
        watermarkComponent={() => (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            Pixsim7 Workspace
          </div>
        )}
      />
    </div>
  );
}
