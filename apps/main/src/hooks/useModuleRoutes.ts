import { useState, useEffect, useMemo } from 'react';

import { moduleRegistry } from '@app/modules';
import type { PageCategory } from '@app/modules/types';

interface UseModuleRoutesOptions {
  /** Filter by category */
  category?: PageCategory;
  /** Only return featured pages */
  featured?: boolean;
  /** Include hidden pages (default: false) */
  includeHidden?: boolean;
}

/**
 * Reactive hook for module routes.
 *
 * Subscribes to the module registry and re-renders when modules are
 * registered. Only returns pages that have a component defined.
 */
export function useModuleRoutes(options?: UseModuleRoutesOptions) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return moduleRegistry.subscribe(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(
    () => moduleRegistry.getPages(options).filter((page) => page.component),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, options?.category, options?.featured, options?.includeHidden]
  );
}
