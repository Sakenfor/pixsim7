/**
 * DefaultLayerSidebar
 *
 * Auto-rendered by the viewer host when an overlay pushes layer state
 * to the shared overlayLayerStore. Collapsible — starts expanded,
 * can be toggled with a chevron.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import { LayerPanel } from './LayerPanel';
import { useOverlayLayerStore } from './overlayLayerStore';

export interface DefaultLayerSidebarProps {
  /** Optional per-layer extra content renderer (version nav, etc.).
   *  Overlays can pass this via the host or register it elsewhere. */
  renderLayerExtra?: (layer: { id: string; name: string; visible: boolean; opacity: number; hasContent: boolean }) => ReactNode;
}

export function DefaultLayerSidebar({ renderLayerExtra }: DefaultLayerSidebarProps) {
  const layers = useOverlayLayerStore((s) => s.layers);
  const activeLayerId = useOverlayLayerStore((s) => s.activeLayerId);
  const active = useOverlayLayerStore((s) => s.active);
  const selfManaged = useOverlayLayerStore((s) => s.selfManaged);
  const addLayer = useOverlayLayerStore((s) => s.addLayer);
  const removeLayer = useOverlayLayerStore((s) => s.removeLayer);
  const setActiveLayer = useOverlayLayerStore((s) => s.setActiveLayer);
  const toggleLayerVisibility = useOverlayLayerStore((s) => s.toggleLayerVisibility);
  const renameLayer = useOverlayLayerStore((s) => s.renameLayer);

  const [collapsed, setCollapsed] = useState(false);

  if (!active || selfManaged || layers.length === 0) return null;

  return (
    <div className="flex flex-col border-l border-neutral-200 dark:border-neutral-700 bg-surface">
      {/* Header with collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-th-secondary hover:bg-th/5 transition-colors"
      >
        <Icon name={collapsed ? 'chevronLeft' : 'chevronDown'} size={10} />
        <span>Layers</span>
        <span className="text-th-muted ml-auto">{layers.length}</span>
      </button>

      {!collapsed && (
        <div className="px-1.5 pb-2 w-36">
          <LayerPanel
            layers={layers}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayer}
            onToggleVisibility={toggleLayerVisibility}
            onRenameLayer={renameLayer}
            onAddLayer={addLayer}
            onRemoveLayer={removeLayer}
            renderLayerExtra={renderLayerExtra}
          />
        </div>
      )}
    </div>
  );
}
