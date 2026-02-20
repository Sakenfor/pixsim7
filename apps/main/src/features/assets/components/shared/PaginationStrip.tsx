import { PageJumpPopover } from '../PageJumpPopover';

export interface PaginationStripProps {
  currentPage: number;
  totalPages: number;
  hasMore?: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
  prevTitle?: string;
  nextTitle?: string;
}

export function PaginationStrip({
  currentPage,
  totalPages,
  hasMore,
  loading = false,
  onPageChange,
  prevTitle = 'Previous page',
  nextTitle = 'Next page',
}: PaginationStripProps) {
  const disablePrev = loading || currentPage <= 1;
  const disableNext = loading || (hasMore !== undefined ? !hasMore : currentPage >= totalPages);

  return (
    <div className="h-7 inline-flex items-center rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 overflow-hidden text-xs">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disablePrev}
        className="h-full w-6 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={prevTitle}
      >
        &lsaquo;
      </button>
      <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
      <PageJumpPopover
        currentPage={currentPage}
        totalPages={totalPages}
        hasMore={hasMore}
        loading={loading}
        onGoToPage={onPageChange}
        borderless
      />
      <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700" />
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disableNext}
        className="h-full w-6 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={nextTitle}
      >
        &rsaquo;
      </button>
    </div>
  );
}
