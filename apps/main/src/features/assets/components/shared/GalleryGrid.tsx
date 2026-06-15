import { type ReactNode, type RefObject, useRef } from 'react';

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
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const effectiveScrollRef = scrollParentRef ?? internalScrollRef;

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
    <div className={`flex flex-col min-h-0 ${className}`}>
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

      <div
        ref={internalScrollRef}
        className="flex-1 min-h-0 overflow-auto"
      >
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
    </div>
  );
}
