import { upsertProjectDraft, deleteProjectDraft } from '@lib/api';

import { exportWorldProjectWithExtensions } from './service';

export const AUTOSAVE_INTERVAL_MS = 30_000;

let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let autosaveInProgress = false;

export async function performAutosave(worldId: number): Promise<boolean> {
  if (autosaveInProgress) {
    return false;
  }

  // Lazy import to avoid circular dependencies
  const { useProjectSessionStore } = await import('@features/scene/stores/projectSessionStore');
  const state = useProjectSessionStore.getState();

  if (!state.dirty) {
    return false;
  }

  autosaveInProgress = true;
  try {
    const { bundle } = await exportWorldProjectWithExtensions(worldId);
    await upsertProjectDraft({
      bundle,
      source_world_id: worldId,
      draft_source_project_id: state.currentProjectId ?? undefined,
    });

    const now = Date.now();
    useProjectSessionStore.getState().setLastAutosavedAt(now);
    return true;
  } catch (error) {
    console.warn(
      '[Autosave] failed:',
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    autosaveInProgress = false;
  }
}

export function startAutosave(getWorldId: () => number | null): () => void {
  stopAutosave();

  autosaveTimer = setInterval(() => {
    const worldId = getWorldId();
    if (worldId != null) {
      void performAutosave(worldId);
    }
  }, AUTOSAVE_INTERVAL_MS);

  return stopAutosave;
}

export function stopAutosave(): void {
  if (autosaveTimer != null) {
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }
}

export async function clearDraftAfterSave(
  currentProjectId: number | null,
): Promise<void> {
  try {
    await deleteProjectDraft(currentProjectId);
  } catch {
    // Draft may not exist — silently ignore
  }
}
