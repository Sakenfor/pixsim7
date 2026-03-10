import type {
  RoomEdgeMoveKind,
  SceneAnchor,
  SceneBeat,
  ScenePlan,
} from '@pixsim7/shared.types';
import {
  IDs,
  validateRoomNavigation,
} from '@pixsim7/shared.types';
import { Button, Checkbox, useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildActionSelectionRequestFromBehavior,
  getGameLocation,
  selectActionBlocksFromBehavior,
  type ActionSelectionResponsePayload,
  type BuildActionSelectionRequestFromBehaviorRequest,
  type BuildActionSelectionRequestFromBehaviorResponse,
} from '@lib/api';
import { getRoomNavigation } from '@lib/api/game';
import { useEditorContext } from '@lib/context';
import { resolveGameNpcs } from '@lib/resolvers';

type NpcChoice = {
  id: number;
  name: string;
  worldId: number | null;
};

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

type RoomNavigationStepHint = {
  checkpointId: string;
  anchorId: string;
  edgeId?: string;
  nextCheckpointId?: string;
  moveKind?: RoomEdgeMoveKind;
  transitionProfile?: string;
  pathIntent: 'arrive' | 'move' | 'interact';
  camera?: SceneBeat['camera'];
};

type RoomNavigationPlanContext = {
  navigation: RoomNavigationData;
  startCheckpointId?: string;
  includeAnchors: boolean;
  planFromCurrentCheckpoint: boolean;
};

async function loadRoomNavigationForLocation(
  locationId: number,
): Promise<RoomNavigationData | null> {
  const location = await getGameLocation(locationId as IDs.LocationId);
  return getRoomNavigation(location);
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  if (!Number.isFinite(next)) return null;
  return Math.trunc(next);
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  if (!Number.isFinite(next)) return null;
  return next;
}

function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function tagsToList(tags: Record<string, unknown>): string[] {
  const result: string[] = [];
  for (const [key, raw] of Object.entries(tags)) {
    if (typeof raw === 'string' && raw.trim()) {
      result.push(`${key}:${raw.trim()}`);
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      result.push(`${key}:${String(raw)}`);
      continue;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          result.push(`${key}:${item.trim()}`);
        }
      }
    }
  }
  return result;
}

function blockDurationSec(block: Record<string, unknown>): number {
  const direct = asNumber(block.durationSec) ?? asNumber(block.duration);
  if (typeof direct === 'number' && direct > 0) return direct;
  const tags = asRecord(block.tags);
  const fromTags =
    asNumber(tags.duration_sec) ??
    asNumber(tags.duration_seconds) ??
    asNumber(tags.duration);
  if (typeof fromTags === 'number' && fromTags > 0) return fromTags;
  return 6.0;
}

function blockCategory(block: Record<string, unknown>): string | null {
  const raw = block.category;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return null;
}

function blockId(block: Record<string, unknown>, index: number): string {
  const primary = block.blockId ?? block.block_id ?? block.id;
  if (typeof primary === 'string' && primary.trim()) return primary.trim();
  if (typeof primary === 'number' && Number.isFinite(primary)) return String(primary);
  return `block_${index + 1}`;
}

function blockIntent(
  block: Record<string, unknown>,
  derived: Record<string, unknown>,
  request: BuildActionSelectionRequestFromBehaviorRequest,
): string {
  const explicit = block.intent;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const category = blockCategory(block);
  if (category) return category;
  const sceneIntent = derived.scene_intent;
  if (typeof sceneIntent === 'string' && sceneIntent.trim()) return sceneIntent.trim();
  if (request.branch_intent && request.branch_intent.trim()) return request.branch_intent.trim();
  return 'runtime_step';
}

function checkpointAnchorId(
  locationId: number | undefined,
  checkpointId: string,
): string {
  if (locationId != null) {
    return `location:${locationId}:checkpoint:${checkpointId}`;
  }
  return `room:checkpoint:${checkpointId}`;
}

function hotspotAnchorId(
  locationId: number | undefined,
  checkpointId: string,
  hotspotId: string,
): string {
  if (locationId != null) {
    return `location:${locationId}:checkpoint:${checkpointId}:hotspot:${hotspotId}`;
  }
  return `room:checkpoint:${checkpointId}:hotspot:${hotspotId}`;
}

