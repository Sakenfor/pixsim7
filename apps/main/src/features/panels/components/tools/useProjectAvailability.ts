import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  exportWorldProject,
  pixsimClient,
} from '@lib/api';
import {
  resolveBlockPrimitives,
  resolveBlockTemplates,
  resolveContentPacks,
  resolveGameWorlds,
  resolveSavedGameProjects,
} from '@lib/resolvers';

import { useSceneArtifactStore } from '@/domain/sceneArtifact';

type AvailabilityStatus = 'loading' | 'ok' | 'error';

type RemoteAvailabilityKey =
  | 'worlds'
  | 'locations'
  | 'npcs'
  | 'saved_projects'
  | 'block_templates'
  | 'block_primitives'
  | 'content_packs'
  | 'world_behavior'
  | 'world_scheduler';

type AvailabilityKey = RemoteAvailabilityKey | 'scene_artifacts';

export interface AvailabilityItem {
  key: AvailabilityKey;
  label: string;
  status: AvailabilityStatus;
  count?: number;
  sampled?: boolean;
  detail?: string;
  error?: string;
}

interface AvailabilityLoadResult {
  count?: number;
  sampled?: boolean;
  detail?: string;
}

interface RemoteTaskSpec {
  key: RemoteAvailabilityKey;
  label: string;
  load: () => Promise<AvailabilityLoadResult>;
}

const QUERY_LIMIT = 200;

const REMOTE_LABELS: Record<RemoteAvailabilityKey, string> = {
  worlds: 'Worlds',
  locations: 'Locations',
  npcs: 'NPCs',
  saved_projects: 'Saved Projects',
  block_templates: 'Block Templates',
  block_primitives: 'Block Primitives',
  content_packs: 'Content Packs',
  world_behavior: 'Selected World Behavior',
  world_scheduler: 'Selected World Scheduler',
};

const REMOTE_ORDER: RemoteAvailabilityKey[] = [
  'worlds',
  'locations',
  'npcs',
  'saved_projects',
  'block_templates',
  'block_primitives',
  'content_packs',
  'world_behavior',
  'world_scheduler',
];

function formatErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const trimmed = raw.trim();
  if (trimmed.length <= 120) return trimmed || 'Unknown error';
  return `${trimmed.slice(0, 117)}...`;
}

function parseBehaviorSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Loaded';
  const record = payload as Record<string, unknown>;
  const activities = record.activities;
  const routines = record.routines;
  const activityCount =
    activities && typeof activities === 'object' ? Object.keys(activities as Record<string, unknown>).length : 0;
  const routineCount =
    routines && typeof routines === 'object' ? Object.keys(routines as Record<string, unknown>).length : 0;
  if (activityCount === 0 && routineCount === 0) {
    return 'No activities/routines configured';
  }
  return `activities ${activityCount}, routines ${routineCount}`;
}

function parseSchedulerSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Loaded';
  const record = payload as Record<string, unknown>;
  const pausedValue = record.paused;
  const intervalValue = record.tick_interval_seconds;
  const pausedText =
    typeof pausedValue === 'boolean' ? (pausedValue ? 'paused' : 'running') : 'status unknown';
  const parsedInterval = Number(intervalValue);
  const intervalText = Number.isFinite(parsedInterval) ? `, tick ${parsedInterval}s` : '';
  return `${pausedText}${intervalText}`;
}

function loadingEntry(key: RemoteAvailabilityKey): AvailabilityItem {
  return {
    key,
    label: REMOTE_LABELS[key],
    status: 'loading',
  };
}

function noWorldEntry(key: 'world_behavior' | 'world_scheduler'): AvailabilityItem {
  return {
    key,
    label: REMOTE_LABELS[key],
    status: 'ok',
    detail: 'No world selected',
  };
}

