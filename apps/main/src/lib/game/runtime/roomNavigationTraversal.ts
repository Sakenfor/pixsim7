import type { GizmoResult, SceneGizmoConfig } from '@pixsim7/interaction.gizmos';
import { validateRoomNavigation } from '@pixsim7/shared.types';
import type { RoomEdgeMoveKind } from '@pixsim7/shared.types';

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

const ROOM_NAV_SEGMENT_PREFIX = 'room_nav';
const ROOM_NAV_SEGMENT_DELIMITER = '|';

export type RoomNavigationTraversalSourceType = 'edge' | 'hotspot';

export interface RoomNavigationTraversalOption {
  id: string;
  source: string;
  sourceType: RoomNavigationTraversalSourceType;
  sourceId: string;
  label: string;
  fromCheckpointId: string;
  toCheckpointId: string;
  moveKind: RoomEdgeMoveKind;
  transitionProfile?: string;
  edgeId?: string;
  hotspotId?: string;
  segmentId: string;
}

interface SegmentPayload {
  sourceType: RoomNavigationTraversalSourceType;
  sourceId: string;
  toCheckpointId: string;
}

const encodeSegmentPart = (value: string): string => encodeURIComponent(value);

const decodeSegmentPart = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

export const createRoomNavigationTraversalSegmentId = (
  payload: SegmentPayload,
): string =>
  [
    ROOM_NAV_SEGMENT_PREFIX,
    payload.sourceType,
    encodeSegmentPart(payload.sourceId),
    encodeSegmentPart(payload.toCheckpointId),
  ].join(ROOM_NAV_SEGMENT_DELIMITER);

export const parseRoomNavigationTraversalSegmentId = (
  segmentId: string | null | undefined,
): SegmentPayload | null => {
  if (!segmentId) {
    return null;
  }
  const parts = segmentId.split(ROOM_NAV_SEGMENT_DELIMITER);
  if (parts.length !== 4 || parts[0] !== ROOM_NAV_SEGMENT_PREFIX) {
    return null;
  }

  const sourceType = parts[1];
  if (sourceType !== 'edge' && sourceType !== 'hotspot') {
    return null;
  }

  const sourceId = decodeSegmentPart(parts[2]);
  const toCheckpointId = decodeSegmentPart(parts[3]);
  if (!sourceId || !toCheckpointId) {
    return null;
  }

  return {
    sourceType,
    sourceId,
    toCheckpointId,
  };
};

export const createRoomNavigationTraversalOptions = (input: {
  navigation: RoomNavigationData;
  activeCheckpointId: string | null | undefined;
}): RoomNavigationTraversalOption[] => {
  const checkpointId = input.activeCheckpointId ?? undefined;
  if (!checkpointId) {
    return [];
  }

  const activeCheckpoint = input.navigation.checkpoints.find(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  if (!activeCheckpoint) {
    return [];
  }

  const options: RoomNavigationTraversalOption[] = [];

  for (const hotspot of activeCheckpoint.hotspots) {
    if (hotspot.action !== 'move' || !hotspot.target_checkpoint_id) {
      continue;
    }

    const matchedEdge = input.navigation.edges.find(
      (edge) =>
        edge.from_checkpoint_id === activeCheckpoint.id &&
        edge.to_checkpoint_id === hotspot.target_checkpoint_id,
    );

    options.push({
      id: `hotspot:${hotspot.id}`,
      source: `hotspot:${hotspot.id}`,
      sourceType: 'hotspot',
      sourceId: hotspot.id,
      label: hotspot.label || hotspot.id,
      fromCheckpointId: activeCheckpoint.id,
      toCheckpointId: hotspot.target_checkpoint_id,
      moveKind: matchedEdge?.move_kind ?? 'forward',
      transitionProfile: matchedEdge?.transition_profile,
      edgeId: matchedEdge?.id,
      hotspotId: hotspot.id,
      segmentId: createRoomNavigationTraversalSegmentId({
        sourceType: 'hotspot',
        sourceId: hotspot.id,
        toCheckpointId: hotspot.target_checkpoint_id,
      }),
    });
  }

  const outgoingEdges = input.navigation.edges.filter(
    (edge) => edge.from_checkpoint_id === activeCheckpoint.id,
  );
  for (const edge of outgoingEdges) {
    options.push({
      id: `edge:${edge.id}`,
      source: `edge:${edge.id}`,
      sourceType: 'edge',
      sourceId: edge.id,
      label: `${edge.move_kind} (${edge.id})`,
      fromCheckpointId: edge.from_checkpoint_id,
      toCheckpointId: edge.to_checkpoint_id,
      moveKind: edge.move_kind,
      transitionProfile: edge.transition_profile,
      edgeId: edge.id,
      segmentId: createRoomNavigationTraversalSegmentId({
        sourceType: 'edge',
        sourceId: edge.id,
        toCheckpointId: edge.to_checkpoint_id,
      }),
    });
  }

  return options;
};

export const buildRoomNavigationGizmoConfig = (
  options: readonly RoomNavigationTraversalOption[],
  input?: {
    style?: SceneGizmoConfig['style'];
  },
): SceneGizmoConfig => {
  const style = input?.style ?? 'orb';
  const ringRadiusBase = 90;
  const ringRadiusStep = 44;

  const zones = options.map((option, index) => {
    const angle = (index / Math.max(options.length, 1)) * Math.PI * 2;
    return {
      id: option.id,
      position: {
        x: Number(Math.cos(angle).toFixed(4)),
        y: option.sourceType === 'hotspot' ? 0.35 : -0.35,
        z: Number(Math.sin(angle).toFixed(4)),
      },
      radius: style === 'rings' ? ringRadiusBase + index * ringRadiusStep : 0.4,
      segmentId: option.segmentId,
      label:
        option.sourceType === 'hotspot'
          ? `Hotspot: ${option.label}`
          : `Edge: ${option.moveKind}`,
      tags: [
        'room_navigation',
        `source:${option.sourceType}`,
        `move_kind:${option.moveKind}`,
        `target:${option.toCheckpointId}`,
      ],
      intensity: option.sourceType === 'hotspot' ? 0.78 : 0.62,
      color: option.sourceType === 'hotspot' ? '#34d399' : '#60a5fa',
    };
  });

  return {
    style,
    zones,
    visual: {
      baseColor: '#334155',
      activeColor: '#22d3ee',
      particleType: 'stars',
      glowIntensity: 0.65,
      trailLength: 0.45,
      opacity: 0.9,
    },
    physics: {
      friction: 0.95,
      springiness: 0.8,
      magnetism: true,
    },
  };
};

export const resolveRoomNavigationOptionFromGizmoResult = (
  result: Pick<GizmoResult, 'segmentId'> | null | undefined,
  options: readonly RoomNavigationTraversalOption[],
): RoomNavigationTraversalOption | null => {
  const segmentId = result?.segmentId;
  if (!segmentId) {
    return null;
  }

  const parsed = parseRoomNavigationTraversalSegmentId(segmentId);
  if (!parsed) {
    return options.find((option) => option.segmentId === segmentId) ?? null;
  }

  return (
    options.find(
      (option) =>
        option.sourceType === parsed.sourceType &&
        option.sourceId === parsed.sourceId &&
        option.toCheckpointId === parsed.toCheckpointId,
    ) ??
    options.find((option) => option.segmentId === segmentId) ??
    null
  );
};
