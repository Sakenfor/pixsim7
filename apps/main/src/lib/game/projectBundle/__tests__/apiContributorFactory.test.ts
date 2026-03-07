import { describe, expect, it, vi } from 'vitest';

import {
  createApiSnapshotAuthoringContributor,
  type ParsedSnapshotPayload,
} from '../apiContributorFactory';

interface TestSnapshot {
  id: string;
  label: string;
}

interface TestPayload {
  version: number;
  items: TestSnapshot[];
}

describe('createApiSnapshotAuthoringContributor', () => {
  it('exports payload from sources and imports using upsert behavior', async () => {
    const listExportSources = vi.fn().mockResolvedValue(['a', 'b']);
    const sourceToSnapshot = vi
      .fn<[string], Promise<TestSnapshot | null>>()
      .mockImplementation(async (id) => ({ id, label: id.toUpperCase() }));
    const buildPayload = vi
      .fn<[TestSnapshot[], number], TestPayload | null>()
      .mockImplementation((items, version) => ({ version, items }));
    const parsePayload = vi
      .fn<[unknown, number], ParsedSnapshotPayload<TestSnapshot> | null>()
      .mockImplementation((payload) => {
        const value = payload as TestPayload;
        if (!value || !Array.isArray(value.items)) {
          return null;
        }
        return { version: value.version, items: value.items };
      });
    const listExistingIds = vi.fn().mockResolvedValue(new Set<string>(['a']));
    const createFromSnapshot = vi.fn().mockResolvedValue(undefined);
    const updateFromSnapshot = vi.fn().mockResolvedValue(undefined);

    const contributor = createApiSnapshotAuthoringContributor<
      string,
      TestSnapshot,
      TestPayload
    >({
      key: 'authoring.test_factory',
      version: 1,
      listExportSources,
      sourceToSnapshot,
      buildPayload,
      parsePayload,
      listExistingIds,
      getSnapshotId: (snapshot) => snapshot.id,
      createFromSnapshot,
      updateFromSnapshot,
    });

    const exported = await contributor.export?.({} as never);
    expect(exported).toEqual({
      version: 1,
      items: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });

    const importOutcome = await contributor.import?.(
      {
        version: 1,
        items: [
          { id: 'a', label: 'AA' },
          { id: 'b', label: 'BB' },
        ],
      },
      {} as never,
    );

    expect(updateFromSnapshot).toHaveBeenCalledWith({ id: 'a', label: 'AA' });
    expect(createFromSnapshot).toHaveBeenCalledWith({ id: 'b', label: 'BB' });
    expect(importOutcome).toEqual({});
  });

  it('returns invalid payload warning when parser fails', async () => {
    const contributor = createApiSnapshotAuthoringContributor<
      string,
      TestSnapshot,
      TestPayload
    >({
      key: 'authoring.test_invalid',
      version: 1,
      listExportSources: async () => [],
      sourceToSnapshot: async () => null,
      buildPayload: () => null,
      parsePayload: () => null,
      listExistingIds: async () => new Set<string>(),
      getSnapshotId: (snapshot) => snapshot.id,
      createFromSnapshot: async () => undefined,
      updateFromSnapshot: async () => undefined,
      invalidPayloadWarning: 'invalid payload',
    });

    const outcome = await contributor.import?.({} as never, {} as never);
    expect(outcome).toEqual({ warnings: ['invalid payload'] });
  });
});
