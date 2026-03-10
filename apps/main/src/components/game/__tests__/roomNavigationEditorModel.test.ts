import { describe, expect, it } from 'vitest';

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
} from '../roomNavigationEditorModel';

const createNavigationFixture = (): RoomNavigationData => ({
  version: 1,
  room_id: 'room_fixture',
  start_checkpoint_id: 'cp_1',
  checkpoints: [
    {
      id: 'cp_1',
      label: 'Checkpoint 1',
      view: { kind: 'cylindrical_pano', pano_asset_id: 'asset:cp1' },
      hotspots: [],
    },
    {
      id: 'cp_2',
      label: 'Checkpoint 2',
      view: { kind: 'cylindrical_pano', pano_asset_id: 'asset:cp2' },
      hotspots: [
        {
          id: 'hotspot_1',
          action: 'move',
          target_checkpoint_id: 'cp_1',
        },
      ],
    },
  ],
  edges: [
    {
      id: 'edge_1',
      from_checkpoint_id: 'cp_1',
      to_checkpoint_id: 'cp_2',
      move_kind: 'forward',
    },
  ],
});

describe('roomNavigationEditorModel', () => {
  it('creates default room navigation payload', () => {
    expect(createDefaultRoomNavigation(42)).toEqual({
      version: 1,
      room_id: 'location_42',
      checkpoints: [],
      edges: [],
    });
  });

  it('adds checkpoints with generated ids and start checkpoint fallback', () => {
    const empty = createDefaultRoomNavigation(7);
    const first = addRoomCheckpoint(empty);
    const second = addRoomCheckpoint(first.navigation);

    expect(first.checkpointId).toBe('cp_1');
    expect(second.checkpointId).toBe('cp_2');
    expect(second.navigation.start_checkpoint_id).toBe('cp_1');
    expect(second.navigation.checkpoints).toHaveLength(2);
  });

  it('renames checkpoint ids and rewrites references', () => {
    const fixture = createNavigationFixture();
    const renamed = renameRoomCheckpointId(fixture, 'cp_1', 'cp_entry');

    expect(renamed.renamed).toBe(true);
    expect(renamed.nextId).toBe('cp_entry');
    expect(
      renamed.navigation.checkpoints.some((checkpoint) => checkpoint.id === 'cp_entry'),
    ).toBe(true);
    expect(renamed.navigation.start_checkpoint_id).toBe('cp_entry');
    expect(renamed.navigation.edges[0].from_checkpoint_id).toBe('cp_entry');
    expect(
      renamed.navigation.checkpoints[1].hotspots[0].target_checkpoint_id,
    ).toBe('cp_entry');
  });

  it('removes checkpoint and prunes edges + hotspot targets', () => {
    const fixture = createNavigationFixture();
    const updated = removeRoomCheckpoint(fixture, 'cp_1');

    expect(updated.checkpoints).toHaveLength(1);
    expect(updated.checkpoints[0].id).toBe('cp_2');
    expect(updated.start_checkpoint_id).toBe('cp_2');
    expect(updated.edges).toHaveLength(0);
    expect(updated.checkpoints[0].hotspots[0].target_checkpoint_id).toBeUndefined();
  });

  it('adds and removes hotspots for a checkpoint', () => {
    const fixture = createNavigationFixture();
    const added = addRoomHotspot(fixture, 'cp_1');
    expect(added.hotspotId).toBe('hotspot_1');
    const cp1 = added.navigation.checkpoints.find((checkpoint) => checkpoint.id === 'cp_1');
    expect(cp1?.hotspots).toHaveLength(1);

    const removed = removeRoomHotspot(added.navigation, 'cp_1', 0);
    const cp1AfterRemove = removed.checkpoints.find((checkpoint) => checkpoint.id === 'cp_1');
    expect(cp1AfterRemove?.hotspots).toHaveLength(0);
  });

  it('adds and removes edges with selected checkpoint preference', () => {
    const fixture = createNavigationFixture();
    const added = addRoomEdge(fixture, 'cp_2');

    expect(added.edgeId).toBe('edge_2');
    expect(added.navigation.edges).toHaveLength(2);
    expect(added.navigation.edges[1].from_checkpoint_id).toBe('cp_2');
    expect(added.navigation.edges[1].to_checkpoint_id).toBe('cp_1');

    const removed = removeRoomEdge(added.navigation, 1);
    expect(removed.edges).toHaveLength(1);
    expect(removed.edges[0].id).toBe('edge_1');
  });
});
