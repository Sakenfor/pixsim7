import { describe, expect, it } from 'vitest';

import {
  buildRoomNavigationGizmoConfig,
  createRoomNavigationTraversalOptions,
  createRoomNavigationTraversalSegmentId,
  parseRoomNavigationTraversalSegmentId,
  resolveRoomNavigationOptionFromGizmoResult,
} from '../roomNavigationTraversal';

type RoomNavigationData = Parameters<
  typeof createRoomNavigationTraversalOptions
>[0]['navigation'];

const navigationFixture: RoomNavigationData = {
  version: 1,
  room_id: 'room_alpha',
  start_checkpoint_id: 'cp_a',
  checkpoints: [
    {
      id: 'cp_a',
      label: 'Checkpoint A',
      view: {
        kind: 'cylindrical_pano',
        pano_asset_id: '1001',
      },
      hotspots: [
        {
          id: 'hotspot_move',
          label: 'Move to B',
          action: 'move',
          target_checkpoint_id: 'cp_b',
        },
        {
          id: 'hotspot_inspect',
          label: 'Inspect',
          action: 'inspect',
        },
      ],
    },
    {
      id: 'cp_b',
      label: 'Checkpoint B',
      view: {
        kind: 'cylindrical_pano',
        pano_asset_id: '1002',
      },
      hotspots: [],
    },
    {
      id: 'cp_c',
      label: 'Checkpoint C',
      view: {
        kind: 'cylindrical_pano',
        pano_asset_id: '1003',
      },
      hotspots: [],
    },
  ],
  edges: [
    {
      id: 'edge_ab',
      from_checkpoint_id: 'cp_a',
      to_checkpoint_id: 'cp_b',
      move_kind: 'door',
      transition_profile: 'open_door',
    },
    {
      id: 'edge_ac',
      from_checkpoint_id: 'cp_a',
      to_checkpoint_id: 'cp_c',
      move_kind: 'turn_right',
    },
  ],
};

describe('roomNavigationTraversal', () => {
  it('builds traversal options from active hotspot and outgoing edges', () => {
    const options = createRoomNavigationTraversalOptions({
      navigation: navigationFixture,
      activeCheckpointId: 'cp_a',
    });

    expect(options).toHaveLength(3);

    const hotspotOption = options.find(
      (option) => option.source === 'hotspot:hotspot_move',
    );
    expect(hotspotOption).toMatchObject({
      sourceType: 'hotspot',
      toCheckpointId: 'cp_b',
      moveKind: 'door',
      edgeId: 'edge_ab',
      transitionProfile: 'open_door',
    });

    const edgeOption = options.find((option) => option.source === 'edge:edge_ac');
    expect(edgeOption).toMatchObject({
      sourceType: 'edge',
      toCheckpointId: 'cp_c',
      moveKind: 'turn_right',
      edgeId: 'edge_ac',
    });
  });

  it('round-trips traversal segment ids', () => {
    const segmentId = createRoomNavigationTraversalSegmentId({
      sourceType: 'hotspot',
      sourceId: 'hotspot 1/2',
      toCheckpointId: 'cp?b',
    });

    const parsed = parseRoomNavigationTraversalSegmentId(segmentId);
    expect(parsed).toEqual({
      sourceType: 'hotspot',
      sourceId: 'hotspot 1/2',
      toCheckpointId: 'cp?b',
    });
    expect(parseRoomNavigationTraversalSegmentId('invalid:segment')).toBeNull();
  });

  it('creates gizmo config zones from traversal options', () => {
    const options = createRoomNavigationTraversalOptions({
      navigation: navigationFixture,
      activeCheckpointId: 'cp_a',
    });
    const config = buildRoomNavigationGizmoConfig(options, { style: 'rings' });

    expect(config.style).toBe('rings');
    expect(config.zones).toHaveLength(options.length);
    expect(config.zones[0].segmentId).toBe(options[0].segmentId);
    expect(config.zones[0].tags).toContain('room_navigation');
  });

  it('resolves traversal option from gizmo result segment', () => {
    const options = createRoomNavigationTraversalOptions({
      navigation: navigationFixture,
      activeCheckpointId: 'cp_a',
    });
    const target = options[1];

    const resolved = resolveRoomNavigationOptionFromGizmoResult(
      { segmentId: target.segmentId },
      options,
    );
    expect(resolved?.id).toBe(target.id);

    const missing = resolveRoomNavigationOptionFromGizmoResult(
      { segmentId: 'room_nav|edge|missing|cp_x' },
      options,
    );
    expect(missing).toBeNull();
  });
});
