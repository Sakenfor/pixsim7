import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { MasonryGrid } from '@/components/layout/MasonryGrid';

import { BottomPagination } from './BottomPagination';
import { LoadMoreSection } from './LoadMoreSection';
import { PaginationStrip } from './PaginationStrip';

export interface GalleryGridPaginationProps {
  currentPage: number;
  totalPages: number;
  hasMore?: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export interface GalleryGridLoadMoreProps {
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  mode?: 'button' | 'infinite';
  rootMargin?: string;
}

export interface GalleryGridProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string | number;

  layout?: 'masonry' | 'grid';
  cardSize?: number;
  rowGap?: number;
  columnGap?: number;

  pagination?: GalleryGridPaginationProps;
  loadMore?: GalleryGridLoadMoreProps;

  scrollParentRef?: RefObject<HTMLElement | null>;

  before?: ReactNode;
  after?: ReactNode;

  emptyState?: ReactNode;

  className?: string;
}

const DEFAULT_CARD_SIZE = 280;
const DEFAULT_GAP = 16;

/**
 * Walk up from `el` to the nearest scrollable ancestor. We virtualize against
 * whatever container actually scrolls (usually the surface shell), instead of
 * nesting our own `overflow-auto` scroller. A nested scroller inside the shell's
 * block-flow `overflow-y-auto` has no bounded height, so its `clientHeight`
 * collapses to ~0 — which makes MasonryGrid window every card out and render an
 * empty grid (the Signal Triage / Review "fetched but blank" bug).
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function GalleryGrid<T>({
  items,
  renderCard,
  getKey,
  layout = 'grid',
  cardSize = DEFAULT_CARD_SIZE,
  rowGap = DEFAULT_GAP,
  columnGap = DEFAULT_GAP,
  pagination,
  loadMore,
  scrollParentRef,
  before,
  after,
  emptyState,
  className = '',
}: GalleryGridProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Resolve the scroll container we virtualize against. An explicit prop wins;
  // otherwise we discover the nearest scrolling ancestor once mounted. Storing
  // the element in state (not just a ref) means the wrapper ref identity changes
  // when it's found, so MasonryGrid's scroll-tracking effects re-bind to the
  // real scroller instead of staying attached to `null` from first render.
  const [ancestorScrollEl, setAncestorScrollEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (scrollParentRef) return;
    setAncestorScrollEl(findScrollParent(rootRef.current));
  }, [scrollParentRef]);

  const ancestorScrollRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({ current: ancestorScrollEl }),
    [ancestorScrollEl],
  );
  const effectiveScrollRef = scrollParentRef ?? ancestorScrollRef;

  const isEmpty = items.length === 0;

  const renderedCards = items.map((item, index) => {
    const key = getKey ? getKey(item, index) : index;
    const node = renderCard(item, index);
    return (
      <div key={key} data-gallery-grid-item={index}>
        {node}
      </div>
    );
  });

  return (
    // Flow inside the surface shell's own scroller — no nested overflow
    // container. MasonryGrid below sizes itself (explicit height) so it occupies
    // real space and the shell scrolls normally.
    <div ref={rootRef} className={`flex flex-col min-h-0 ${className}`}>
      {pagination && (
        <div className="flex-shrink-0 mb-3">
          <PaginationStrip
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            hasMore={pagination.hasMore}
            loading={pagination.loading}
            onPageChange={pagination.onPageChange}
          />
        </div>
      )}

      {before}

      {isEmpty && emptyState ? (
        emptyState
      ) : (
        // Both layouts route through MasonryGrid's viewport virtualization so a
        // long scroll doesn't mount every card (unbounded decoded-image memory).
        // 'masonry' = staggered columns; 'grid' = aligned rows (old CSS-grid look).
        <MasonryGrid
          mode={layout === 'masonry' ? 'masonry' : 'grid'}
          items={renderedCards}
          rowGap={rowGap}
          columnGap={columnGap}
          minColumnWidth={cardSize}
          scrollParentRef={effectiveScrollRef}
        />
      )}

      {after}

      {pagination && (
        <BottomPagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          hasMore={pagination.hasMore}
          loading={pagination.loading}
          onPageChange={pagination.onPageChange}
        />
      )}

      {loadMore && (
        <LoadMoreSection
          hasMore={loadMore.hasMore}
          loading={loadMore.loading ?? false}
          onLoadMore={loadMore.onLoadMore}
          itemCount={items.length}
          mode={loadMore.mode ?? 'infinite'}
          rootMargin={loadMore.rootMargin}
        />
      )}
    </div>
  );
}
