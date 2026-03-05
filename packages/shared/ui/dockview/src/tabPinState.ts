const STORAGE_KEY = "dockview:pinned-tabs:v1";

const listeners = new Set<() => void>();
const pinnedTabIds = new Set<string>();
let loaded = false;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (!canUseStorage()) return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === "string" && id.length > 0) {
        pinnedTabIds.add(id);
      }
    }
  } catch {
    // best effort
  }
}

function persist(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(pinnedTabIds)));
  } catch {
    // best effort
  }
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // best effort
    }
  }
}

export function isTabPinned(panelId: string): boolean {
  ensureLoaded();
  return pinnedTabIds.has(panelId);
}

export function setTabPinned(panelId: string, pinned: boolean): void {
  if (!panelId) return;
  ensureLoaded();

  const had = pinnedTabIds.has(panelId);
  if (pinned && !had) {
    pinnedTabIds.add(panelId);
    persist();
    notify();
    return;
  }
  if (!pinned && had) {
    pinnedTabIds.delete(panelId);
    persist();
    notify();
  }
}

export function toggleTabPinned(panelId: string): boolean {
  if (!panelId) return false;
  const next = !isTabPinned(panelId);
  setTabPinned(panelId, next);
  return next;
}

export function subscribeTabPins(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPinnedTabIds(): string[] {
  ensureLoaded();
  return Array.from(pinnedTabIds);
}
