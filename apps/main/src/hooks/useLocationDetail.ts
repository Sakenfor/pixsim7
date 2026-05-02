import { useEffect, useState } from 'react';

import { getGameLocation, type GameLocationDetail } from '@lib/api';
import { LocationId as toLocationId } from '@pixsim7/shared.types';

export interface UseLocationDetailOptions {
  /** Selected location id. `null` clears the loaded detail. */
  locationId: number | null;
}

export interface UseLocationDetailResult {
  locationDetail: GameLocationDetail | null;
  /**
   * Exposed so callers (e.g., the room-navigation transition resolver) can
   * apply in-place updates to the detail without re-fetching.
   */
  setLocationDetail: React.Dispatch<React.SetStateAction<GameLocationDetail | null>>;
  isLoadingLocation: boolean;
  error: string | null;
}

/**
 * Loads a `GameLocationDetail` from the backend whenever `locationId`
 * changes. Owns the loaded detail, loading flag, and error string. The
 * setter is exposed so other hooks (room nav transitions) can apply
 * in-place updates without triggering a re-fetch.
 *
 * Side effects that need to fire only on a fresh load (e.g., resetting
 * room navigation, deriving the primary NPC from `meta`) belong at the
 * caller, keyed on `locationDetail?.id` rather than the object identity.
 */
export function useLocationDetail(
  options: UseLocationDetailOptions,
): UseLocationDetailResult {
  const { locationId } = options;

  const [locationDetail, setLocationDetail] = useState<GameLocationDetail | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLocationDetail(null);
      setIsLoadingLocation(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoadingLocation(true);
    setError(null);
    (async () => {
      try {
        const detail = await getGameLocation(toLocationId(locationId));
        if (cancelled) return;
        setLocationDetail(detail);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(String((e as Error)?.message ?? e));
      } finally {
        if (!cancelled) setIsLoadingLocation(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return { locationDetail, setLocationDetail, isLoadingLocation, error };
}