function moveKindCameraHint(
  moveKind: RoomEdgeMoveKind,
  toAnchorId: string,
): SceneBeat['camera'] {
  if (moveKind === 'turn_left' || moveKind === 'turn_right') {
    return {
      type: 'pan',
      focus: moveKind,
      targetType: 'anchor',
      targetAnchorId: toAnchorId,
      meta: {
        moveKind,
      },
    };
  }
  if (moveKind === 'forward') {
    return {
      type: 'dolly',
      focus: 'forward',
      targetType: 'anchor',
      targetAnchorId: toAnchorId,
      meta: {
        moveKind,
      },
    };
  }
  if (moveKind === 'door') {
    return {
      type: 'track',
      focus: 'doorway',
      targetType: 'anchor',
      targetAnchorId: toAnchorId,
      meta: {
        moveKind,
      },
    };
  }
  return {
    type: 'track',
    focus: 'movement',
    targetType: 'anchor',
    targetAnchorId: toAnchorId,
    meta: {
      moveKind,
    },
  };
}

function buildRoomNavigationAnchors(
  navigation: RoomNavigationData,
  worldId: number,
  locationId: number | undefined,
): SceneAnchor[] {
  const anchors: SceneAnchor[] = [];

  navigation.checkpoints.forEach((checkpoint, index) => {
    const checkpointId = checkpointAnchorId(locationId, checkpoint.id);
    const yaw = checkpoint.view.yaw_default ?? 0;
    const pitch = checkpoint.view.pitch_default ?? 0;
    const anchorX = index * 2;
    const anchorY = 0;
    const anchorZ = 0;
    anchors.push({
      id: checkpointId,
      label: checkpoint.label || checkpoint.id,
      worldId,
      locationId,
      transform: {
        worldId,
        locationId,
        position: { x: anchorX, y: anchorY, z: anchorZ },
        orientation: { yaw, pitch },
        space: 'world_3d',
      },
      tags: [
        'anchor:candidate',
        'anchor:room_checkpoint',
        `checkpoint:${checkpoint.id}`,
        `view:${checkpoint.view.kind}`,
        ...(checkpoint.tags ?? []).map((tag) => `checkpoint_tag:${tag}`),
      ],
      meta: {
        checkpointId: checkpoint.id,
        viewKind: checkpoint.view.kind,
        hotspotCount: checkpoint.hotspots.length,
      },
    });

    checkpoint.hotspots.forEach((hotspot, hotspotIndex) => {
      const hintYaw = hotspot.screen_hint?.yaw ?? 0;
      const hintPitch = hotspot.screen_hint?.pitch ?? 0;
      const yawRad = (hintYaw * Math.PI) / 180;
      const distance = 0.85 + hotspotIndex * 0.08;
      const hotspotX = anchorX + Math.cos(yawRad) * distance;
      const hotspotZ = anchorZ + Math.sin(yawRad) * distance;
      const hotspotY = anchorY + hintPitch / 90;
      anchors.push({
        id: hotspotAnchorId(locationId, checkpoint.id, hotspot.id),
        label: hotspot.label || hotspot.id,
        worldId,
        locationId,
        transform: {
          worldId,
          locationId,
          position: { x: hotspotX, y: hotspotY, z: hotspotZ },
          orientation: { yaw: hintYaw, pitch: hintPitch },
          space: 'world_3d',
        },
        tags: [
          'anchor:candidate',
          'anchor:room_hotspot',
          `checkpoint:${checkpoint.id}`,
          `hotspot:${hotspot.id}`,
          `action:${hotspot.action}`,
          ...(hotspot.target_checkpoint_id
            ? [`target_checkpoint:${hotspot.target_checkpoint_id}`]
            : []),
        ],
        meta: {
          checkpointId: checkpoint.id,
          hotspotId: hotspot.id,
          hotspotAction: hotspot.action,
          targetCheckpointId: hotspot.target_checkpoint_id,
        },
      });
    });
  });

  return anchors;
}

