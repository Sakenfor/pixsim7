import type { ResolverWorkbenchSnapshot } from './types';

const LS_KEY = 'resolver_workbench_saved_snapshots_v1';

export interface WorkbenchSavedSnapshot {
  id: string;
  name: string;
  savedAt: string;
  snapshot: ResolverWorkbenchSnapshot;
}

export function loadSavedSnapshots(): WorkbenchSavedSnapshot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkbenchSavedSnapshot[];
  } catch {
    return [];
  }
}

function writeSavedSnapshots(snapshots: WorkbenchSavedSnapshot[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshots));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

export function saveNamedSnapshot(
  name: string,
  snapshot: ResolverWorkbenchSnapshot,
): WorkbenchSavedSnapshot {
  const entry: WorkbenchSavedSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Snapshot',
    savedAt: new Date().toISOString(),
    snapshot,
  };
  const existing = loadSavedSnapshots();
  writeSavedSnapshots([entry, ...existing]);
  return entry;
}

export function deleteSavedSnapshot(id: string): void {
  writeSavedSnapshots(loadSavedSnapshots().filter((s) => s.id !== id));
}
