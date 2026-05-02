import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GameLocationDetail } from '@lib/api';
import { getRoomNavigation } from '@lib/api/game';
import {
  buildRoomNavigationGizmoConfig,
  createRoomNavigationTraversalOptions,
  resolveRoomNavigationOptionFromGizmoResult,
  resolveRoomNavigationTransition,
  type ResolveRoomNavigationTransitionResult,
  type RoomNavigationTraversalOption,
} from '@lib/game/runtime';

import { fromAssetResponse, getAsset, type AssetModel } from '@features/assets';

export type RoomNavigationData = NonNullable<ReturnType<typeof getRoomNavigation>>;
export type RoomNavigationCheckpoint = RoomNavigationData['checkpoints'][number];
export type RoomNavControlMode = 'buttons' | 'gizmo';

export interface UseRoomNavigationOptions {
  /** Location currently being played; needed by the transition resolver. */
  locationDetail: GameLocationDetail | null;
  /** Whether a scene is loading; gizmo input is suppressed while true. */
  isLoadingScene: boolean;
  /**
   * Called when the transition resolver returns an updated location, so the
   * caller can sync its own `locationDetail` state.
   */
  onLocationUpdate?: (updatedLocation: GameLocationDetail) => void;
}

export interface UseRoomNavigationResult {
  // Navigation graph + selection
  roomNavigation: RoomNavigationData | null;
  activeRoomCheckpointId: string | null;
  setActiveRoomCheckpointId: React.Dispatch<React.SetStateAction<string | null>>;
  activeRoomCheckpoint: RoomNavigationCheckpoint | null;
  roomCheckpointNameById: Map<string, string>;
  roomTraversalOptions: RoomNavigationTraversalOption[];
  roomTraversalGizmoConfig: ReturnType<typeof buildRoomNavigationGizmoConfig>;

  // Background asset for the active checkpoint
  roomNavBackgroundAsset: AssetModel | null;
  roomNavBackgroundUrl: string | null;
  isLoadingRoomNavAsset: boolean;

  // Movement / transition state
  roomNavMoveLog: string[];
  isResolvingRoomNavTransition: boolean;
  lastRoomNavTransitionResult: ResolveRoomNavigationTransitionResult | null;

  // UI preferences
  roomNavControlMode: RoomNavControlMode;
  setRoomNavControlMode: React.Dispatch<React.SetStateAction<RoomNavControlMode>>;
  lastRoomNavGizmoSegmentId: string | null;

  /**
   * Sync internal state to a location. Pass `null` to reset everything.
   * Pass a `GameLocationDetail` to load its room navigation graph and pick
   * the start checkpoint.
   */
  syncFromLocation: (detail: GameLocationDetail | null) => void;

  /** Move to a checkpoint via a traversal option (resolves transition first). */
  handleRoomTraversalMove: (option: RoomNavigationTraversalOption) => Promise<void>;

  /** Gizmo callback — resolves a segment id into a traversal option then moves. */
  handleRoomTraversalGizmoResult: (segmentId: string | null | undefined) => void;
}

/**
 * Owns the entire room-navigation cluster: the navigation graph, the active
 * checkpoint, the per-checkpoint background asset, transition state, the
 * move log, and the control-mode (buttons vs gizmo) preference.
 *
 * Callers feed it `locationDetail` via `syncFromLocation` whenever they
 * (re)load a location, and the hook handles everything downstream.
 */
