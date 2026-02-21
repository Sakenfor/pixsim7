import { useEffect, useMemo, useRef, useState } from 'react';

export interface UsePagedItemsResult<T> {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  showPagination: boolean;
}

/**
 * Shared pagination hook for client-side item lists.
 *
 * Auto-resets to page 1 when the item count changes (e.g. after a filter)
 * and clamps `currentPage` to the valid range.
 */
export function usePagedItems<T>(items: T[], pageSize: number): UsePagedItemsResult<T> {
  const [rawPage, setRawPage] = useState(1);
  const prevLenRef = useRef(items.length);

  // Reset to page 1 when item count changes
  useEffect(() => {
    if (items.length !== prevLenRef.current) {
      prevLenRef.current = items.length;
      setRawPage(1);
    }
  }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(rawPage, totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    pageItems,
    currentPage,
    totalPages,
    setCurrentPage: setRawPage,
    showPagination: items.length > pageSize,
  };
}
