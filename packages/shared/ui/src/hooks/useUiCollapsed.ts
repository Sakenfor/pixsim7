/**
 * useUiCollapsed — generic per-key persistence for collapse / expand UI state.
 *
 * One Zustand-persisted bag of `Record<string, boolean>` keyed by stable
 * caller-provided ids. Drop-in replacement for `useState(false)` whenever a
 * UI element should remember whether it's collapsed across reloads, dock
 * moves, or component re-mounts.
 *
 * Use anywhere you'd otherwise reach for ad-hoc localStorage or a
 * feature-specific Zustand field. Examples of good keys:
 *
 *   useUiCollapsed('shadow:promptBox')
 *   useUiCollapsed('shadow:composer:roles:subject')
 *   useUiCollapsed('characters:detail:meta')
 *
 * Conventions:
 *  - Keys are colon-separated `<domain>:<surface>:<element>` strings. Stable
 *    keys persist across renames; treat them like a tiny schema.
 *  - Pass `persistKey` undefined to opt out of persistence (falls back to
 *    local component state). Useful for ad-hoc instances that shouldn't
 *    pollute the shared bag.
 *  - The default (`defaultCollapsed`) is what's returned for keys that have
 *    never been written. Changing the default does *not* retroactively
 *    rewrite previously-stored values.
 *
 * Storage: localStorage only (key `pixsim7:uiCollapsed-v1`). Cross-device
 * sync would require swapping to `createBackendStorage`; UI collapse state
 * is borderline cosmetic so we haven't paid that cost yet.
 */
import { useState, useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiCollapsedState {
  collapsed: Record<string, boolean>;
  setCollapsed: (key: string, value: boolean) => void;
  toggle: (key: string) => void;
}

const useUiCollapsedStore = create<UiCollapsedState>()(
  persist(
    (set) => ({
      collapsed: {},
      setCollapsed: (key, value) =>
        set((state) => ({ collapsed: { ...state.collapsed, [key]: value } })),
      toggle: (key) =>
        set((state) => ({
          collapsed: { ...state.collapsed, [key]: !state.collapsed[key] },
        })),
    }),
    { name: 'pixsim7:uiCollapsed-v1' },
  ),
);

export interface UiCollapsedResult {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

export function useUiCollapsed(
  persistKey?: string,
  defaultCollapsed = false,
): UiCollapsedResult {
  const store = useUiCollapsedStore();
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);

  const persisted = persistKey != null;

  const collapsed = persisted
    ? (store.collapsed[persistKey] ?? defaultCollapsed)
    : localCollapsed;

  const setCollapsed = useCallback(
    (v: boolean) => {
      if (persisted) {
        store.setCollapsed(persistKey, v);
      } else {
        setLocalCollapsed(v);
      }
    },
    [persisted, persistKey, store],
  );

  const toggle = useCallback(() => {
    if (persisted) {
      store.toggle(persistKey);
    } else {
      setLocalCollapsed((prev) => !prev);
    }
  }, [persisted, persistKey, store]);

  return { collapsed, setCollapsed, toggle };
}