function buildRoomNavigationStepHints(args: {
  navigation: RoomNavigationData;
  locationId: number | undefined;
  startCheckpointId?: string;
  beatCount: number;
}): RoomNavigationStepHint[] {
  const { navigation, locationId, beatCount } = args;
  const fallbackStart = navigation.start_checkpoint_id ?? navigation.checkpoints[0]?.id;
  const requestedStart = args.startCheckpointId?.trim();
  const hasRequestedStart =
    !!requestedStart &&
    navigation.checkpoints.some((checkpoint) => checkpoint.id === requestedStart);
  const initialCheckpointId = hasRequestedStart
    ? requestedStart
    : fallbackStart;
  if (!initialCheckpointId) {
    return [];
  }

  const outgoingByFromCheckpoint = new Map<
    string,
    RoomNavigationData['edges'][number][]
  >();
  navigation.edges.forEach((edge) => {
    const list = outgoingByFromCheckpoint.get(edge.from_checkpoint_id) ?? [];
    list.push(edge);
    outgoingByFromCheckpoint.set(edge.from_checkpoint_id, list);
  });

  const hints: RoomNavigationStepHint[] = [];
  let currentCheckpointId = initialCheckpointId;
  for (let index = 0; index < beatCount; index += 1) {
    const currentAnchorId = checkpointAnchorId(locationId, currentCheckpointId);
    const outgoingEdges = outgoingByFromCheckpoint.get(currentCheckpointId) ?? [];
    const selectedEdge =
      outgoingEdges.length > 0
        ? outgoingEdges[index % outgoingEdges.length]
        : undefined;
    const nextCheckpointId =
      selectedEdge?.to_checkpoint_id ?? currentCheckpointId;
    const nextAnchorId = checkpointAnchorId(locationId, nextCheckpointId);

    hints.push({
      checkpointId: currentCheckpointId,
      anchorId: currentAnchorId,
      edgeId: selectedEdge?.id,
      nextCheckpointId,
      moveKind: selectedEdge?.move_kind,
      transitionProfile: selectedEdge?.transition_profile,
      pathIntent: index === 0 ? 'arrive' : selectedEdge ? 'move' : 'interact',
      camera: selectedEdge
        ? moveKindCameraHint(selectedEdge.move_kind, nextAnchorId)
        : undefined,
    });

    currentCheckpointId = nextCheckpointId;
  }

  return hints;
}

function buildBeats(
  selection: ActionSelectionResponsePayload,
  request: BuildActionSelectionRequestFromBehaviorRequest,
  derived: Record<string, unknown>,
  locationId: number | undefined,
  roomNavigationContext?: RoomNavigationPlanContext,
): SceneBeat[] {
  const blocks = selection.blocks.map((row) => asRecord(row));
  const locationAnchorId =
    locationId != null ? `location:${locationId}:primary` : 'world:origin';
  const roomNavigationHints = roomNavigationContext
    ? buildRoomNavigationStepHints({
        navigation: roomNavigationContext.navigation,
        locationId,
        startCheckpointId: roomNavigationContext.startCheckpointId,
        beatCount: blocks.length,
      })
    : [];
  let cursor = 0;

  return blocks.map((block, index) => {
    const durationSec = blockDurationSec(block);
    const tags = asRecord(block.tags);
    const category = blockCategory(block);
    const tagList = tagsToList(tags);
    const roomNavigationHint = roomNavigationHints[index];
    const actorAnchorId = roomNavigationHint?.anchorId ?? locationAnchorId;
    const pathIntent =
      roomNavigationHint?.pathIntent ?? (index === 0 ? 'arrive' : 'interact');
    const sourceBlock = blockId(block, index);
    const beatMeta: Record<string, unknown> = {
      sourceBlockId: sourceBlock,
    };
    if (roomNavigationHint) {
      beatMeta.roomNavigation = {
        checkpointId: roomNavigationHint.checkpointId,
        nextCheckpointId: roomNavigationHint.nextCheckpointId,
        edgeId: roomNavigationHint.edgeId,
        moveKind: roomNavigationHint.moveKind,
        transitionProfile: roomNavigationHint.transitionProfile,
      };
    }

    const beat: SceneBeat = {
      id: `beat_${index + 1}`,
      order: index,
      label: sourceBlock,
      intent: blockIntent(block, derived, request),
      startTimeSec: cursor,
      durationSec,
      worldId: request.world_id,
      locationId,
      actorTargets: [
        {
          role: 'lead',
          actorId: request.lead_npc_id,
          anchorId: actorAnchorId,
          pathIntent,
        },
        ...(request.partner_npc_id != null
          ? [
              {
                role: 'partner',
                actorId: request.partner_npc_id,
                anchorId: actorAnchorId,
                pathIntent,
              },
            ]
          : []),
      ],
      requiredPrimitiveCategories: category ? [category] : [],
      requiredTags: tagList,
      camera: category === 'camera'
        ? {
            type: 'static',
            focus: 'lead',
            targetType: 'actor',
            targetActorRole: 'lead',
          }
        : roomNavigationHint?.camera,
      meta: beatMeta,
    };
    cursor += durationSec;
    return beat;
  });
}

