import { useLayoutStore, type SplitNode } from '../../stores/layoutStore';
import { ResizableSplit } from './ResizableSplit';
import { PanelChrome } from './PanelChrome';
import { AssetsRoute } from '../../routes/Assets';
import { SceneBuilderPanel } from '../SceneBuilderPanel';
import { GraphPanelWithProvider } from '../GraphPanel';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { HealthPanel } from '../health/HealthPanel';
import { useEffect, useRef } from 'react';
import { previewBridge } from '../../lib/preview-bridge';

// Game iframe with preview bridge connection
function GameIframePanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = import.meta.env.VITE_GAME_URL || 'http://localhost:5174';

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

// Panel component registry
const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  p_gallery: AssetsRoute,
  p_scene: SceneBuilderPanel,
  p_graph: GraphPanelWithProvider,
  p_inspector: InspectorPanel,
  p_health: HealthPanel,
  p_game: GameIframePanel,
};

function renderPanel(panelId: string) {
  const Component = PANEL_COMPONENTS[panelId];
  if (Component) {
    return <Component />;
  }
  return <div className="p-3 text-sm text-neutral-500">Unknown panel {panelId}</div>;
}

function NodeRenderer({ node, path }: { node: SplitNode; path: number[] }) {
  const layout = useLayoutStore();
  const setRoot = useLayoutStore(s => s.setRoot);
  const save = useLayoutStore(s => s.save);
  if (node.kind === 'panel') {
    const p = layout.panels[node.panelId];
    return (
      <PanelChrome panelId={node.panelId} title={p?.title}>
        {renderPanel(node.panelId)}
      </PanelChrome>
    );
  }
  function updateSizes(next: number[]) {
    // Clone tree and apply new sizes at current path
    const cloned = structuredClone(layout.root);
    if (!cloned) return;
    let cursor: any = cloned;
    for (const idx of path) {
      cursor = cursor.children[idx];
    }
    if (cursor && cursor.kind === 'split') {
      cursor.sizes = next;
      setRoot(cloned as any);
      save();
    }
  }
  return (
    <ResizableSplit direction={node.direction} sizes={node.sizes} onSizesChange={updateSizes}>
      {node.children.map((child, i) => (
        <NodeRenderer key={i} node={child} path={[...path, i]} />
      ))}
    </ResizableSplit>
  );
}

export function DockLayout() {
  const root = useLayoutStore(s => s.root);
  if (!root) return <div className="p-4 text-sm text-neutral-500">No layout. Choose a preset.</div>;
  return <NodeRenderer node={root} path={[]} />;
}
