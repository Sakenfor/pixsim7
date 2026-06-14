
import { isPlayingPhase, type ScenePlaybackPhase } from '@pixsim7/game.engine';
import { useEffect, useMemo, useState } from 'react';

import {
  getNpcExpressions,
  type NpcExpressionDTO,
  type NpcPresenceDTO,
} from '@lib/api';
import type { Scene } from '@lib/registries';

import { fromAssetResponse, getAsset, getAssetDisplayUrls, type AssetModel } from '@features/assets';

import { useAuthenticatedMedia } from './useAuthenticatedMedia';

export interface UseNpcExpressionsOptions {
  /** Scene currently in playback. Drives portrait asset resolution. */
  currentScene: Scene | null;
  /** Whether the scene modal is open. Portrait shows only when open. */
  isSceneOpen: boolean;
  /** Current scene phase. Drives which expression is selected. */
  scenePhase: ScenePlaybackPhase | null;
  /** NPC presences at the current location — drives auto-select of active NPC. */
  locationNpcs: NpcPresenceDTO[];
}

export interface UseNpcExpressionsResult {
  /** Currently active NPC. Caller may set this directly (e.g., from location meta). */
  activeNpcId: number | null;
  setActiveNpcId: React.Dispatch<React.SetStateAction<number | null>>;
  /** Loaded expression DTOs for the active NPC. */
  npcExpressions: NpcExpressionDTO[];
  /** Currently resolved portrait asset (image or video). */
  npcPortraitAsset: AssetModel | null;
  /** Resolved displayable media URL for the portrait, after blob/URL resolution. */
  resolvedNpcPortraitSrc: string | null;
}

/**
 * Owns the active NPC + their expression library + the scene-phase-driven
 * portrait asset. Also auto-selects the active NPC when location presence
 * changes (preferring the first present NPC over any preset).
 */
export function useNpcExpressions(
  options: UseNpcExpressionsOptions,
): UseNpcExpressionsResult {
  const { currentScene, isSceneOpen, scenePhase, locationNpcs } = options;

  const [activeNpcId, setActiveNpcId] = useState<number | null>(null);
  const [npcExpressions, setNpcExpressions] = useState<NpcExpressionDTO[]>([]);
  const [npcPortraitAsset, setNpcPortraitAsset] = useState<AssetModel | null>(null);
  const [npcPortraitAssetId, setNpcPortraitAssetId] = useState<number | null>(null);

  // Auto-select the first present NPC whenever location presence changes.
  useEffect(() => {
    if (locationNpcs.length > 0) {
      setActiveNpcId(locationNpcs[0].npc_id);
    }
  }, [locationNpcs]);

  // Fetch expression library when the active NPC changes.
  useEffect(() => {
    if (!activeNpcId) {
      setNpcExpressions([]);
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const expressions = await getNpcExpressions(activeNpcId);
        if (cancelled) return;
        setNpcExpressions(expressions);
      } catch (e: unknown) {
        console.error('Failed to load NPC expressions', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeNpcId]);

  // Resolve the portrait asset from the current scene phase.
  useEffect(() => {
    if (!currentScene || !isSceneOpen || npcExpressions.length === 0) {
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }

    const match = selectNpcExpressionForPhase(npcExpressions, scenePhase);

    if (!match) {
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }

    if (npcPortraitAssetId === match.asset_id && npcPortraitAsset) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await getAsset(match.asset_id);
        if (cancelled) return;
        const asset = fromAssetResponse(response);
        if (asset.mediaType === 'image' || asset.mediaType === 'video') {
          setNpcPortraitAsset(asset);
          setNpcPortraitAssetId(match.asset_id);
        } else {
          setNpcPortraitAsset(null);
          setNpcPortraitAssetId(null);
        }
      } catch (e: unknown) {
        console.error('Failed to load NPC portrait asset', e);
        setNpcPortraitAsset(null);
        setNpcPortraitAssetId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentScene, isSceneOpen, scenePhase, npcExpressions, npcPortraitAssetId, npcPortraitAsset]);

  // Resolve the portrait asset's displayable URL.
  const npcPortraitUrls = useMemo(
    () => (npcPortraitAsset ? getAssetDisplayUrls(npcPortraitAsset) : null),
    [npcPortraitAsset],
  );
  const npcPortraitCandidate = npcPortraitUrls?.previewUrl || npcPortraitUrls?.mainUrl;
  const { src: resolvedNpcPortraitSrc } = useAuthenticatedMedia(npcPortraitCandidate);

  return {
    activeNpcId,
    setActiveNpcId,
    npcExpressions,
    npcPortraitAsset,
    resolvedNpcPortraitSrc: resolvedNpcPortraitSrc || null,
  };
}

function readNpcExpressionSurfaceType(expression: NpcExpressionDTO): string | null {
  const meta = expression.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const value = (meta as Record<string, unknown>).surfaceType;
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  return value.trim();
}

function selectNpcExpressionForPhase(
  expressions: NpcExpressionDTO[],
  phase: ScenePlaybackPhase | null,
): NpcExpressionDTO | null {
  if (expressions.length === 0) return null;

  const desiredState =
    phase === 'awaiting_input'
      ? 'waiting_for_player'
      : phase && isPlayingPhase(phase)
        ? 'talking'
        : 'idle';

  const desiredSurfaceType = phase && isPlayingPhase(phase) ? 'dialogue' : 'portrait';

  return (
    expressions.find(
      (entry) =>
        entry.state === desiredState &&
        readNpcExpressionSurfaceType(entry) === desiredSurfaceType,
    ) ||
    expressions.find((entry) => entry.state === desiredState) ||
    expressions.find(
      (entry) => readNpcExpressionSurfaceType(entry) === desiredSurfaceType,
    ) ||
    expressions.find(
      (entry) =>
        entry.state === 'idle' &&
        readNpcExpressionSurfaceType(entry) === desiredSurfaceType,
    ) ||
    expressions.find((entry) => entry.state === 'idle') ||
    expressions.find(
      (entry) => readNpcExpressionSurfaceType(entry) === 'portrait',
    ) ||
    expressions[0] ||
    null
  );
}