export function useRoomNavigation(
  options: UseRoomNavigationOptions,
): UseRoomNavigationResult {
  const { locationDetail, isLoadingScene, onLocationUpdate } = options;

  const [roomNavigation, setRoomNavigation] = useState<RoomNavigationData | null>(null);
  const [activeRoomCheckpointId, setActiveRoomCheckpointId] = useState<string | null>(null);
  const [roomNavBackgroundAsset, setRoomNavBackgroundAsset] = useState<AssetModel | null>(null);
  const [roomNavBackgroundUrl, setRoomNavBackgroundUrl] = useState<string | null>(null);
  const [isLoadingRoomNavAsset, setIsLoadingRoomNavAsset] = useState(false);
  const [roomNavMoveLog, setRoomNavMoveLog] = useState<string[]>([]);
  const [roomNavControlMode, setRoomNavControlMode] = useState<RoomNavControlMode>('buttons');
  const [lastRoomNavGizmoSegmentId, setLastRoomNavGizmoSegmentId] = useState<string | null>(null);
  const [isResolvingRoomNavTransition, setIsResolvingRoomNavTransition] = useState(false);
  const [lastRoomNavTransitionResult, setLastRoomNavTransitionResult] =
    useState<ResolveRoomNavigationTransitionResult | null>(null);

  // Reset gizmo segment whenever the active checkpoint changes — prevents
  // stale segment ids from re-firing on the same checkpoint.
  useEffect(() => {
    setLastRoomNavGizmoSegmentId(null);
  }, [activeRoomCheckpointId]);

  const roomCheckpointNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!roomNavigation) return map;
    roomNavigation.checkpoints.forEach((checkpoint) => {
      map.set(checkpoint.id, checkpoint.label || checkpoint.id);
    });
    return map;
  }, [roomNavigation]);

  const activeRoomCheckpoint = useMemo<RoomNavigationCheckpoint | null>(() => {
    if (!roomNavigation || !activeRoomCheckpointId) return null;
    return (
      roomNavigation.checkpoints.find((checkpoint) => checkpoint.id === activeRoomCheckpointId) ??
      null
    );
  }, [roomNavigation, activeRoomCheckpointId]);

  const roomTraversalOptions = useMemo(() => {
    if (!roomNavigation) return [];
    return createRoomNavigationTraversalOptions({
      navigation: roomNavigation,
      activeCheckpointId: activeRoomCheckpointId,
    });
  }, [roomNavigation, activeRoomCheckpointId]);

  const roomTraversalGizmoConfig = useMemo(
    () => buildRoomNavigationGizmoConfig(roomTraversalOptions, { style: 'orb' }),
    [roomTraversalOptions],
  );

  // Per-checkpoint background asset loader.
  useEffect(() => {
    if (!roomNavigation || !activeRoomCheckpointId) {
      setRoomNavBackgroundAsset(null);
      setRoomNavBackgroundUrl(null);
      setIsLoadingRoomNavAsset(false);
      return;
    }

    const checkpoint = roomNavigation.checkpoints.find(
      (row) => row.id === activeRoomCheckpointId,
    );
    if (!checkpoint) {
      setRoomNavBackgroundAsset(null);
      setRoomNavBackgroundUrl(null);
      setIsLoadingRoomNavAsset(false);
      return;
    }

    const source = parseCheckpointAssetRef(getCheckpointPrimaryAssetRef(checkpoint));
    if (!source) {
      setRoomNavBackgroundAsset(null);
      setRoomNavBackgroundUrl(null);
      setIsLoadingRoomNavAsset(false);
      return;
    }

    if (source.url) {
      setRoomNavBackgroundUrl(source.url);
      setRoomNavBackgroundAsset(null);
      setIsLoadingRoomNavAsset(false);
      return;
    }

    if (typeof source.assetId !== 'number') {
      setRoomNavBackgroundAsset(null);
      setRoomNavBackgroundUrl(null);
      setIsLoadingRoomNavAsset(false);
      return;
    }

    let cancelled = false;
    setIsLoadingRoomNavAsset(true);
    setRoomNavBackgroundUrl(null);
    setRoomNavBackgroundAsset(null);
    (async () => {
      try {
        const response = await getAsset(source.assetId);
        if (cancelled) return;
        const asset = fromAssetResponse(response);
        if (asset.mediaType === 'image' || asset.mediaType === 'video') {
          setRoomNavBackgroundAsset(asset);
        } else {
          setRoomNavBackgroundAsset(null);
        }
      } catch {
        if (!cancelled) {
          setRoomNavBackgroundAsset(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRoomNavAsset(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomNavigation, activeRoomCheckpointId]);

  const syncFromLocation = useCallback((detail: GameLocationDetail | null) => {
    if (!detail) {
      setRoomNavigation(null);
      setActiveRoomCheckpointId(null);
      setRoomNavBackgroundAsset(null);
      setRoomNavBackgroundUrl(null);
      setRoomNavMoveLog([]);
      setRoomNavControlMode('buttons');
      setLastRoomNavGizmoSegmentId(null);
      setIsResolvingRoomNavTransition(false);
      setLastRoomNavTransitionResult(null);
      return;
    }
    const nextRoomNavigation = getRoomNavigation(detail);
    setRoomNavigation(nextRoomNavigation);
    const initialCheckpointId =
      nextRoomNavigation?.start_checkpoint_id ??
      nextRoomNavigation?.checkpoints[0]?.id ??
      null;
    setActiveRoomCheckpointId(initialCheckpointId);
    setRoomNavBackgroundAsset(null);
    setRoomNavBackgroundUrl(null);
    setRoomNavMoveLog([]);
    setRoomNavControlMode('buttons');
    setLastRoomNavGizmoSegmentId(null);
    setIsResolvingRoomNavTransition(false);
    setLastRoomNavTransitionResult(null);
  }, []);

  const handleRoomTraversalMove = useCallback(
    async (option: RoomNavigationTraversalOption) => {
      if (!locationDetail || !roomNavigation || !activeRoomCheckpointId) {
        return;
      }

      const fromCheckpointId = activeRoomCheckpointId;
      let transitionStatusLabel = '';
      setIsResolvingRoomNavTransition(true);
      try {
        const transitionResult = await resolveRoomNavigationTransition({
          location: locationDetail,
          navigation: roomNavigation,
          fromCheckpointId,
          toCheckpointId: option.toCheckpointId,
          moveKind: option.moveKind,
          transitionProfile: option.transitionProfile,
          providerId: 'pixverse',
          onLocationUpdate: (updatedLocation) => {
            onLocationUpdate?.(updatedLocation);
            const updatedNavigation = getRoomNavigation(updatedLocation);
            if (updatedNavigation) {
              setRoomNavigation(updatedNavigation);
            }
          },
        });
        setLastRoomNavTransitionResult(transitionResult);
        transitionStatusLabel = ` [${transitionResult.status}]`;
      } catch (transitionError: unknown) {
        const message =
          transitionError instanceof Error
            ? transitionError.message
            : String(transitionError);
        setLastRoomNavTransitionResult({
          status: 'degraded_failed',
          cacheKey: '',
          message: `runtime transition resolver failed: ${message}`,
        });
        transitionStatusLabel = ' [degraded_failed]';
      } finally {
        setIsResolvingRoomNavTransition(false);
      }

      setActiveRoomCheckpointId(option.toCheckpointId);
      setRoomNavMoveLog((prev) =>
        [
          `${option.source}: ${fromCheckpointId} -> ${option.toCheckpointId}${transitionStatusLabel}`,
          ...prev,
        ].slice(0, 6),
      );
    },
    [locationDetail, roomNavigation, activeRoomCheckpointId, onLocationUpdate],
  );

  const handleRoomTraversalGizmoResult = useCallback(
    (segmentId: string | null | undefined) => {
      if (
        !segmentId ||
        segmentId === lastRoomNavGizmoSegmentId ||
        isResolvingRoomNavTransition ||
        isLoadingScene ||
        isLoadingRoomNavAsset
      ) {
        return;
      }

      const selectedOption = resolveRoomNavigationOptionFromGizmoResult(
        { segmentId },
        roomTraversalOptions,
      );
      if (!selectedOption) {
        return;
      }

      setLastRoomNavGizmoSegmentId(segmentId);
      void handleRoomTraversalMove(selectedOption);
    },
    [
      lastRoomNavGizmoSegmentId,
      isResolvingRoomNavTransition,
      isLoadingScene,
      isLoadingRoomNavAsset,
      roomTraversalOptions,
      handleRoomTraversalMove,
    ],
  );

  return {
    roomNavigation,
    activeRoomCheckpointId,
    setActiveRoomCheckpointId,
    activeRoomCheckpoint,
    roomCheckpointNameById,
    roomTraversalOptions,
    roomTraversalGizmoConfig,
    roomNavBackgroundAsset,
    roomNavBackgroundUrl,
    isLoadingRoomNavAsset,
    roomNavMoveLog,
    isResolvingRoomNavTransition,
    lastRoomNavTransitionResult,
    roomNavControlMode,
    setRoomNavControlMode,
    lastRoomNavGizmoSegmentId,
    syncFromLocation,
    handleRoomTraversalMove,
    handleRoomTraversalGizmoResult,
  };
}

function getCheckpointPrimaryAssetRef(
  checkpoint: RoomNavigationCheckpoint,
): string | undefined {
  if (checkpoint.view.kind === 'cylindrical_pano') {
    return checkpoint.view.pano_asset_id;
  }
  return (
    checkpoint.view.north_asset_id ||
    checkpoint.view.east_asset_id ||
    checkpoint.view.south_asset_id ||
    checkpoint.view.west_asset_id
  );
}

function parseCheckpointAssetRef(
  value: string | undefined,
): { assetId?: number; url?: string } | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return { assetId: Number(trimmed) };
  }
  if (/^asset:\d+$/i.test(trimmed)) {
    const parsed = Number(trimmed.split(':')[1]);
    if (Number.isFinite(parsed)) {
      return { assetId: parsed };
    }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  return null;
}
