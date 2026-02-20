import {
  CONTENT_SCROLL_BY_SCOPE_KEY,
  GROUP_MODE_KEY,
  type ContentScrollByScope,
  type LocalGroupMode,
} from './constants';

export function readStoredGroupMode(): LocalGroupMode {
  try {
    const raw = localStorage.getItem(GROUP_MODE_KEY);
    if (raw === 'folder' || raw === 'subfolder') return raw;
    return 'none';
  } catch {
    return 'none';
  }
}

export function writeStoredGroupMode(value: LocalGroupMode): void {
  try {
    localStorage.setItem(GROUP_MODE_KEY, value);
  } catch {
    // Best effort persistence only
  }
}

export function readStoredScrollTop(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeStoredScrollTop(key: string, scrollTop: number): void {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.round(scrollTop))));
  } catch {
    // Best effort persistence only
  }
}

export function readStoredContentScrollByScope(): ContentScrollByScope {
  try {
    const raw = localStorage.getItem(CONTENT_SCROLL_BY_SCOPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized: ContentScrollByScope = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        normalized[scope] = value;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

export function writeStoredContentScrollByScope(value: ContentScrollByScope): void {
  try {
    localStorage.setItem(CONTENT_SCROLL_BY_SCOPE_KEY, JSON.stringify(value));
  } catch {
    // Best effort persistence only
  }
}

export function readStoredBoolean(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Best effort persistence only
  }
}
