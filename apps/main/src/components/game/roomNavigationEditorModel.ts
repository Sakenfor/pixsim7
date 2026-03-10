import { validateRoomNavigation } from '@pixsim7/shared.types';

type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

export type { RoomNavigationData };

export const createDefaultRoomNavigation = (
  locationId: number,
): RoomNavigationData => ({
  version: 1,
  room_id: `location_${locationId}`,
  checkpoints: [],
  edges: [],
});

export const createNextRoomNavigationId = (
  prefix: string,
  existingIds: Iterable<string>,
): string => {
  const used = new Set(existingIds);
  let index = 1;
  while (used.has(`${prefix}_${index}`)) {
    index += 1;
  }
  return `${prefix}_${index}`;
};

export const addRoomCheckpoint = (
  navigation: RoomNavigationData,
): { navigation: RoomNavigationData; checkpointId: string } => {
  const checkpointId = createNextRoomNavigationId(
    'cp',
    navigation.checkpoints.map((checkpoint) => checkpoint.id),
  );
  return {
    checkpointId,
    navigation: {
      ...navigation,
      checkpoints: [
        ...navigation.checkpoints,
        {
          id: checkpointId,
          label: `Checkpoint ${navigation.checkpoints.length + 1}`,
          view: { kind: 'cylindrical_pano' },
          hotspots: [],
        },
      ],
      start_checkpoint_id: navigation.start_checkpoint_id ?? checkpointId,
    },
  };
};

export const removeRoomCheckpoint = (
  navigation: RoomNavigationData,
  checkpointId: string,
): RoomNavigationData => {
  const checkpoints = navigation.checkpoints
    .filter((checkpoint) => checkpoint.id !== checkpointId)
    .map((checkpoint) => ({
      ...checkpoint,
      hotspots: checkpoint.hotspots.map((hotspot) =>
        hotspot.target_checkpoint_id === checkpointId
          ? { ...hotspot, target_checkpoint_id: undefined }
          : hotspot,
      ),
    }));

  return {
    ...navigation,
    checkpoints,
    edges: navigation.edges.filter(
      (edge) =>
        edge.from_checkpoint_id !== checkpointId &&
        edge.to_checkpoint_id !== checkpointId,
    ),
    start_checkpoint_id:
      navigation.start_checkpoint_id === checkpointId
        ? checkpoints[0]?.id
        : navigation.start_checkpoint_id,
  };
};

export const renameRoomCheckpointId = (
  navigation: RoomNavigationData,
  checkpointId: string,
  rawNextId: string,
): { navigation: RoomNavigationData; renamed: boolean; nextId: string } => {
  const nextId = rawNextId.trim();
  if (!nextId || nextId === checkpointId) {
    return {
      navigation,
      renamed: false,
      nextId: checkpointId,
    };
  }

  return {
    renamed: true,
    nextId,
    navigation: {
      ...navigation,
      checkpoints: navigation.checkpoints.map((checkpoint) => {
        const withRewrittenHotspots = checkpoint.hotspots.map((hotspot) =>
          hotspot.target_checkpoint_id === checkpointId
            ? { ...hotspot, target_checkpoint_id: nextId }
            : hotspot,
        );
        if (checkpoint.id !== checkpointId) {
          return { ...checkpoint, hotspots: withRewrittenHotspots };
        }
        return {
          ...checkpoint,
          id: nextId,
          hotspots: withRewrittenHotspots,
        };
      }),
      edges: navigation.edges.map((edge) => ({
        ...edge,
        from_checkpoint_id:
          edge.from_checkpoint_id === checkpointId ? nextId : edge.from_checkpoint_id,
        to_checkpoint_id:
          edge.to_checkpoint_id === checkpointId ? nextId : edge.to_checkpoint_id,
      })),
      start_checkpoint_id:
        navigation.start_checkpoint_id === checkpointId
          ? nextId
          : navigation.start_checkpoint_id,
    },
  };
};

export const addRoomHotspot = (
  navigation: RoomNavigationData,
  checkpointId: string,
): { navigation: RoomNavigationData; hotspotId: string | null } => {
  const checkpoint = navigation.checkpoints.find((row) => row.id === checkpointId);
  if (!checkpoint) {
    return { navigation, hotspotId: null };
  }
  const hotspotId = createNextRoomNavigationId(
    'hotspot',
    checkpoint.hotspots.map((hotspot) => hotspot.id),
  );
  return {
    hotspotId,
    navigation: {
      ...navigation,
      checkpoints: navigation.checkpoints.map((row) =>
        row.id === checkpointId
          ? {
              ...row,
              hotspots: [
                ...row.hotspots,
                {
                  id: hotspotId,
                  action: 'move',
                },
              ],
            }
          : row,
      ),
    },
  };
};

export const removeRoomHotspot = (
  navigation: RoomNavigationData,
  checkpointId: string,
  hotspotIndex: number,
): RoomNavigationData => ({
  ...navigation,
  checkpoints: navigation.checkpoints.map((checkpoint) =>
    checkpoint.id === checkpointId
      ? {
          ...checkpoint,
          hotspots: checkpoint.hotspots.filter((_, index) => index !== hotspotIndex),
        }
      : checkpoint,
  ),
});

export const addRoomEdge = (
  navigation: RoomNavigationData,
  selectedCheckpointId?: string | null,
): { navigation: RoomNavigationData; edgeId: string | null } => {
  if (navigation.checkpoints.length === 0) {
    return {
      navigation,
      edgeId: null,
    };
  }

  const edgeId = createNextRoomNavigationId(
    'edge',
    navigation.edges.map((edge) => edge.id),
  );
  const fromCheckpointId =
    selectedCheckpointId &&
    navigation.checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)
      ? selectedCheckpointId
      : navigation.checkpoints[0].id;
  const toCheckpointId =
    navigation.checkpoints.find((checkpoint) => checkpoint.id !== fromCheckpointId)
      ?.id ?? fromCheckpointId;

  return {
    edgeId,
    navigation: {
      ...navigation,
      edges: [
        ...navigation.edges,
        {
          id: edgeId,
          from_checkpoint_id: fromCheckpointId,
          to_checkpoint_id: toCheckpointId,
          move_kind: 'forward',
        },
      ],
    },
  };
};

export const removeRoomEdge = (
  navigation: RoomNavigationData,
  edgeIndex: number,
): RoomNavigationData => ({
  ...navigation,
  edges: navigation.edges.filter((_, index) => index !== edgeIndex),
});
