export interface BottomPaginationProps {
  currentPage: number;
  totalPages: number;
  hasMore?: boolean;
  loading?: boolean;
  onPageChange: (page: number) => void;
  label?: string;
}

export function BottomPagination({
  currentPage,
  totalPages,
  hasMore,
  loading = false,
  onPageChange,
  label = 'Page',
}: BottomPaginationProps) {
  const disablePrev = loading || currentPage <= 1;
  const disableNext = loading || (hasMore !== undefined ? !hasMore : currentPage >= totalPages);
  const pageDisplay = hasMore ? `${totalPages}+` : totalPages;

  return (
    <div className="pt-4 pb-8 flex justify-center">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disablePrev}
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        <span className="text-sm text-neutral-600 dark:text-neutral-400 px-2">
          {label} {currentPage} of {pageDisplay}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disableNext}
          className="px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