function buildTaskSpecs(selectedWorldId: number | null): RemoteTaskSpec[] {
  const exportedBundlePromise = selectedWorldId != null ? exportWorldProject(selectedWorldId) : null;

  const specs: RemoteTaskSpec[] = [
    {
      key: 'worlds',
      label: REMOTE_LABELS.worlds,
      load: async () => ({
        count: (await resolveGameWorlds({ consumerId: 'useProjectAvailability.loadWorlds' })).length,
      }),
    },
    {
      key: 'locations',
      label: REMOTE_LABELS.locations,
      load: async () => {
        if (!exportedBundlePromise) {
          return { detail: 'No world selected' };
        }
        const bundle = await exportedBundlePromise;
        return { count: bundle.core.locations.length };
      },
    },
    {
      key: 'npcs',
      label: REMOTE_LABELS.npcs,
      load: async () => {
        if (!exportedBundlePromise) {
          return { detail: 'No world selected' };
        }
        const bundle = await exportedBundlePromise;
        return { count: bundle.core.npcs.length };
      },
    },
    {
      key: 'saved_projects',
      label: REMOTE_LABELS.saved_projects,
      load: async () => {
        const rows = await resolveSavedGameProjects(
          { limit: QUERY_LIMIT },
          { consumerId: 'useProjectAvailability.savedProjects' },
        );
        return { count: rows.length, sampled: rows.length >= QUERY_LIMIT };
      },
    },
    {
      key: 'block_templates',
      label: REMOTE_LABELS.block_templates,
      load: async () => {
        const rows = await resolveBlockTemplates(
          { limit: QUERY_LIMIT },
          { consumerId: 'useProjectAvailability.blockTemplates' },
        );
        return { count: rows.length, sampled: rows.length >= QUERY_LIMIT };
      },
    },
    {
      key: 'block_primitives',
      label: REMOTE_LABELS.block_primitives,
      load: async () => {
        const rows = await resolveBlockPrimitives(
          { limit: QUERY_LIMIT },
          { consumerId: 'useProjectAvailability.blockPrimitives' },
        );
        return { count: rows.length, sampled: rows.length >= QUERY_LIMIT };
      },
    },
    {
      key: 'content_packs',
      label: REMOTE_LABELS.content_packs,
      load: async () => ({
        count: (
          await resolveContentPacks({ consumerId: 'useProjectAvailability.contentPacks' })
        ).length,
      }),
    },
  ];

  if (selectedWorldId != null) {
    specs.push(
      {
        key: 'world_behavior',
        label: REMOTE_LABELS.world_behavior,
        load: async () => {
          const payload = await pixsimClient.get<Record<string, unknown>>(
            `/game/worlds/${selectedWorldId}/behavior`,
          );
          return { detail: parseBehaviorSummary(payload) };
        },
      },
      {
        key: 'world_scheduler',
        label: REMOTE_LABELS.world_scheduler,
        load: async () => {
          const payload = await pixsimClient.get<Record<string, unknown>>(
            `/game/worlds/${selectedWorldId}/scheduler/config`,
          );
          return { detail: parseSchedulerSummary(payload) };
        },
      },
    );
  }

  return specs;
}

function toEntryFromResult(
  spec: RemoteTaskSpec,
  settled: PromiseSettledResult<AvailabilityLoadResult>,
): AvailabilityItem {
  if (settled.status === 'fulfilled') {
    return {
      key: spec.key,
      label: spec.label,
      status: 'ok',
      count: settled.value.count,
      sampled: settled.value.sampled,
      detail: settled.value.detail,
    };
  }
  return {
    key: spec.key,
    label: spec.label,
    status: 'error',
    error: formatErrorMessage(settled.reason),
  };
}

function buildLoadingMap(selectedWorldId: number | null): Record<RemoteAvailabilityKey, AvailabilityItem> {
  const map = {} as Record<RemoteAvailabilityKey, AvailabilityItem>;
  for (const key of REMOTE_ORDER) {
    if (selectedWorldId == null && (key === 'world_behavior' || key === 'world_scheduler')) {
      map[key] = noWorldEntry(key);
      continue;
    }
    map[key] = loadingEntry(key);
  }
  return map;
}

export function useProjectAvailability(selectedWorldId: number | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState<number | null>(null);
  const [remoteByKey, setRemoteByKey] = useState<Record<RemoteAvailabilityKey, AvailabilityItem>>(
    () => buildLoadingMap(selectedWorldId),
  );
  const requestSequence = useRef(0);
  const sceneArtifactCount = useSceneArtifactStore((state) => Object.keys(state.artifacts).length);

  const refresh = useCallback(async () => {
    const seq = requestSequence.current + 1;
    requestSequence.current = seq;

    setIsLoading(true);
    setRemoteByKey(buildLoadingMap(selectedWorldId));

    const specs = buildTaskSpecs(selectedWorldId);
    const settled = await Promise.allSettled(specs.map((spec) => spec.load()));
    if (seq !== requestSequence.current) return;

    const next = buildLoadingMap(selectedWorldId);
    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const result = settled[index];
      if (!result) continue;
      next[spec.key] = toEntryFromResult(spec, result);
    }

    if (selectedWorldId == null) {
      next.world_behavior = noWorldEntry('world_behavior');
      next.world_scheduler = noWorldEntry('world_scheduler');
    }

    setRemoteByKey(next);
    setLastRefreshedAtMs(Date.now());
    setIsLoading(false);
  }, [selectedWorldId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo<AvailabilityItem[]>(() => {
    const rows = REMOTE_ORDER.map((key) => remoteByKey[key] ?? loadingEntry(key));
    rows.push({
      key: 'scene_artifacts',
      label: 'Scene Artifacts (local)',
      status: 'ok',
      count: sceneArtifactCount,
    });
    return rows;
  }, [remoteByKey, sceneArtifactCount]);

  return {
    items,
    isLoading,
    lastRefreshedAtMs,
    refresh,
  };
}
