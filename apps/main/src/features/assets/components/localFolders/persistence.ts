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

