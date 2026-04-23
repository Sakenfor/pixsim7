/**
 * Queue navigation pill + grid popup for MediaCard's picker contexts.
 *
 * Extracted from CompactAssetCard so MediaCard can host the same UI under
 * its `picker.queue` prop. Self-contains the popup state and edge-aware
 * portal positioning.
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';

import type { MediaCardQueueConfig } from './MediaCard';

interface PopupPosition {
  x: number;
  y: number;
  showAbove: boolean;
}

function QueueThumbnail({ url, alt }: { url: string; alt: string }) {
  const { mediaSrc } = useResolvedAssetMedia({ mediaUrl: url });
  return <img src={mediaSrc} alt={alt} className="w-full h-full object-cover" />;
}

export function MediaCardQueueNav({ queue }: { queue: MediaCardQueueConfig }) {
  const { currentIndex, totalCount, items, onPrev, onNext, onSelect } = queue;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [popupPos, setPopupPos] = useState<PopupPosition | null>(null);

  const handleToggleGrid = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showGrid) {
      setShowGrid(false);
      setPopupPos(null);
      return;
    }
    if (!triggerRef.current || !items) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const cols = items.length <= 4 ? 2 : items.length <= 9 ? 3 : 4;
    const rows = Math.ceil(items.length / cols);
    const popupWidth = cols * 80 + (cols - 1) * 6 + 16;
    const popupHeight = rows * 80 + (rows - 1) * 6 + 16;

    let x = rect.left + rect.width / 2;
    const minX = popupWidth / 2 + 8;
    const maxX = window.innerWidth - popupWidth / 2 - 8;
    x = Math.max(minX, Math.min(maxX, x));

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceAbove >= popupHeight + 8 || spaceAbove > spaceBelow;
    const y = showAbove ? rect.top - 8 : rect.bottom + 8;

    setPopupPos({ x, y, showAbove });
    setShowGrid(true);
  }, [showGrid, items]);

  if (totalCount <= 1) return null;

  const hasGrid = !!items && items.length > 1 && !!onSelect;

  return (
    <>
      <div className="cq-scale-down absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
          title="Previous"
        >
          {currentIndex}
        </button>

        {hasGrid ? (
          <button
            ref={triggerRef}
            onClick={handleToggleGrid}
            className="w-4 h-4 rounded-full bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
            title={`View all ${items!.length} assets`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          </button>
        ) : (
          <span className="text-white/60 text-[10px]">/</span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          className="text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
          title="Next"
        >
          {totalCount}
        </button>
      </div>

      {showGrid && popupPos && hasGrid && createPortal(
        <>
          <div
            className="fixed inset-0 z-modal-backdrop"
            onClick={() => { setShowGrid(false); setPopupPos(null); }}
          />
          <div
            className="fixed p-2 bg-neutral-900 rounded-lg shadow-2xl border border-neutral-600 z-popover"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${items!.length <= 4 ? 2 : items!.length <= 9 ? 3 : 4}, 80px)`,
              gap: '6px',
              left: popupPos.x,
              top: popupPos.showAbove ? undefined : popupPos.y,
              bottom: popupPos.showAbove ? window.innerHeight - popupPos.y : undefined,
              transform: 'translateX(-50%)',
            }}
          >
            {items!.map((item, idx) => {
              const isVirtualSlot = !item.thumbnailUrl;
              return (
                <button
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect!(idx);
                    setShowGrid(false);
                    setPopupPos(null);
                  }}
                  style={{ width: 80, height: 80, transition: 'none', animation: 'none' }}
                  className={`relative rounded-md overflow-hidden ${
                    idx === currentIndex - 1
                      ? 'ring-2 ring-accent'
                      : 'hover:ring-1 hover:ring-white/50'
                  } ${isVirtualSlot ? 'border border-dashed border-neutral-600 flex items-center justify-center' : ''}`}
                >
                  {isVirtualSlot ? (
                    <span className="text-neutral-400 text-lg font-light">+</span>
                  ) : (
                    <>
                      <QueueThumbnail url={item.thumbnailUrl} alt={`Asset ${idx + 1}`} />
                      <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded-tl font-medium">
                        {idx + 1}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
