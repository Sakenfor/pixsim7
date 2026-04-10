/**
 * Nested hover-expand that lazy-loads source asset thumbnails from the
 * generation context.  Rendered inside the regenerate button's expand panel.
 * Uses a portal so the popup escapes parent stacking contexts.
 */

import { IconButton, useHoverExpand } from '@pixsim7/shared.ui';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { getAsset, getAssetGenerationContext } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import { fromAssetResponse, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared';

import type { OperationType } from '@/types/operations';

import { parseGenerationContext } from './mediaCardGeneration.utils';

export function SourceAssetsPreview({ assetId, operationType, addInput, onOpenAsset }: {
  assetId: number;
  operationType: OperationType;
  addInput: (opts: { asset: AssetModel; operationType: OperationType }) => void;
  onOpenAsset?: (asset: AssetModel, assetList?: AssetModel[]) => void;
}) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 200 });
  const [assets, setAssets] = useState<AssetModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  // Recalculate portal position when expanded
  useEffect(() => {
    if (isExpanded && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setPopupPos({ x: rect.right + 8, y: rect.top + rect.height / 2 });
    }
  }, [isExpanded]);

  // Fetch source assets on first expand
  useEffect(() => {
    if (!isExpanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    (async () => {
      try {
        const ctx = await getAssetGenerationContext(assetId);
        const { sourceAssetIds } = parseGenerationContext(ctx, operationType);
        if (sourceAssetIds.length === 0) {
          setAssets([]);
          return;
        }
        const results = await Promise.allSettled(
          sourceAssetIds.map((id) => getAsset(id)),
        );
        setAssets(
          results
            .map((r) => (r.status === 'fulfilled' ? fromAssetResponse(r.value) : null))
            .filter((a): a is AssetModel => !!a),
        );
      } catch {
        setAssets([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isExpanded, assetId, operationType]);

  return (
    <div className="relative" {...handlers} ref={rowRef}>
      <div className="w-36 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-b-xl transition-colors flex items-center gap-2 cursor-default">
        <Icon name="image" size={12} />
        <span className="flex-1">Source Assets</span>
        <Icon name="chevronRight" size={10} className="opacity-50" />
      </div>

      {isExpanded && popupPos && createPortal(
        <div
          className="fixed rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-white/10 p-1.5 z-popover"
          style={{ left: popupPos.x, top: popupPos.y, transform: 'translateY(-50%)' }}
          {...handlers}
        >
          {loading ? (
            <div className="flex items-center justify-center h-20 w-20">
              <Icon name="loader" size={14} className="animate-spin text-white/60" />
            </div>
          ) : assets && assets.length > 0 ? (
            <div className="flex gap-1.5">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="w-20 h-20 shrink-0"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onOpenAsset?.(asset, assets);
                  }}
                  title="Double-click to open in viewer"
                >
                  <CompactAssetCard
                    asset={asset}
                    hideFooter
                    aspectSquare
                    enableHoverPreview={asset.mediaType === 'video'}
                    showPlayOverlay={false}
                    hoverActions={
                      <div className="flex items-center gap-1">
                        <IconButton
                          size="lg"
                          rounded="full"
                          icon={<Icon name="zap" size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            addInput({ asset, operationType });
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                          style={{ color: '#fff' }}
                          title="Add to input"
                        />
                      </div>
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-2 py-1 text-[10px] text-white/40 whitespace-nowrap">
              No source assets
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
