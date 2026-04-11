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
 * Clamps `currentPage` to the valid range when the item count shrinks.
 * Does NOT hard-reset to page 1 on every length change — callers that
 * want a page-1 reset on filter changes should call `setCurrentPage(1)`.
 */
export function usePagedItems<T>(
  items: T[],
  pageSize: number,
  options?: { initialPage?: number },
): UsePagedItemsResult<T> {
  const [rawPage, setRawPage] = useState(options?.initialPage ?? 1);
  const prevLenRef = useRef(items.length);

  // Clamp page to valid range when item count shrinks.
  // We intentionally do NOT hard-reset to page 1 here — that would discard
  // the user's position whenever background data updates (upload status,
  // hash sync, etc.) cause a transient length change.
  useEffect(() => {
    if (items.length !== prevLenRef.current) {
      prevLenRef.current = items.length;
      const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
      setRawPage(prev => (prev > maxPage ? maxPage : prev));
    }
  }, [items.length, pageSize]);

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
