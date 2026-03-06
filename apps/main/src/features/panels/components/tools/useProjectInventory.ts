import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getSavedGameProject } from '@lib/api';
import { exportWorldProjectWithExtensions } from '@lib/game';

import {
  buildProjectInventory,
  selectProjectInventorySource,
  type ProjectInventorySource,
  type ProjectInventorySummary,
} from './projectInventory';

type InventoryStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface ProjectInventorySourceDescriptor extends ProjectInventorySource {
  label: string;
}

interface UseProjectInventoryInput {
  worldId: number | null;
  currentProjectId: number | null;
  selectedProjectId: number | null;
  selectedProjectName: string | null;
}

function formatErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const trimmed = raw.trim();
  if (trimmed.length <= 120) return trimmed || 'Unknown error';
  return `${trimmed.slice(0, 117)}...`;
}

function toSourceDescriptor(
  source: ProjectInventorySource,
  selectedProjectName: string | null,
): ProjectInventorySourceDescriptor {
  if (source.kind === 'active_world') {
    return {
      ...source,
      label: `Active world #${source.worldId}`,
    };
  }
  if (source.kind === 'saved_project') {
    const projectLabel = selectedProjectName?.trim()
      ? `#${source.projectId} ${selectedProjectName.trim()}`
      : `#${source.projectId}`;
    return {
      ...source,
      label: `Saved project snapshot ${projectLabel}`,
    };
  }
  return {
    kind: 'none',
    label: 'No active world or saved project selected',
  };
}

export function useProjectInventory(input: UseProjectInventoryInput) {
  const [status, setStatus] = useState<InventoryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState<number | null>(null);
  const [summary, setSummary] = useState<ProjectInventorySummary | null>(null);
  const requestSequence = useRef(0);

  const source = useMemo(
    () =>
      toSourceDescriptor(
        selectProjectInventorySource({
          worldId: input.worldId,
          currentProjectId: input.currentProjectId,
          selectedProjectId: input.selectedProjectId,
        }),
        input.selectedProjectName,
      ),
    [input.currentProjectId, input.selectedProjectId, input.selectedProjectName, input.worldId],
  );

  const refresh = useCallback(async () => {
    const seq = requestSequence.current + 1;
    requestSequence.current = seq;

    if (source.kind === 'none') {
      setSummary(null);
      setError(null);
      setStatus('ok');
      setLastRefreshedAtMs(Date.now());
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const bundle =
        source.kind === 'saved_project'
          ? (await getSavedGameProject(source.projectId)).bundle
          : (await exportWorldProjectWithExtensions(source.worldId)).bundle;
      if (seq !== requestSequence.current) return;

      setSummary(buildProjectInventory(bundle));
      setStatus('ok');
      setLastRefreshedAtMs(Date.now());
    } catch (loadError) {
      if (seq !== requestSequence.current) return;
      setSummary(null);
      setStatus('error');
      setError(formatErrorMessage(loadError));
    }
  }, [source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    source,
    summary,
    status,
    error,
    isLoading: status === 'loading',
    lastRefreshedAtMs,
    refresh,
  };
}
