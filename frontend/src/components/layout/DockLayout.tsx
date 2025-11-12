import { useLayoutStore, type SplitNode } from '../../stores/layoutStore';
import { ResizableSplit } from './ResizableSplit';
import { PanelChrome } from './PanelChrome';
import { AssetsRoute } from '../../routes/Assets';

function renderPanel(panelId: string) {
  // Simple registry mapping panel types to render functions
  // In the future, import actual panels: GalleryPanel, ScenePanel, etc.
  if (panelId === 'p_gallery') {
    return <AssetsRoute />;
  }
  if (panelId === 'p_scene') {
    return <div className="p-3 text-sm text-neutral-500">Scene Builder (placeholder)</div>;
  }
  return <div className="p-3 text-sm text-neutral-500">Unknown panel {panelId}</div>;
}

function NodeRenderer({ node }: { node: SplitNode }) {
  const layout = useLayoutStore();
  if (node.kind === 'panel') {
    const p = layout.panels[node.panelId];
    return (
      <PanelChrome panelId={node.panelId} title={p?.title}>
        {renderPanel(node.panelId)}
      </PanelChrome>
    );
  }
  return (
    <ResizableSplit direction={node.direction} sizes={node.sizes}>
      {node.children.map((child, i) => (
        <NodeRenderer key={i} node={child} />
      ))}
    </ResizableSplit>
  );
}

export function DockLayout() {
  const root = useLayoutStore(s => s.root);
  if (!root) return <div className="p-4 text-sm text-neutral-500">No layout. Choose a preset.</div>;
  return <NodeRenderer node={root} />;
}
