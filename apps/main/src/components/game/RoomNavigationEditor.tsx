import type {
  RoomCheckpointViewKind,
  RoomEdgeMoveKind,
  RoomHotspotAction,
  RoomNavigationValidationIssue,
} from '@pixsim7/shared.types';
import {
  IDs,
  ROOM_NAVIGATION_META_KEY,
  validateRoomNavigation,
} from '@pixsim7/shared.types';
import { Button, Input, Panel, Select } from '@pixsim7/shared.ui';
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';

import type { GameLocationDetail } from '@lib/api/game';
import {
  getRoomNavigation,
  saveGameLocationMeta,
  setRoomNavigation,
} from '@lib/api/game';
import {
  ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY,
  resolveRoomNavigationTransition,
  type ResolveRoomNavigationTransitionResult,
} from '@lib/game/runtime/roomNavigationTransitions';

import {
  addRoomCheckpoint,
  addRoomEdge,
  addRoomHotspot,
  createDefaultRoomNavigation,
  removeRoomCheckpoint,
  removeRoomEdge,
  removeRoomHotspot,
  renameRoomCheckpointId,
  type RoomNavigationData,
} from './roomNavigationEditorModel';

interface RoomNavigationEditorProps {
  location: GameLocationDetail;
  onLocationUpdate: (location: GameLocationDetail) => void;
}

type DirectionKey = 'north' | 'east' | 'south' | 'west';

