/**
 * Queue navigation pill + grid popup for MediaCard's picker contexts.
 *
 * Extracted from CompactAssetCard so MediaCard can host the same UI under
 * its `picker.queue` prop. Self-contains the popup state and edge-aware
 * portal positioning.
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

import type { MediaCardQueueConfig } from './MediaCard';
import { WalkChevron } from './walkNavControls';

interface PopupPosition {
  x: number;
  y: number;
  showAbove: boolean;
}

function QueueThumbnail({ url, alt }: { url: string; alt: string }) {
  const { src: mediaSrc } = useAuthenticatedMedia(url);
  return <img src={mediaSrc} alt={alt} className="w-full h-full object-cover" />;
}

export function MediaCardQueueNav({
  queue,
  embedded = false,
  variant = 'arrows',
  scrubHint,
}: {
  queue: MediaCardQueueConfig;
  /**
   * Render just the stepper buttons without the absolute bottom-center
   * positioning / pill background, for embedding inside a parent bar (e.g.
   * the mobile CarouselMobileNavBar). The parent supplies the background.
   */
  embedded?: boolean;
  /**
   * 'arrows' (default): the index/total numbers double as prev/next buttons.
   * 'counter': render only the "current/total" label (which opens the grid
   * popup) — for the two-row mobile bar where the parent supplies the
   * dedicated ‹/› chevrons.
   */
  variant?: 'arrows' | 'counter';
  /**
   * Counter-variant only. When set, flank the count with green up/down
   * chevrons (clickable for slot prev/next). Same shape as CohortPill's
   * scrollHint: `dir` + `tick` drive a one-shot bounce animation on the
   * chevron matching the last commit direction.
   */
  scrubHint?: {
    dir: 'prev' | 'next' | null;
    tick: number;
    onPrev?: () => void;
    onNext?: () => void;
  };
}) {
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

  const wrapperClass = embedded
    ? 'flex items-center gap-0'
    : 'cq-scale-down absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 z-20';

  const counterLabel = (
    <>
      {currentIndex}
      <span className="text-white/50 mx-px">/</span>
      {totalCount}
    </>
  );

  return (
    <>
      <div className={wrapperClass}>
        {variant === 'counter' ? (
          (() => {
            const countEl = hasGrid ? (
              <button
                ref={triggerRef}
                onClick={handleToggleGrid}
                className="flex items-center text-white/90 hover:text-white transition-colors text-[11px] font-medium px-1"
                title={`View all ${items!.length} assets`}
              >
                {counterLabel}
              </button>
            ) : (
              <span className="flex items-center text-white/90 text-[11px] font-medium px-1">
                {counterLabel}
              </span>
            );
            if (!scrubHint) return countEl;
            const handleSlotPrev = (e: React.MouseEvent) => {
              e.stopPropagation();
              scrubHint.onPrev?.();
            };
            const handleSlotNext = (e: React.MouseEvent) => {
              e.stopPropagation();
              scrubHint.onNext?.();
            };
            return (
              <span className="flex flex-col items-center leading-none">
                <WalkChevron
                  dir="prev"
                  onClick={handleSlotPrev}
                  disabled={!scrubHint.onPrev}
                  lastDir={scrubHint.dir}
                  tick={scrubHint.tick}
                  title="Previous asset (pool)"
                  ariaLabel="Previous asset"
                  disabledOpacityClass="disabled:opacity-30"
                />
                {countEl}
                <WalkChevron
                  dir="next"
                  onClick={handleSlotNext}
                  disabled={!scrubHint.onNext}
                  lastDir={scrubHint.dir}
                  tick={scrubHint.tick}
                  title="Next asset (pool)"
                  ariaLabel="Next asset"
                  disabledOpacityClass="disabled:opacity-30"
                />
              </span>
            );
          })()
        ) : (
          <>
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
          </>
        )}
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