function buildScenePlanPreview(args: {
  request: BuildActionSelectionRequestFromBehaviorRequest;
  built: BuildActionSelectionRequestFromBehaviorResponse;
  selection: ActionSelectionResponsePayload;
  fallbackWorldTime: number | null;
  roomNavigation?: RoomNavigationData | null;
  roomNavigationOptions?: {
    includeAnchors: boolean;
    planFromCurrentCheckpoint: boolean;
    currentCheckpointId?: string | null;
  };
}): ScenePlan {
  const {
    request,
    built,
    selection,
    fallbackWorldTime,
    roomNavigation,
    roomNavigationOptions,
  } = args;
  const derived = asRecord(built.derived);
  const locationId = asNumber(derived.location_id);
  const worldTimeSeconds =
    asNumber(derived.world_time) ??
    request.world_time ??
    fallbackWorldTime ??
    undefined;

  let roomNavigationContext: RoomNavigationPlanContext | undefined;
  if (roomNavigation) {
    const fallbackStartCheckpointId =
      roomNavigation.start_checkpoint_id ?? roomNavigation.checkpoints[0]?.id;
    const requestedCheckpointId = roomNavigationOptions?.currentCheckpointId?.trim();
    const hasRequestedCheckpoint =
      !!requestedCheckpointId &&
      roomNavigation.checkpoints.some(
        (checkpoint) => checkpoint.id === requestedCheckpointId,
      );
    const startCheckpointId =
      roomNavigationOptions?.planFromCurrentCheckpoint && hasRequestedCheckpoint
        ? requestedCheckpointId
        : fallbackStartCheckpointId;

    roomNavigationContext = {
      navigation: roomNavigation,
      startCheckpointId,
      includeAnchors: Boolean(roomNavigationOptions?.includeAnchors),
      planFromCurrentCheckpoint: Boolean(
        roomNavigationOptions?.planFromCurrentCheckpoint,
      ),
    };
  }

  const createdAt = new Date().toISOString();
  const anchorId = locationId != null ? `location:${locationId}:primary` : 'world:origin';
  const beats = buildBeats(
    selection,
    request,
    derived,
    locationId,
    roomNavigationContext,
  );
  const roomNavigationAnchors =
    roomNavigationContext?.includeAnchors
      ? buildRoomNavigationAnchors(
          roomNavigationContext.navigation,
          request.world_id,
          locationId,
        )
      : [];
  const contextTags = [
    ...(request.required_tags ?? []),
    ...(roomNavigationContext?.planFromCurrentCheckpoint &&
    roomNavigationContext.startCheckpointId
      ? [`room_nav:start_checkpoint:${roomNavigationContext.startCheckpointId}`]
      : []),
  ];

  return {
    id: `scene_plan_preview_${Date.now()}`,
    version: 1,
    source: 'behavior',
    context: {
      worldId: request.world_id,
      sessionId: request.session_id,
      locationId,
      worldTimeSeconds,
      leadNpcId: request.lead_npc_id,
      partnerNpcId: request.partner_npc_id ?? undefined,
      coordinateSpace: 'world_3d',
      tags: contextTags,
      meta: {
        excludedTags: request.exclude_tags ?? [],
        sceneIntent: derived.scene_intent,
        roomNavigationStartCheckpointId:
          roomNavigationContext?.startCheckpointId,
        roomNavigationCheckpointCount:
          roomNavigationContext?.navigation.checkpoints.length ?? 0,
      },
    },
    anchors: [
      {
        id: anchorId,
        label:
          typeof derived.location_name === 'string' && derived.location_name.trim()
            ? derived.location_name.trim()
            : locationId != null
              ? `Location ${locationId}`
              : 'World Origin',
        worldId: request.world_id,
        locationId,
        transform: {
          worldId: request.world_id,
          locationId,
          position: { x: 0, y: 0, z: 0 },
          orientation: { yaw: 0 },
          space: 'world_3d',
        },
        tags: [
          'anchor:primary',
          ...(locationId != null ? [`location:${locationId}`] : []),
          ...(roomNavigationContext?.planFromCurrentCheckpoint &&
          roomNavigationContext.startCheckpointId
            ? [`entrypoint:checkpoint:${roomNavigationContext.startCheckpointId}`]
            : []),
        ],
        meta: {
          roomNavigationStartCheckpointId:
            roomNavigationContext?.startCheckpointId,
        },
      },
      ...roomNavigationAnchors,
    ],
    beats,
    createdAt,
    updatedAt: createdAt,
    meta: {
      compatibilityScore: selection.compatibility_score,
      fallbackReason: selection.fallback_reason ?? null,
      promptCount: selection.prompts.length,
      segmentCount: selection.segments.length,
      roomNavigationAnchorCount: roomNavigationAnchors.length,
      derived,
    },
  };
}

