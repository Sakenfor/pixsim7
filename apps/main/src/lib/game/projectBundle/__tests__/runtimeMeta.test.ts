import { describe, expect, it } from 'vitest';

import {
  canonicalizeProjectRuntimeMeta,
  readProjectRuntimePreferences,
} from '../runtimeMeta';

describe('project runtime metadata canonicalization', () => {
  it('migrates legacy Bananza keys to canonical project_runtime keys', () => {
    const canonical = canonicalizeProjectRuntimeMeta({
      bananza_runtime: {
        seeder_mode: 'direct',
        sync_mode: 'none',
        watch_enabled: false,
      },
      bananza_seeder_mode: 'api',
      bananza_sync_mode: 'two_way',
      bananza_watch_enabled: true,
    });

    expect(canonical).toEqual({
      project_runtime: {
        mode: 'direct',
        sync_mode: 'none',
        watch_enabled: false,
      },
      project_runtime_mode: 'direct',
      project_sync_mode: 'none',
      project_watch_enabled: false,
    });
  });

  it('is idempotent and strips legacy duplicates on round-trip', () => {
    const raw = {
      project_runtime: {
        mode: 'api',
        sync_mode: 'two_way',
        watch_enabled: true,
      },
      project_runtime_mode: 'api',
      project_sync_mode: 'two_way',
      project_watch_enabled: true,
      bananza_sync_mode: 'none',
      bananza_watch_enabled: false,
    };

    const first = canonicalizeProjectRuntimeMeta(raw);
    const second = canonicalizeProjectRuntimeMeta(first);

    expect(second).toEqual(first);
    expect(second).not.toHaveProperty('bananza_runtime');
    expect(second).not.toHaveProperty('bananza_seeder_mode');
    expect(second).not.toHaveProperty('bananza_sync_mode');
    expect(second).not.toHaveProperty('bananza_watch_enabled');
  });

  it('reads canonicalized values with defaults', () => {
    expect(
      readProjectRuntimePreferences({
        bananza_runtime: {
          seeder_mode: 'direct',
          sync_mode: 'file_to_backend',
          watch_enabled: false,
        },
      }),
    ).toEqual({
      seederMode: 'direct',
      syncMode: 'file_to_backend',
      watchEnabled: false,
    });

    expect(readProjectRuntimePreferences({})).toEqual({
      seederMode: 'api',
      syncMode: 'two_way',
      watchEnabled: true,
    });
  });
});
