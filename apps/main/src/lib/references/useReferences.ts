/**
 * useReferences — lazy-loaded reference items from all registered sources.
 *
 * Reads from `referenceRegistry` so any feature that registers itself
 * is automatically available in @mention pickers.
 */
import { useCallback, useState, useSyncExternalStore } from 'react';

import { referenceRegistry } from './registry';
import type { ReferenceItem } from './types';

export function useReferences() {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Re-render when sources are registered/unregistered
  useSyncExternalStore(
    referenceRegistry.subscribe.bind(referenceRegistry),
    referenceRegistry.getSnapshot.bind(referenceRegistry),
  );

  const load = useCallback(() => {
    if (loaded) return;
    setLoaded(true);
    const sources = referenceRegistry.getSources();
    Promise.all(sources.map((s) => s.fetch())).then((results) =>
      setItems(results.flat()),
    );
  }, [loaded]);

  /** Force reload (e.g. after new sources register) */
  const reload = useCallback(() => {
    setLoaded(false);
    setItems([]);
  }, []);

  return { items, load, reload };
}
