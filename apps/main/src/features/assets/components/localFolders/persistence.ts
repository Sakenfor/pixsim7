import type { ClientFilterState } from '@features/gallery/lib/useClientFilters';

import {
  CONTENT_SCROLL_BY_SCOPE_KEY,
  FILTER_STATE_KEY,
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

export function readStoredFilterState(): ClientFilterState {
  try {
    const raw = localStorage.getItem(FILTER_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Only keep string, string[], and boolean values
    const result: ClientFilterState = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'boolean') {
        result[key] = value;
      } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        result[key] = value as string[];
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeStoredFilterState(value: ClientFilterState): void {
  try {
    // Strip undefined values before serializing
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) clean[k] = v;
    }
    localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(clean));
  } catch {
    // Best effort persistence only
  }
}
