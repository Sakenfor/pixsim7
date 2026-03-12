import { z } from 'zod';

export const ROOM_NAVIGATION_META_KEY = 'room_navigation' as const;

export const RoomCheckpointViewKindSchema = z.enum([
  'cylindrical_pano',
  'quad_directions',
]);

export type RoomCheckpointViewKind = z.infer<typeof RoomCheckpointViewKindSchema>;

export const RoomHotspotActionSchema = z.enum(['move', 'inspect', 'interact']);
export type RoomHotspotAction = z.infer<typeof RoomHotspotActionSchema>;

export const RoomEdgeMoveKindSchema = z.enum([
  'forward',
  'turn_left',
  'turn_right',
  'door',
  'custom',
]);

export type RoomEdgeMoveKind = z.infer<typeof RoomEdgeMoveKindSchema>;

export const RoomCheckpointViewSchema = z.object({
  kind: RoomCheckpointViewKindSchema,
  pano_asset_id: z.string().min(1).optional(),
  north_asset_id: z.string().min(1).optional(),
  east_asset_id: z.string().min(1).optional(),
  south_asset_id: z.string().min(1).optional(),
  west_asset_id: z.string().min(1).optional(),
  fov_default: z.number().gt(0).lte(180).optional(),
  yaw_default: z.number().optional(),
  pitch_default: z.number().gte(-90).lte(90).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === 'cylindrical_pano' && !value.pano_asset_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pano_asset_id'],
      message: 'pano_asset_id is required when view.kind is cylindrical_pano',
    });
  }

  if (value.kind === 'quad_directions') {
    const requiredKeys: Array<keyof typeof value> = [
      'north_asset_id',
      'east_asset_id',
      'south_asset_id',
      'west_asset_id',
    ];
    for (const key of requiredKeys) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when view.kind is quad_directions`,
        });
      }
    }
  }
});

export type RoomCheckpointView = z.infer<typeof RoomCheckpointViewSchema>;

export const RoomHotspotSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  screen_hint: z.object({
    yaw: z.number(),
    pitch: z.number(),
  }).optional(),
  action: RoomHotspotActionSchema,
  target_checkpoint_id: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'move' && !value.target_checkpoint_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['target_checkpoint_id'],
      message: 'target_checkpoint_id is required when hotspot action is move',
    });
  }
});

export type RoomHotspot = z.infer<typeof RoomHotspotSchema>;

export const RoomCheckpointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  view: RoomCheckpointViewSchema,
  hotspots: z.array(RoomHotspotSchema).default([]),
  tags: z.array(z.string()).optional(),
});

export type RoomCheckpoint = z.infer<typeof RoomCheckpointSchema>;

export const RoomEdgeSchema = z.object({
  id: z.string().min(1),
  from_checkpoint_id: z.string().min(1),
  to_checkpoint_id: z.string().min(1),
  move_kind: RoomEdgeMoveKindSchema,
  transition_profile: z.string().optional(),
});

export type RoomEdge = z.infer<typeof RoomEdgeSchema>;

export const RoomNavigationSchema = z.object({
  version: z.literal(1),
  room_id: z.string().min(1),
  checkpoints: z.array(RoomCheckpointSchema).default([]),
  edges: z.array(RoomEdgeSchema).default([]),
  start_checkpoint_id: z.string().min(1).optional(),
});

export type RoomNavigation = z.infer<typeof RoomNavigationSchema>;

export interface RoomNavigationValidationIssue {
  path: string;
  message: string;
}

export type RoomNavigationValidationResult =
  | { ok: true; data: RoomNavigation; issues: [] }
  | { ok: false; issues: RoomNavigationValidationIssue[] };

const formatIssuePath = (path: Array<string | number>): string => {
  if (!path.length) {
    return 'room_navigation';
  }
  let output = 'room_navigation';
  for (const segment of path) {
    if (typeof segment === 'number') {
      output += `[${segment}]`;
    } else {
      output += `.${segment}`;
    }
  }
  return output;
};

const buildSemanticIssues = (value: RoomNavigation): RoomNavigationValidationIssue[] => {
  const issues: RoomNavigationValidationIssue[] = [];
  const checkpointIndexById = new Map<string, number>();
  const edgeIndexById = new Map<string, number>();

  value.checkpoints.forEach((checkpoint, checkpointIndex) => {
    const existingCheckpointIndex = checkpointIndexById.get(checkpoint.id);
    if (existingCheckpointIndex !== undefined) {
      issues.push({
        path: `room_navigation.checkpoints[${checkpointIndex}].id`,
        message: `duplicate checkpoint id "${checkpoint.id}" (already used at checkpoints[${existingCheckpointIndex}])`,
      });
    } else {
      checkpointIndexById.set(checkpoint.id, checkpointIndex);
    }

    const hotspotIndexById = new Map<string, number>();
    checkpoint.hotspots.forEach((hotspot, hotspotIndex) => {
      const existingHotspotIndex = hotspotIndexById.get(hotspot.id);
      if (existingHotspotIndex !== undefined) {
        issues.push({
          path: `room_navigation.checkpoints[${checkpointIndex}].hotspots[${hotspotIndex}].id`,
          message: `duplicate hotspot id "${hotspot.id}" within checkpoint "${checkpoint.id}"`,
        });
      } else {
        hotspotIndexById.set(hotspot.id, hotspotIndex);
      }
    });
  });

  if (value.start_checkpoint_id && !checkpointIndexById.has(value.start_checkpoint_id)) {
    issues.push({
      path: 'room_navigation.start_checkpoint_id',
      message: `start_checkpoint_id "${value.start_checkpoint_id}" does not exist in checkpoints`,
    });
  }

  value.edges.forEach((edge, edgeIndex) => {
    const existingEdgeIndex = edgeIndexById.get(edge.id);
    if (existingEdgeIndex !== undefined) {
      issues.push({
        path: `room_navigation.edges[${edgeIndex}].id`,
        message: `duplicate edge id "${edge.id}" (already used at edges[${existingEdgeIndex}])`,
      });
    } else {
      edgeIndexById.set(edge.id, edgeIndex);
    }

    if (!checkpointIndexById.has(edge.from_checkpoint_id)) {
      issues.push({
        path: `room_navigation.edges[${edgeIndex}].from_checkpoint_id`,
        message: `edge from_checkpoint_id "${edge.from_checkpoint_id}" does not exist in checkpoints`,
      });
    }
    if (!checkpointIndexById.has(edge.to_checkpoint_id)) {
      issues.push({
        path: `room_navigation.edges[${edgeIndex}].to_checkpoint_id`,
        message: `edge to_checkpoint_id "${edge.to_checkpoint_id}" does not exist in checkpoints`,
      });
    }
  });

  value.checkpoints.forEach((checkpoint, checkpointIndex) => {
    checkpoint.hotspots.forEach((hotspot, hotspotIndex) => {
      if (!hotspot.target_checkpoint_id) {
        return;
      }
      if (!checkpointIndexById.has(hotspot.target_checkpoint_id)) {
        issues.push({
          path: `room_navigation.checkpoints[${checkpointIndex}].hotspots[${hotspotIndex}].target_checkpoint_id`,
          message: `hotspot target_checkpoint_id "${hotspot.target_checkpoint_id}" does not exist in checkpoints`,
        });
      }
    });
  });

  return issues;
};

export const validateRoomNavigation = (input: unknown): RoomNavigationValidationResult => {
  const parsed = RoomNavigationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
      })),
    };
  }

  const semanticIssues = buildSemanticIssues(parsed.data);
  if (semanticIssues.length > 0) {
    return { ok: false, issues: semanticIssues };
  }

  return {
    ok: true,
    data: parsed.data,
    issues: [],
  };
};
