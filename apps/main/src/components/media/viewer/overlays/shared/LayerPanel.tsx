/**
 * LayerPanel — reusable layer list for any overlay that uses InteractionLayers.
 *
 * Renders layer list with:
 * - Active highlight + click to select
 * - Visibility toggle (eye icon)
 * - Double-click rename
 * - Content indicator dot
 * - +/- add/remove buttons
 * - Optional per-layer extra content slot (version nav, etc.)
 *
 * Used by: MaskOverlay, and available for AnnotationOverlay, PoseOverlay, etc.
 */
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import { Icon } from '@lib/icons';

// ── Types ─────────────────────────────────────────────────────────────

/** Minimal layer info shape — matches MaskLayerInfo and can work with any overlay. */
export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  hasContent: boolean;
}

export interface LayerPanelProps {
  layers: LayerInfo[];
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  /** Minimum layers to keep (disable remove when at this count). Default 1. */
  minLayers?: number;
  /** Optional extra content rendered below each layer row. */
  renderLayerExtra?: (layer: LayerInfo) => ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────

export function LayerPanel({
  layers,
  activeLayerId,
  onSelectLayer,
  onToggleVisibility,
  onRenameLayer,
  onAddLayer,
  onRemoveLayer,
  minLayers = 1,
  renderLayerExtra,
}: LayerPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleStartRename = useCallback((layer: LayerInfo) => {
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingLayerId && editName.trim()) {
      onRenameLayer(editingLayerId, editName.trim());
    }
    setEditingLayerId(null);
  }, [editingLayerId, editName, onRenameLayer]);

  return (
    <div className="flex flex-col gap-1">
      {/* Layer list */}
      <div className="flex flex-col gap-0.5">
        {layers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const isEditing = editingLayerId === layer.id;

          return (
            <div
              key={layer.id}
              className={`flex flex-col gap-0.5 px-1.5 py-1 rounded cursor-pointer transition-colors ${
                isActive
                  ? 'bg-accent/20 border border-accent/40'
                  : 'hover:bg-surface-elevated border border-transparent'
              }`}
              onClick={() => onSelectLayer(layer.id)}
            >
              <div className="flex items-center gap-1">
                {/* Visibility toggle */}
                <button
                  className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
                    layer.visible ? 'text-th-secondary' : 'text-th-muted opacity-40'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={11} />
                </button>

                {/* Layer name */}
                {isEditing ? (
                  <input
                    className="flex-1 min-w-0 bg-transparent border-b border-accent text-[11px] text-th-primary outline-none px-0.5"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishRename();
                      if (e.key === 'Escape') setEditingLayerId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={`flex-1 min-w-0 truncate text-[11px] ${
                      layer.visible ? 'text-th-secondary' : 'text-th-muted line-through'
                    }`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(layer);
                    }}
                    title={`${layer.name}${layer.hasContent ? '' : ' (empty)'}`}
                  >
                    {layer.name}
                  </span>
                )}

                {/* Content indicator */}
                {layer.hasContent && (
                  <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent/60" title="Has content" />
                )}
              </div>

              {/* Per-layer extra (version nav, etc.) */}
              {renderLayerExtra?.(layer)}
            </div>
          );
        })}
      </div>

      {/* + / - buttons */}
      <div className="flex items-center gap-1 px-0.5">
        <button
          onClick={onAddLayer}
          className="flex items-center justify-center w-7 h-6 rounded bg-th/10 hover:bg-th/15 text-th-secondary transition-colors"
          title="Add layer"
        >
          <Icon name="plus" size={12} />
        </button>
        <button
          onClick={() => activeLayerId && onRemoveLayer(activeLayerId)}
          disabled={layers.length <= minLayers}
          className="flex items-center justify-center w-7 h-6 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Remove active layer"
        >
          <Icon name="minus" size={12} />
        </button>
      </div>
    </div>
  );
}
