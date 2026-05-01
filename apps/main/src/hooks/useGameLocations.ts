import { useCallback, useEffect, useState } from 'react';

import type { GameLocationSummary } from '@lib/api';
import { resolveGameLocations } from '@lib/resolvers';

export interface UseGameLocationsOptions {
  /** Currently selected world. `null` returns the unscoped location list. */
  worldId: number | null;
  /** Optional location id sourced from URL params; used for initial selection. */
  initialLocationIdFromUrl?: number | null;
  /** Consumer label for the resolver (debugging / dedupe). */
  consumerId?: string;
}

export interface UseGameLocationsResult {
  locations: GameLocationSummary[];
  selectedLocationId: number | null;
  setSelectedLocationId: React.Dispatch<React.SetStateAction<number | null>>;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches the location list for a world and tracks the currently selected
 * location. Initial selection prefers a URL-sourced id (validated against the
 * fetched list), falls back to the previously selected location if it's still
 * present, and otherwise picks the first item.
 */
export function useGameLocations(
  options: UseGameLocationsOptions,
): UseGameLocationsResult {
  const { worldId, initialLocationIdFromUrl = null, consumerId = 'useGameLocations' } = options;

  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locs = await resolveGameLocations(
          worldId != null ? { worldId } : {},
          { consumerId },
        );
        if (cancelled) return;
        setLocations(locs);
        setSelectedLocationId((previousId) => {
          if (
            initialLocationIdFromUrl != null &&
            Number.isFinite(initialLocationIdFromUrl) &&
            locs.some((loc) => loc.id === initialLocationIdFromUrl)
          ) {
            return initialLocationIdFromUrl;
          }
          if (previousId != null && locs.some((loc) => loc.id === previousId)) {
            return previousId;
          }
          return locs[0]?.id ?? null;
        });
        setError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId, initialLocationIdFromUrl, consumerId, refreshKey]);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { locations, selectedLocationId, setSelectedLocationId, error, refetch };
}