const VIEW_KINDS: RoomCheckpointViewKind[] = ['cylindrical_pano', 'quad_directions'];
const MOVE_KINDS: RoomEdgeMoveKind[] = ['forward', 'turn_left', 'turn_right', 'door', 'custom'];
const HOTSPOT_ACTIONS: RoomHotspotAction[] = ['move', 'inspect', 'interact'];
const DIRECTIONS: DirectionKey[] = ['north', 'east', 'south', 'west'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const yawForDirection = (direction: DirectionKey): number => {
  switch (direction) {
    case 'north':
      return 0;
    case 'east':
      return 90;
    case 'south':
      return 180;
    case 'west':
      return -90;
    default:
      return 0;
  }
};

const directionFromYaw = (yaw: number): DirectionKey => {
  const normalized = ((yaw % 360) + 360) % 360;
  if (normalized >= 315 || normalized < 45) {
    return 'north';
  }
  if (normalized >= 45 && normalized < 135) {
    return 'east';
  }
  if (normalized >= 135 && normalized < 225) {
    return 'south';
  }
  return 'west';
};

const nextDirection = (direction: DirectionKey, turn: 'left' | 'right'): DirectionKey => {
  const index = DIRECTIONS.indexOf(direction);
  const delta = turn === 'left' ? -1 : 1;
  const nextIndex = (index + delta + DIRECTIONS.length) % DIRECTIONS.length;
  return DIRECTIONS[nextIndex];
};

const readValidationIssuesFromError = (error: unknown): RoomNavigationValidationIssue[] => {
  const maybeError = error as {
    response?: {
      data?: {
        detail?: {
          details?: Array<{ path?: unknown; message?: unknown }>;
        };
      };
    };
  };
  const details = maybeError.response?.data?.detail?.details;
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .filter(
      (item): item is { path: string; message: string } =>
        typeof item.path === 'string' && typeof item.message === 'string',
    )
    .map((item) => ({ path: item.path, message: item.message }));
};

export function RoomNavigationEditor({ location, onLocationUpdate }: RoomNavigationEditorProps) {
  const [navigation, setNavigation] = useState<RoomNavigationData>(() =>
    createDefaultRoomNavigation(location.id),
  );
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [viewerYaw, setViewerYaw] = useState(0);
  const [viewerPitch, setViewerPitch] = useState(0);
  const [viewerDirection, setViewerDirection] = useState<DirectionKey>('north');
  const [traversalLog, setTraversalLog] = useState<string[]>([]);
  const [transitionProviderId, setTransitionProviderId] = useState('pixverse');
  const [isResolvingTransition, setIsResolvingTransition] = useState(false);
  const [lastTransitionResult, setLastTransitionResult] =
    useState<ResolveRoomNavigationTransitionResult | null>(null);
  const [lastTraversalSelection, setLastTraversalSelection] = useState<{
    source: string;
    fromCheckpointId: string;
    toCheckpointId: string;
    edgeId?: string;
    hotspotId?: string;
    moveKind?: RoomEdgeMoveKind;
    transitionProfile?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<RoomNavigationValidationIssue[]>([]);

  useEffect(() => {
    const payload = (location.meta as Record<string, unknown> | null | undefined)?.[
      ROOM_NAVIGATION_META_KEY
    ];
    if (!payload) {
      const nextNavigation = createDefaultRoomNavigation(location.id);
      setNavigation(nextNavigation);
      setSelectedCheckpointId(nextNavigation.start_checkpoint_id ?? null);
      setActiveCheckpointId(nextNavigation.start_checkpoint_id ?? null);
      setTraversalLog([]);
      setLastTransitionResult(null);
      setLastTraversalSelection(null);
      setIsResolvingTransition(false);
      setValidationIssues([]);
      setError(null);
      return;
    }

    const parsed = validateRoomNavigation(payload);
    if (parsed.ok) {
      setNavigation(parsed.data);
      const initialCheckpointId = parsed.data.start_checkpoint_id ?? parsed.data.checkpoints[0]?.id ?? null;
      setSelectedCheckpointId(initialCheckpointId);
      setActiveCheckpointId(initialCheckpointId);
      setTraversalLog([]);
      setLastTransitionResult(null);
      setLastTraversalSelection(null);
      setIsResolvingTransition(false);
      setValidationIssues([]);
      setError(null);
      return;
    }

    const fallbackNavigation = createDefaultRoomNavigation(location.id);
    setNavigation(fallbackNavigation);
    setSelectedCheckpointId(null);
    setActiveCheckpointId(null);
    setTraversalLog([]);
    setLastTransitionResult(null);
    setLastTraversalSelection(null);
    setIsResolvingTransition(false);
    setValidationIssues(parsed.issues);
    setError(`Loaded invalid room_navigation data (${parsed.issues.length} issue(s)).`);
  }, [location.id, location.meta]);

  useEffect(() => {
    if (navigation.checkpoints.length === 0) {
      if (selectedCheckpointId !== null) {
        setSelectedCheckpointId(null);
      }
      if (activeCheckpointId !== null) {
        setActiveCheckpointId(null);
      }
      return;
    }

    if (
      !selectedCheckpointId ||
      !navigation.checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)
    ) {
      setSelectedCheckpointId(
        navigation.start_checkpoint_id ?? navigation.checkpoints[0]?.id ?? null,
      );
    }

    if (
      !activeCheckpointId ||
      !navigation.checkpoints.some((checkpoint) => checkpoint.id === activeCheckpointId)
    ) {
      setActiveCheckpointId(
        navigation.start_checkpoint_id ?? navigation.checkpoints[0]?.id ?? null,
      );
    }
  }, [navigation.checkpoints, navigation.start_checkpoint_id, selectedCheckpointId, activeCheckpointId]);

  const selectedCheckpoint = useMemo(
    () =>
      selectedCheckpointId
        ? navigation.checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null
        : null,
    [navigation.checkpoints, selectedCheckpointId],
  );

  const activeCheckpoint = useMemo(
    () =>
      activeCheckpointId
        ? navigation.checkpoints.find((checkpoint) => checkpoint.id === activeCheckpointId) ?? null
        : null,
    [navigation.checkpoints, activeCheckpointId],
  );

  useEffect(() => {
    if (!activeCheckpoint) {
      return;
    }
    const yaw = activeCheckpoint.view.yaw_default ?? 0;
    const pitch = activeCheckpoint.view.pitch_default ?? 0;
    setViewerYaw(yaw);
    setViewerPitch(pitch);
    setViewerDirection(directionFromYaw(yaw));
  }, [activeCheckpoint]);

  const activeEdges = useMemo(
    () =>
      activeCheckpoint
        ? navigation.edges.filter((edge) => edge.from_checkpoint_id === activeCheckpoint.id)
        : [],
    [navigation.edges, activeCheckpoint],
  );

  const activeMoveHotspots = useMemo(
    () =>
      activeCheckpoint
        ? activeCheckpoint.hotspots.filter(
            (hotspot) => hotspot.action === 'move' && !!hotspot.target_checkpoint_id,
          )
        : [],
    [activeCheckpoint],
  );

  const updateCheckpoint = (
    checkpointId: string,
    updater: (
      checkpoint: RoomNavigationData['checkpoints'][number],
    ) => RoomNavigationData['checkpoints'][number],
  ) => {
    setNavigation((prev) => ({
      ...prev,
      checkpoints: prev.checkpoints.map((checkpoint) =>
        checkpoint.id === checkpointId ? updater(checkpoint) : checkpoint,
      ),
    }));
  };

  const renameCheckpointId = (checkpointId: string, rawNextId: string) => {
    let renamedId: string | null = null;
    setNavigation((prev) => {
      const result = renameRoomCheckpointId(prev, checkpointId, rawNextId);
      renamedId = result.renamed ? result.nextId : null;
      return result.navigation;
    });

    if (renamedId && selectedCheckpointId === checkpointId) {
      setSelectedCheckpointId(renamedId);
    }
    if (renamedId && activeCheckpointId === checkpointId) {
      setActiveCheckpointId(renamedId);
    }
  };

  const addCheckpoint = () => {
    let createdId: string | null = null;
    setNavigation((prev) => {
      const result = addRoomCheckpoint(prev);
      createdId = result.checkpointId;
      return result.navigation;
    });
    if (createdId) {
      setSelectedCheckpointId(createdId);
      setActiveCheckpointId(createdId);
    }
  };

  const removeCheckpoint = (checkpointId: string) => {
    setNavigation((prev) => removeRoomCheckpoint(prev, checkpointId));
  };

  const addHotspot = () => {
    if (!selectedCheckpoint) {
      return;
    }
    setNavigation((prev) => addRoomHotspot(prev, selectedCheckpoint.id).navigation);
  };

  const updateHotspot = (
    hotspotIndex: number,
    updater: (
      hotspot: RoomNavigationData['checkpoints'][number]['hotspots'][number],
    ) => RoomNavigationData['checkpoints'][number]['hotspots'][number],
  ) => {
    if (!selectedCheckpoint) {
      return;
    }
    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
      ...checkpoint,
      hotspots: checkpoint.hotspots.map((hotspot, index) =>
        index === hotspotIndex ? updater(hotspot) : hotspot,
      ),
    }));
  };

  const removeHotspot = (hotspotIndex: number) => {
    if (!selectedCheckpoint) {
      return;
    }
    setNavigation((prev) =>
      removeRoomHotspot(prev, selectedCheckpoint.id, hotspotIndex),
    );
  };

  const addEdge = () => {
    setNavigation((prev) => addRoomEdge(prev, selectedCheckpointId).navigation);
  };

  const updateEdge = (
    edgeIndex: number,
    patch: Partial<RoomNavigationData['edges'][number]>,
  ) => {
    setNavigation((prev) => ({
      ...prev,
      edges: prev.edges.map((edge, index) =>
        index === edgeIndex ? { ...edge, ...patch } : edge,
      ),
    }));
  };

  const removeEdge = (edgeIndex: number) => {
    setNavigation((prev) => removeRoomEdge(prev, edgeIndex));
  };

  const moveToCheckpoint = async (
    targetCheckpointId: string,
    source: string,
    options?: {
      moveKind: RoomEdgeMoveKind;
      transitionProfile?: string;
      edgeId?: string;
      hotspotId?: string;
    },
  ) => {
    if (!activeCheckpoint) {
      return;
    }
    const sourceCheckpoint = activeCheckpoint;
    const target = navigation.checkpoints.find(
      (checkpoint) => checkpoint.id === targetCheckpointId,
    );
    if (!target) {
      return;
    }

    let transitionStatusLabel = '';
    if (options) {
      setIsResolvingTransition(true);
      try {
        const transitionResult = await resolveRoomNavigationTransition({
          location,
          navigation,
          fromCheckpointId: sourceCheckpoint.id,
          toCheckpointId: targetCheckpointId,
          moveKind: options.moveKind,
          transitionProfile: options.transitionProfile,
          providerId: transitionProviderId,
          onLocationUpdate,
        });
        setLastTransitionResult(transitionResult);
        transitionStatusLabel = ` [${transitionResult.status}]`;
      } catch (transitionError: unknown) {
        const message =
          transitionError instanceof Error
            ? transitionError.message
            : String(transitionError);
        setLastTransitionResult({
          status: 'degraded_failed',
          cacheKey: '',
          message: `transition resolver failed: ${message}`,
        });
        transitionStatusLabel = ' [degraded_failed]';
      } finally {
        setIsResolvingTransition(false);
      }
    }

    setActiveCheckpointId(targetCheckpointId);
    setLastTraversalSelection({
      source,
      fromCheckpointId: sourceCheckpoint.id,
      toCheckpointId: targetCheckpointId,
      edgeId: options?.edgeId,
      hotspotId: options?.hotspotId,
      moveKind: options?.moveKind,
      transitionProfile: options?.transitionProfile,
    });
    setTraversalLog((prev) => [
      `${source}: ${sourceCheckpoint.id} -> ${targetCheckpointId}${transitionStatusLabel}`,
      ...prev,
    ].slice(0, 8));
  };

  const onYawChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextYaw = Number(event.target.value);
    if (!Number.isFinite(nextYaw)) {
      return;
    }
    setViewerYaw(nextYaw);
    setViewerDirection(directionFromYaw(nextYaw));
  };

  const onPitchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPitch = Number(event.target.value);
    if (!Number.isFinite(nextPitch)) {
      return;
    }
    setViewerPitch(nextPitch);
  };

  const onViewerCheckpointChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    if (!nextId) {
      return;
    }
    setActiveCheckpointId(nextId);
  };

  const turnViewer = (turn: 'left' | 'right') => {
    const next = nextDirection(viewerDirection, turn);
    setViewerDirection(next);
    setViewerYaw(yawForDirection(next));
  };

  const handleSave = async () => {
    setError(null);

    const localValidation = validateRoomNavigation(navigation);
    if (!localValidation.ok) {
      setValidationIssues(localValidation.issues);
      setError(`Room navigation has ${localValidation.issues.length} validation issue(s).`);
      return;
    }

    setValidationIssues([]);
    setIsSaving(true);

    try {
      const updatedLocation = setRoomNavigation(location, localValidation.data);
      const savedLocation = await saveGameLocationMeta(
        location.id as IDs.LocationId,
        updatedLocation.meta || {},
      );
      onLocationUpdate(savedLocation);
      const savedNavigation = getRoomNavigation(savedLocation) ?? localValidation.data;
      setNavigation(savedNavigation);
    } catch (saveError: unknown) {
      const backendIssues = readValidationIssuesFromError(saveError);
      if (backendIssues.length > 0) {
        setValidationIssues(backendIssues);
        setError(`Backend rejected room navigation (${backendIssues.length} issue(s)).`);
      } else {
        const message =
          saveError instanceof Error ? saveError.message : String(saveError);
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const checkpointNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const checkpoint of navigation.checkpoints) {
      map.set(checkpoint.id, checkpoint.label || checkpoint.id);
    }
    return map;
  }, [navigation.checkpoints]);

  const activeAssetLabel = useMemo(() => {
    if (!activeCheckpoint) {
      return 'No checkpoint selected';
    }
    if (activeCheckpoint.view.kind === 'cylindrical_pano') {
      return activeCheckpoint.view.pano_asset_id
        ? `pano_asset_id: ${activeCheckpoint.view.pano_asset_id}`
        : 'Missing pano_asset_id';
    }
    const key = `${viewerDirection}_asset_id` as const;
    const directionalAssetId = activeCheckpoint.view[key];
    return directionalAssetId
      ? `${key}: ${directionalAssetId}`
      : `Missing ${key}`;
  }, [activeCheckpoint, viewerDirection]);

  const transitionCacheSnapshot = useMemo(() => {
    const cachePayload = (location.meta as Record<string, unknown> | null | undefined)?.[
      ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY
    ];
    if (!isRecord(cachePayload)) {
      return {
        totalEntries: 0,
        completedEntries: 0,
        pendingEntries: 0,
        failedEntries: 0,
        activeCacheEntry: null as Record<string, unknown> | null,
      };
    }

    const entriesRaw = cachePayload.entries;
    if (!isRecord(entriesRaw)) {
      return {
        totalEntries: 0,
        completedEntries: 0,
        pendingEntries: 0,
        failedEntries: 0,
        activeCacheEntry: null as Record<string, unknown> | null,
      };
    }

    const entryValues = Object.values(entriesRaw).filter(isRecord);
    let completedEntries = 0;
    let pendingEntries = 0;
    let failedEntries = 0;
    entryValues.forEach((entry) => {
      if (entry.status === 'completed') {
        completedEntries += 1;
      } else if (entry.status === 'pending') {
        pendingEntries += 1;
      } else if (entry.status === 'failed') {
        failedEntries += 1;
      }
    });

    const activeCacheEntry =
      lastTransitionResult?.cacheKey &&
      isRecord(entriesRaw[lastTransitionResult.cacheKey])
        ? (entriesRaw[lastTransitionResult.cacheKey] as Record<string, unknown>)
        : null;

    return {
      totalEntries: entryValues.length,
      completedEntries,
      pendingEntries,
      failedEntries,
      activeCacheEntry,
    };
  }, [location.meta, lastTransitionResult?.cacheKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Room Navigation (Beta)</h2>
          <p className="text-xs text-neutral-500">
            Stored in <code>meta.room_navigation</code> for this location.
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Room Navigation'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {validationIssues.length > 0 && (
        <Panel className="space-y-2 border-red-300 dark:border-red-800">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
            Validation issues ({validationIssues.length})
          </h3>
          <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
            {validationIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
          {validationIssues.length > 8 && (
            <p className="text-xs text-red-700 dark:text-red-300">
              +{validationIssues.length - 8} more issue(s)
            </p>
          )}
        </Panel>
      )}

      <Panel className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Traversal Preview (Phase 3/4)</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Provider
            </label>
            <Input
              size="sm"
              value={transitionProviderId}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setTransitionProviderId(event.target.value)
              }
              placeholder="pixverse"
            />
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Current checkpoint
            </label>
            <Select
              size="sm"
              value={activeCheckpointId ?? ''}
              onChange={onViewerCheckpointChange}
            >
              <option value="">(none)</option>
              {navigation.checkpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>
                  {checkpoint.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!activeCheckpoint ? (
          <div className="h-56 rounded border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center">
            <p className="text-sm text-neutral-500">
              Add checkpoints to preview traversal.
            </p>
          </div>
        ) : (
          <>
            <div className="relative w-full aspect-video rounded overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-neutral-950 text-neutral-100">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    activeCheckpoint.view.kind === 'cylindrical_pano'
                      ? 'radial-gradient(circle at center, #1f2937 0%, #0f172a 55%, #020617 100%)'
                      : 'linear-gradient(135deg, #1f2937 0%, #0f172a 60%, #111827 100%)',
                  backgroundPosition: `${50 + viewerYaw / 4}% ${50 - viewerPitch / 3}%`,
                }}
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 p-4 flex flex-col justify-between">
                <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                  {activeCheckpoint.label} ({activeCheckpoint.id})
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{activeAssetLabel}</p>
                  <p className="text-xs opacity-80">
                    view.kind: {activeCheckpoint.view.kind}
                  </p>
                  <p className="text-xs opacity-80">
                    yaw: {viewerYaw.toFixed(1)} | pitch: {viewerPitch.toFixed(1)}
                    {activeCheckpoint.view.kind === 'quad_directions'
                      ? ` | facing: ${viewerDirection}`
                      : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Panel className="space-y-2">
                <h4 className="text-xs font-semibold">Look Controls</h4>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-600 dark:text-neutral-400">
                    Yaw
                  </label>
                  <Input
                    size="sm"
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={viewerYaw}
                    onChange={onYawChange}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-neutral-600 dark:text-neutral-400">
                    Pitch
                  </label>
                  <Input
                    size="sm"
                    type="range"
                    min="-90"
                    max="90"
                    step="1"
                    value={viewerPitch}
                    onChange={onPitchChange}
                  />
                </div>
                {activeCheckpoint.view.kind === 'quad_directions' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => turnViewer('left')}
                    >
                      Turn Left
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => turnViewer('right')}
                    >
                      Turn Right
                    </Button>
                  </div>
                )}
              </Panel>

              <Panel className="space-y-2">
                <h4 className="text-xs font-semibold">Traversal</h4>
                <p className="text-xs text-neutral-500">
                  Cache-first transition resolver. Cache misses enqueue a
                  <code> video_transition</code> generation; timeout/failure falls back to crossfade.
                </p>
                {isResolvingTransition && (
                  <p className="text-xs text-blue-600 dark:text-blue-300">
                    Resolving transition...
                  </p>
                )}
                {lastTransitionResult && (
                  <div className="p-2 rounded border border-neutral-300 dark:border-neutral-700 space-y-1">
                    <p className="text-xs">
                      status: <code>{lastTransitionResult.status}</code>
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300">
                      {lastTransitionResult.message}
                    </p>
                    {lastTransitionResult.clipAssetRef && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-300">
                        clip: <code>{lastTransitionResult.clipAssetRef}</code>
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {activeMoveHotspots.map((hotspot) => {
                    const matchedEdge = hotspot.target_checkpoint_id
                      ? navigation.edges.find(
                          (edge) =>
                            edge.from_checkpoint_id === activeCheckpoint.id &&
                            edge.to_checkpoint_id === hotspot.target_checkpoint_id,
                        )
                      : undefined;
                    return (
                      <Button
                        key={hotspot.id}
                        size="sm"
                        variant="secondary"
                        disabled={isResolvingTransition || !hotspot.target_checkpoint_id}
                        onClick={() => {
                          if (!hotspot.target_checkpoint_id) {
                            return;
                          }
                          void moveToCheckpoint(
                            hotspot.target_checkpoint_id,
                            `hotspot:${hotspot.id}`,
                            {
                              moveKind: matchedEdge?.move_kind ?? 'forward',
                              transitionProfile: matchedEdge?.transition_profile,
                              edgeId: matchedEdge?.id,
                              hotspotId: hotspot.id,
                            },
                          );
                        }}
                        className="w-full justify-start"
                      >
                        Hotspot: {hotspot.label || hotspot.id}
                        {' -> '}
                        {hotspot.target_checkpoint_id
                          ? checkpointNameById.get(hotspot.target_checkpoint_id) ??
                            hotspot.target_checkpoint_id
                          : '(missing target)'}
                      </Button>
                    );
                  })}
                  {activeEdges.map((edge) => (
                    <Button
                      key={edge.id}
                      size="sm"
                      variant="secondary"
                      disabled={isResolvingTransition}
                      onClick={() => {
                        void moveToCheckpoint(
                          edge.to_checkpoint_id,
                          `edge:${edge.id}`,
                          {
                            moveKind: edge.move_kind,
                            transitionProfile: edge.transition_profile,
                            edgeId: edge.id,
                          },
                        );
                      }}
                      className="w-full justify-start"
                    >
                      Edge: {edge.move_kind} ({edge.id})
                      {' -> '}
                      {checkpointNameById.get(edge.to_checkpoint_id) ?? edge.to_checkpoint_id}
                    </Button>
                  ))}
                  {activeMoveHotspots.length === 0 && activeEdges.length === 0 && (
                    <p className="text-xs text-neutral-500">
                      No move hotspots or outgoing edges from this checkpoint.
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            <Panel className="space-y-2">
              <h4 className="text-xs font-semibold">Traversal Log</h4>
              {traversalLog.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  No movement yet. Use hotspot or edge buttons above.
                </p>
              ) : (
                <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
                  {traversalLog.map((entry, index) => (
                    <li key={`${entry}-${index}`}>{entry}</li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="space-y-2">
              <h4 className="text-xs font-semibold">Devtools Snapshot (Phase 6)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-neutral-300 dark:border-neutral-700 p-2">
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Current checkpoint
                  </div>
                  <div className="font-mono mt-1">
                    {activeCheckpoint
                      ? `${activeCheckpoint.label || activeCheckpoint.id} (${activeCheckpoint.id})`
                      : '(none)'}
                  </div>
                </div>
                <div className="rounded border border-neutral-300 dark:border-neutral-700 p-2">
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Last selected edge/hotspot
                  </div>
                  {lastTraversalSelection ? (
                    <div className="space-y-1 mt-1 font-mono">
                      <div>{lastTraversalSelection.source}</div>
                      <div>
                        {lastTraversalSelection.fromCheckpointId}
                        {' -> '}
                        {lastTraversalSelection.toCheckpointId}
                      </div>
                      {lastTraversalSelection.edgeId && (
                        <div>edge: {lastTraversalSelection.edgeId}</div>
                      )}
                      {lastTraversalSelection.hotspotId && (
                        <div>hotspot: {lastTraversalSelection.hotspotId}</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 text-neutral-500">(none)</div>
                  )}
                </div>
              </div>

              <div className="rounded border border-neutral-300 dark:border-neutral-700 p-2 text-xs">
                <div className="text-neutral-500 dark:text-neutral-400">
                  Transition cache state ({ROOM_NAVIGATION_TRANSITION_CACHE_META_KEY})
                </div>
                <div className="font-mono mt-1">
                  entries: {transitionCacheSnapshot.totalEntries} | completed:{' '}
                  {transitionCacheSnapshot.completedEntries} | pending:{' '}
                  {transitionCacheSnapshot.pendingEntries} | failed:{' '}
                  {transitionCacheSnapshot.failedEntries}
                </div>
                {lastTransitionResult?.cacheKey && (
                  <div className="mt-1 font-mono">
                    last cache key: {lastTransitionResult.cacheKey}
                  </div>
                )}
                {transitionCacheSnapshot.activeCacheEntry && (
                  <div className="mt-1 font-mono">
                    cached status:{' '}
                    {String(
                      transitionCacheSnapshot.activeCacheEntry.status ?? 'unknown',
                    )}
                    {transitionCacheSnapshot.activeCacheEntry.asset_ref
                      ? ` | clip: ${String(transitionCacheSnapshot.activeCacheEntry.asset_ref)}`
                      : ''}
                  </div>
                )}
              </div>
            </Panel>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Checkpoints ({navigation.checkpoints.length})
            </h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={addCheckpoint}
            >
              + Add
            </Button>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">Room ID</label>
            <Input
              size="sm"
              value={navigation.room_id}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setNavigation((prev) => ({ ...prev, room_id: event.target.value }))
              }
              placeholder="room_id"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">Start checkpoint</label>
            <Select
              size="sm"
              value={navigation.start_checkpoint_id ?? ''}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setNavigation((prev) => ({
                  ...prev,
                  start_checkpoint_id: event.target.value || undefined,
                }))
              }
            >
              <option value="">(none)</option>
              {navigation.checkpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>
                  {checkpoint.label || checkpoint.id}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            {navigation.checkpoints.length === 0 && (
              <p className="text-xs text-neutral-500">
                No checkpoints yet. Add one to start authoring.
              </p>
            )}
            {navigation.checkpoints.map((checkpoint) => {
              const isActive = checkpoint.id === selectedCheckpointId;
              return (
                <div
                  key={checkpoint.id}
                  className={`rounded border ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  <button
                    className="w-full text-left px-2 py-2"
                    onClick={() => setSelectedCheckpointId(checkpoint.id)}
                  >
                    <div className="text-xs font-semibold">
                      {checkpoint.label || checkpoint.id}
                    </div>
                    <div className="text-[11px] text-neutral-500">{checkpoint.id}</div>
                  </button>
                  <div className="px-2 pb-2 flex justify-end">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => removeCheckpoint(checkpoint.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="space-y-3">
          <h3 className="text-sm font-semibold">Checkpoint Details</h3>
          {!selectedCheckpoint ? (
            <p className="text-xs text-neutral-500">
              Select a checkpoint to edit view and hotspots.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Checkpoint ID</label>
                  <Input
                    size="sm"
                    value={selectedCheckpoint.id}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      renameCheckpointId(selectedCheckpoint.id, event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Label</label>
                  <Input
                    size="sm"
                    value={selectedCheckpoint.label}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        label: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">View Kind</label>
                <Select
                  size="sm"
                  value={selectedCheckpoint.view.kind}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                      ...checkpoint,
                      view: {
                        ...checkpoint.view,
                        kind: event.target.value as RoomCheckpointViewKind,
                      },
                    }))
                  }
                >
                  {VIEW_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedCheckpoint.view.kind === 'cylindrical_pano' ? (
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Pano Asset ID</label>
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.pano_asset_id ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        view: {
                          ...checkpoint.view,
                          pano_asset_id: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="asset id"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.north_asset_id ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        view: {
                          ...checkpoint.view,
                          north_asset_id: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="north_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.east_asset_id ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        view: {
                          ...checkpoint.view,
                          east_asset_id: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="east_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.south_asset_id ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        view: {
                          ...checkpoint.view,
                          south_asset_id: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="south_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.west_asset_id ?? ''}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                        ...checkpoint,
                        view: {
                          ...checkpoint.view,
                          west_asset_id: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="west_asset_id"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.fov_default ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                      ...checkpoint,
                      view: {
                        ...checkpoint.view,
                        fov_default: parseOptionalNumber(event.target.value),
                      },
                    }))
                  }
                  placeholder="fov"
                  min="1"
                  max="180"
                  step="0.1"
                />
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.yaw_default ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                      ...checkpoint,
                      view: {
                        ...checkpoint.view,
                        yaw_default: parseOptionalNumber(event.target.value),
                      },
                    }))
                  }
                  placeholder="yaw"
                  step="0.1"
                />
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.pitch_default ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => ({
                      ...checkpoint,
                      view: {
                        ...checkpoint.view,
                        pitch_default: parseOptionalNumber(event.target.value),
                      },
                    }))
                  }
                  placeholder="pitch"
                  min="-90"
                  max="90"
                  step="0.1"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">Tags (comma-separated)</label>
                <Input
                  size="sm"
                  value={selectedCheckpoint.tags?.join(', ') ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateCheckpoint(selectedCheckpoint.id, (checkpoint) => {
                      const tags = event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean);
                      return {
                        ...checkpoint,
                        tags: tags.length > 0 ? tags : undefined,
                      };
                    })
                  }
                  placeholder="entry, hallway"
                />
              </div>

              <div className="border-t pt-3 dark:border-neutral-700 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">
                    Hotspots ({selectedCheckpoint.hotspots.length})
                  </h4>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={addHotspot}
                  >
                    + Add Hotspot
                  </Button>
                </div>

                {selectedCheckpoint.hotspots.length === 0 && (
                  <p className="text-xs text-neutral-500">
                    No hotspots yet.
                  </p>
                )}

                {selectedCheckpoint.hotspots.map((hotspot, index) => (
                  <div
                    key={`${hotspot.id}-${index}`}
                    className="p-2 border rounded border-neutral-300 dark:border-neutral-700 space-y-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        size="sm"
                        value={hotspot.id}
                        placeholder="hotspot id"
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updateHotspot(index, (currentHotspot) => ({
                            ...currentHotspot,
                            id: event.target.value,
                          }))
                        }
                      />
                      <Input
                        size="sm"
                        value={hotspot.label ?? ''}
                        placeholder="label"
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          updateHotspot(index, (currentHotspot) => ({
                            ...currentHotspot,
                            label: event.target.value || undefined,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        size="sm"
                        value={hotspot.action}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          updateHotspot(index, (currentHotspot) => {
                            const action = event.target.value as RoomHotspotAction;
                            if (action !== 'move') {
                              return {
                                ...currentHotspot,
                                action,
                                target_checkpoint_id: undefined,
                              };
                            }
                            return {
                              ...currentHotspot,
                              action,
                            };
                          })
                        }
                      >
                        {HOTSPOT_ACTIONS.map((action) => (
                          <option key={action} value={action}>
                            {action}
                          </option>
                        ))}
                      </Select>
                      {hotspot.action === 'move' ? (
                        <Select
                          size="sm"
                          value={hotspot.target_checkpoint_id ?? ''}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                            updateHotspot(index, (currentHotspot) => ({
                              ...currentHotspot,
                              target_checkpoint_id: event.target.value || undefined,
                            }))
                          }
                        >
                          <option value="">Select target...</option>
                          {navigation.checkpoints.map((checkpoint) => (
                            <option key={checkpoint.id} value={checkpoint.id}>
                              {checkpoint.label || checkpoint.id}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          size="sm"
                          value=""
                          disabled
                          placeholder="target only for move"
                        />
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => removeHotspot(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove Hotspot
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Edges ({navigation.edges.length})
            </h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={addEdge}
              disabled={navigation.checkpoints.length === 0}
            >
              + Add Edge
            </Button>
          </div>

          {navigation.edges.length === 0 ? (
            <p className="text-xs text-neutral-500">
              No edges yet. Add links to define traversal.
            </p>
          ) : (
            <div className="space-y-2">
              {navigation.edges.map((edge, edgeIndex) => (
                <div
                  key={`${edge.id}-${edgeIndex}`}
                  className="p-2 border rounded border-neutral-300 dark:border-neutral-700 space-y-2"
                >
                  <Input
                    size="sm"
                    value={edge.id}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateEdge(edgeIndex, { id: event.target.value })
                    }
                    placeholder="edge id"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      size="sm"
                      value={edge.from_checkpoint_id}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateEdge(edgeIndex, { from_checkpoint_id: event.target.value })
                      }
                    >
                      {navigation.checkpoints.map((checkpoint) => (
                        <option key={checkpoint.id} value={checkpoint.id}>
                          {checkpoint.label || checkpoint.id}
                        </option>
                      ))}
                    </Select>
                    <Select
                      size="sm"
                      value={edge.to_checkpoint_id}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateEdge(edgeIndex, { to_checkpoint_id: event.target.value })
                      }
                    >
                      {navigation.checkpoints.map((checkpoint) => (
                        <option key={checkpoint.id} value={checkpoint.id}>
                          {checkpoint.label || checkpoint.id}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      size="sm"
                      value={edge.move_kind}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        updateEdge(edgeIndex, {
                          move_kind: event.target.value as RoomEdgeMoveKind,
                        })
                      }
                    >
                      {MOVE_KINDS.map((moveKind) => (
                        <option key={moveKind} value={moveKind}>
                          {moveKind}
                        </option>
                      ))}
                    </Select>
                    <Input
                      size="sm"
                      value={edge.transition_profile ?? ''}
                      placeholder="transition_profile (optional)"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateEdge(edgeIndex, {
                          transition_profile: event.target.value || undefined,
                        })
                      }
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => removeEdge(edgeIndex)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove Edge
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