export function ScenePlanPanel() {
  const ctx = useEditorContext();
  const toast = useToast();

  const [busy, setBusy] = useState(false);

  const [worldIdInput, setWorldIdInput] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [worldTimeInput, setWorldTimeInput] = useState('');
  const [leadNpcIdInput, setLeadNpcIdInput] = useState('');
  const [partnerNpcIdInput, setPartnerNpcIdInput] = useState('');
  const [poseInput, setPoseInput] = useState('');
  const [moodInput, setMoodInput] = useState('');
  const [intimacyInput, setIntimacyInput] = useState('');
  const [branchIntentInput, setBranchIntentInput] = useState('');
  const [maxDurationInput, setMaxDurationInput] = useState('');
  const [requiredTagsInput, setRequiredTagsInput] = useState('');
  const [excludeTagsInput, setExcludeTagsInput] = useState('');
  const [includeSceneIntentTag, setIncludeSceneIntentTag] = useState(false);
  const [includeRoomNavigationAnchors, setIncludeRoomNavigationAnchors] = useState(true);
  const [planFromCurrentCheckpoint, setPlanFromCurrentCheckpoint] = useState(false);
  const [currentCheckpointId, setCurrentCheckpointId] = useState('');

  const [npcs, setNpcs] = useState<NpcChoice[]>([]);
  const [roomNavigation, setRoomNavigation] = useState<RoomNavigationData | null>(null);
  const [roomNavigationLocationId, setRoomNavigationLocationId] = useState<number | null>(null);
  const [roomNavigationBusy, setRoomNavigationBusy] = useState(false);
  const [roomNavigationError, setRoomNavigationError] = useState<string | null>(null);

  const [builtRequest, setBuiltRequest] = useState<BuildActionSelectionRequestFromBehaviorResponse | null>(null);
  const [selection, setSelection] = useState<ActionSelectionResponsePayload | null>(null);
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);

  useEffect(() => {
    if (!worldIdInput.trim() && ctx.world.id != null) {
      setWorldIdInput(String(ctx.world.id));
    }
  }, [ctx.world.id, worldIdInput]);

  useEffect(() => {
    if (!sessionIdInput.trim() && ctx.runtime.sessionId != null) {
      setSessionIdInput(String(ctx.runtime.sessionId));
    }
  }, [ctx.runtime.sessionId, sessionIdInput]);

  useEffect(() => {
    if (!worldTimeInput.trim() && ctx.runtime.worldTimeSeconds != null) {
      setWorldTimeInput(String(ctx.runtime.worldTimeSeconds));
    }
  }, [ctx.runtime.worldTimeSeconds, worldTimeInput]);

  const syncRoomNavigationForLocation = useCallback(async (locationId: number) => {
    setRoomNavigationBusy(true);
    setRoomNavigationError(null);
    try {
      const navigation = await loadRoomNavigationForLocation(locationId);
      setRoomNavigation(navigation);
      setRoomNavigationLocationId(locationId);
      setCurrentCheckpointId((previous) => {
        if (!navigation) {
          return '';
        }
        if (
          previous &&
          navigation.checkpoints.some((checkpoint) => checkpoint.id === previous)
        ) {
          return previous;
        }
        return navigation.start_checkpoint_id ?? navigation.checkpoints[0]?.id ?? '';
      });
      return navigation;
    } catch (error) {
      setRoomNavigation(null);
      setRoomNavigationLocationId(locationId);
      setCurrentCheckpointId('');
      setRoomNavigationError(
        error instanceof Error ? error.message : 'Failed to load room navigation',
      );
      return null;
    } finally {
      setRoomNavigationBusy(false);
    }
  }, []);

  useEffect(() => {
    const locationId = ctx.world.locationId;
    if (locationId == null || locationId <= 0) {
      setRoomNavigation(null);
      setRoomNavigationLocationId(null);
      setCurrentCheckpointId('');
      setRoomNavigationError(null);
      return;
    }
    void syncRoomNavigationForLocation(locationId);
  }, [ctx.world.locationId, syncRoomNavigationForLocation]);

  useEffect(() => {
    if (!planFromCurrentCheckpoint) {
      return;
    }
    if (currentCheckpointId.trim()) {
      return;
    }
    const fallbackCheckpointId =
      roomNavigation?.start_checkpoint_id ?? roomNavigation?.checkpoints[0]?.id;
    if (fallbackCheckpointId) {
      setCurrentCheckpointId(fallbackCheckpointId);
    }
  }, [currentCheckpointId, planFromCurrentCheckpoint, roomNavigation]);

  useEffect(() => {
    let cancelled = false;
    const loadNpcs = async () => {
      try {
        const list = await resolveGameNpcs({}, {
          consumerId: 'ScenePlanPanel.loadNpcs',
        });
        if (cancelled) return;
        const mapped = list
          .map((npc) => {
            const row = npc as unknown as Record<string, unknown>;
            const id = asNumber(row.id);
            if (id == null) return null;
            const worldId = asNumber(row.world_id ?? row.worldId) ?? null;
            return {
              id,
              name:
                typeof row.name === 'string' && row.name.trim()
                  ? row.name.trim()
                  : `NPC ${id}`,
              worldId,
            } satisfies NpcChoice;
          })
          .filter((value): value is NpcChoice => value != null)
          .sort((a, b) => a.id - b.id);
        setNpcs(mapped);
      } catch {
        if (!cancelled) setNpcs([]);
      }
    };
    void loadNpcs();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNpcs = useMemo(() => {
    const worldId = parseOptionalInt(worldIdInput) ?? ctx.world.id;
    if (worldId == null) return npcs;
    return npcs.filter((npc) => npc.worldId == null || npc.worldId === worldId);
  }, [ctx.world.id, npcs, worldIdInput]);

  const roomNavigationCheckpoints = roomNavigation?.checkpoints ?? [];
  const roomNavigationEdgeCount = roomNavigation?.edges.length ?? 0;
  const roomNavigationStartCheckpointId =
    roomNavigation?.start_checkpoint_id ?? roomNavigationCheckpoints[0]?.id ?? '';

  const buildRequest = (): BuildActionSelectionRequestFromBehaviorRequest | null => {
    const worldId = parseOptionalInt(worldIdInput) ?? ctx.world.id;
    const sessionId = parseOptionalInt(sessionIdInput) ?? ctx.runtime.sessionId;
    const leadNpcId = parseOptionalInt(leadNpcIdInput);
    if (worldId == null || worldId <= 0) {
      toast.warning('Scene Plan requires a world ID');
      return null;
    }
    if (sessionId == null || sessionId <= 0) {
      toast.warning('Scene Plan requires a session ID');
      return null;
    }
    if (leadNpcId == null || leadNpcId <= 0) {
      toast.warning('Scene Plan requires a lead NPC ID');
      return null;
    }

    const partnerNpcId = parseOptionalInt(partnerNpcIdInput);
    const worldTime = parseOptionalFloat(worldTimeInput);
    const maxDuration = parseOptionalFloat(maxDurationInput);
    const pose = poseInput.trim();
    const mood = moodInput.trim();
    const intimacyLevel = intimacyInput.trim();
    const branchIntent = branchIntentInput.trim();

    return {
      world_id: worldId,
      session_id: sessionId,
      lead_npc_id: leadNpcId,
      ...(partnerNpcId != null && partnerNpcId > 0 ? { partner_npc_id: partnerNpcId } : {}),
      ...(worldTime != null ? { world_time: worldTime } : {}),
      include_scene_intent_tag: includeSceneIntentTag,
      ...(pose ? { pose } : {}),
      ...(mood ? { mood } : {}),
      ...(intimacyLevel ? { intimacy_level: intimacyLevel } : {}),
      ...(branchIntent ? { branch_intent: branchIntent } : {}),
      ...(maxDuration != null ? { max_duration: maxDuration } : {}),
      required_tags: parseTagList(requiredTagsInput),
      exclude_tags: parseTagList(excludeTagsInput),
    };
  };

  const handleRefreshRoomNavigation = async () => {
    const locationId = ctx.world.locationId ?? roomNavigationLocationId;
    if (locationId == null || locationId <= 0) {
      toast.warning('Room navigation refresh requires an active location');
      return;
    }
    await syncRoomNavigationForLocation(locationId);
  };

  const handleBuildRequest = async () => {
    const request = buildRequest();
    if (!request) return;
    setBusy(true);
    try {
      const built = await buildActionSelectionRequestFromBehavior(request);
      setBuiltRequest(built);
      toast.success('Built behavior-derived scene request');
    } catch (error) {
      toast.error(`Failed to build request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBuildPlanPreview = async () => {
    const request = buildRequest();
    if (!request) return;
    setBusy(true);
    try {
      const [built, selected] = await Promise.all([
        buildActionSelectionRequestFromBehavior(request),
        selectActionBlocksFromBehavior(request),
      ]);
      setBuiltRequest(built);
      setSelection(selected);
      const derived = asRecord(built.derived);
      const derivedLocation = asNumber(derived.location_id);
      const planLocationId =
        derivedLocation != null && derivedLocation > 0
          ? Math.trunc(derivedLocation)
          : null;
      let roomNavigationForPlan: RoomNavigationData | null = roomNavigation;
      if (planLocationId != null) {
        roomNavigationForPlan =
          roomNavigationLocationId === planLocationId
            ? roomNavigation
            : await syncRoomNavigationForLocation(planLocationId);
      }
      const selectedCheckpointId = currentCheckpointId.trim();
      let checkpointIdForPlan = selectedCheckpointId || null;
      if (planFromCurrentCheckpoint && roomNavigationForPlan) {
        const hasSelectedCheckpoint =
          !!selectedCheckpointId &&
          roomNavigationForPlan.checkpoints.some(
            (checkpoint) => checkpoint.id === selectedCheckpointId,
          );
        if (!hasSelectedCheckpoint) {
          checkpointIdForPlan =
            roomNavigationForPlan.start_checkpoint_id ??
            roomNavigationForPlan.checkpoints[0]?.id ??
            null;
          if (checkpointIdForPlan) {
            setCurrentCheckpointId(checkpointIdForPlan);
          }
        }
      }
      const plan = buildScenePlanPreview({
        request,
        built,
        selection: selected,
        fallbackWorldTime: ctx.runtime.worldTimeSeconds,
        roomNavigation: roomNavigationForPlan,
        roomNavigationOptions: {
          includeAnchors: includeRoomNavigationAnchors,
          planFromCurrentCheckpoint,
          currentCheckpointId: checkpointIdForPlan,
        },
      });
      setScenePlan(plan);
      toast.success(`Scene plan preview built (${plan.beats.length} beat(s))`);
    } catch (error) {
      toast.error(`Failed to build scene plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950 text-xs">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="font-semibold">Scene Plan</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          Build a context-aware scene plan preview from runtime behavior and primitive selection.
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
          Context: world {ctx.world.id ?? 'N/A'} | location {ctx.world.locationId ?? 'N/A'} | session {ctx.runtime.sessionId ?? 'N/A'}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">World ID</span>
            <input
              value={worldIdInput}
              onChange={(event) => setWorldIdInput(event.target.value)}
              placeholder={ctx.world.id != null ? String(ctx.world.id) : 'Required'}
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Session ID</span>
            <input
              value={sessionIdInput}
              onChange={(event) => setSessionIdInput(event.target.value)}
              placeholder={ctx.runtime.sessionId != null ? String(ctx.runtime.sessionId) : 'Required'}
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Lead NPC</span>
            <input
              list="scene-plan-npc-options"
              value={leadNpcIdInput}
              onChange={(event) => setLeadNpcIdInput(event.target.value)}
              placeholder="Required"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Partner NPC</span>
            <input
              list="scene-plan-npc-options"
              value={partnerNpcIdInput}
              onChange={(event) => setPartnerNpcIdInput(event.target.value)}
              placeholder="Optional"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">World Time (sec)</span>
            <input
              value={worldTimeInput}
              onChange={(event) => setWorldTimeInput(event.target.value)}
              placeholder={ctx.runtime.worldTimeSeconds != null ? String(ctx.runtime.worldTimeSeconds) : 'Optional'}
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
        </div>

        <datalist id="scene-plan-npc-options">
          {filteredNpcs.map((npc) => (
            <option key={npc.id} value={npc.id}>
              {npc.name}
              {npc.worldId != null ? ` (world ${npc.worldId})` : ''}
            </option>
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Pose</span>
            <input
              value={poseInput}
              onChange={(event) => setPoseInput(event.target.value)}
              placeholder="Optional"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Mood</span>
            <input
              value={moodInput}
              onChange={(event) => setMoodInput(event.target.value)}
              placeholder="Optional"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Intimacy</span>
            <input
              value={intimacyInput}
              onChange={(event) => setIntimacyInput(event.target.value)}
              placeholder="Optional"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Branch Intent</span>
            <input
              value={branchIntentInput}
              onChange={(event) => setBranchIntentInput(event.target.value)}
              placeholder="Optional"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Max Duration</span>
            <input
              value={maxDurationInput}
              onChange={(event) => setMaxDurationInput(event.target.value)}
              placeholder="seconds"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Required Tags</span>
            <input
              value={requiredTagsInput}
              onChange={(event) => setRequiredTagsInput(event.target.value)}
              placeholder="tag:value, tag:value"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">Exclude Tags</span>
            <input
              value={excludeTagsInput}
              onChange={(event) => setExcludeTagsInput(event.target.value)}
              placeholder="tag:value, tag:value"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={includeSceneIntentTag}
            onChange={(event) => setIncludeSceneIntentTag(event.currentTarget.checked)}
            label="Include scene intent tag from current activity"
          />
        </div>

        <div className="space-y-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-neutral-700 dark:text-neutral-200">
              Room Navigation Context
            </div>
            <Button
              size="xs"
              onClick={() => void handleRefreshRoomNavigation()}
              disabled={
                busy ||
                roomNavigationBusy ||
                (ctx.world.locationId == null && roomNavigationLocationId == null)
              }
            >
              Refresh
            </Button>
          </div>
          <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
            {roomNavigationBusy
              ? 'Loading room navigation...'
              : roomNavigationError
                ? `Room navigation error: ${roomNavigationError}`
                : roomNavigation
                  ? `Loaded for location ${roomNavigationLocationId ?? 'N/A'} (${roomNavigationCheckpoints.length} checkpoints, ${roomNavigationEdgeCount} edges).`
                  : roomNavigationLocationId != null
                    ? `No room navigation configured for location ${roomNavigationLocationId}.`
                    : 'No active location selected.'}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeRoomNavigationAnchors}
              onChange={(event) =>
                setIncludeRoomNavigationAnchors(event.currentTarget.checked)
              }
              label="Include checkpoints and hotspots as anchor candidates"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={planFromCurrentCheckpoint}
              onChange={(event) =>
                setPlanFromCurrentCheckpoint(event.currentTarget.checked)
              }
              disabled={roomNavigationCheckpoints.length === 0}
              label="Plan from current checkpoint"
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-neutral-600 dark:text-neutral-300">
              Current Checkpoint
            </span>
            <select
              value={currentCheckpointId}
              onChange={(event) => setCurrentCheckpointId(event.target.value)}
              disabled={
                !planFromCurrentCheckpoint || roomNavigationCheckpoints.length === 0
              }
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
            >
              {roomNavigationCheckpoints.length === 0 ? (
                <option value="">No checkpoints available</option>
              ) : (
                roomNavigationCheckpoints.map((checkpoint) => (
                  <option key={checkpoint.id} value={checkpoint.id}>
                    {checkpoint.label || checkpoint.id}
                    {checkpoint.id === roomNavigationStartCheckpointId
                      ? ' (start)'
                      : ''}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button size="xs" onClick={() => void handleBuildRequest()} disabled={busy}>
            Build Request
          </Button>
          <Button size="xs" onClick={() => void handleBuildPlanPreview()} disabled={busy}>
            Build Scene Plan Preview
          </Button>
        </div>

        {builtRequest && (
          <div className="space-y-1">
            <div className="font-semibold text-neutral-700 dark:text-neutral-200">Behavior-Derived Request</div>
            <pre className="p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto text-[10px] leading-4">
              {JSON.stringify(builtRequest, null, 2)}
            </pre>
          </div>
        )}

        {selection && (
          <div className="space-y-1">
            <div className="font-semibold text-neutral-700 dark:text-neutral-200">Selection Summary</div>
            <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
              blocks: {selection.blocks.length} | duration: {selection.total_duration.toFixed(2)}s | compatibility: {selection.compatibility_score.toFixed(2)}
            </div>
            {selection.fallback_reason && (
              <div className="text-[11px] text-amber-700 dark:text-amber-400">
                fallback: {selection.fallback_reason}
              </div>
            )}
          </div>
        )}

        {scenePlan && (
          <div className="space-y-1">
            <div className="font-semibold text-neutral-700 dark:text-neutral-200">Scene Plan Preview JSON</div>
            <pre className="p-2 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-x-auto text-[10px] leading-4">
              {JSON.stringify(scenePlan, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
