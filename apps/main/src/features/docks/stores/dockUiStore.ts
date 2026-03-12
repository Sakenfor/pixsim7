import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { debugFlags } from '@lib/utils/debugFlags';
import { createBackendStorage } from '@lib/utils/storage';
import { exposeStoreForDebugging, manuallyRehydrateStore } from '@lib/utils/zustandPersist';

export type DockPosition = 'bottom' | 'left' | 'right' | 'top' | 'floating';
export type LayoutBehavior = 'overlay' | 'push';
export type RetractedMode = 'hidden' | 'peek';

export interface DockUiState {
  dockPosition: DockPosition;
  layoutBehavior: LayoutBehavior;
  retractedMode: RetractedMode;
  open: boolean;
  pinned: boolean;
  size: number;
  floatingPosition: { x: number; y: number };
  floatingSize: { width: number; height: number };
  panelLayoutResetTrigger: number;
}

interface DockSizeRange {
  min: number;
  max: number;
  defaultSize: number;
}

interface FloatingSizeConfig {
  minWidth: number;
  minHeight: number;
  defaultWidth: number;
  defaultHeight: number;
}

interface DockProfile {
  horizontal: DockSizeRange;
  vertical: DockSizeRange;
  floating: FloatingSizeConfig;
}

const DEFAULT_PROFILE: DockProfile = {
  horizontal: { min: 200, max: 500, defaultSize: 300 },
  vertical: { min: 300, max: 700, defaultSize: 450 },
  floating: {
    minWidth: 480,
    minHeight: 320,
    defaultWidth: 700,
    defaultHeight: 600,
  },
};

const PROFILE_BY_DOCK_ID: Record<string, DockProfile> = {
  'control-center': DEFAULT_PROFILE,
};

const STORAGE_KEY = 'dock_ui_v1';

function getProfile(dockId: string): DockProfile {
  return PROFILE_BY_DOCK_ID[dockId] ?? DEFAULT_PROFILE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultFloatingPosition(width: number, height: number): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 120, y: 120 };
  }

  return {
    x: Math.round(window.innerWidth / 2 - width / 2),
    y: Math.round(window.innerHeight / 2 - height / 2),
  };
}

export function createDefaultDockUiState(dockId: string): DockUiState {
  const profile = getProfile(dockId);
  const floatingPosition = getDefaultFloatingPosition(
    profile.floating.defaultWidth,
    profile.floating.defaultHeight,
  );

  return {
    dockPosition: 'bottom',
    layoutBehavior: 'overlay',
    retractedMode: 'hidden',
    open: false,
    pinned: false,
    size: profile.horizontal.defaultSize,
    floatingPosition,
    floatingSize: {
      width: profile.floating.defaultWidth,
      height: profile.floating.defaultHeight,
    },
    panelLayoutResetTrigger: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readLegacyControlCenterState(): Record<string, unknown> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem('controlCenter_local');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const state = parsed.state;
    return isRecord(state) ? state : null;
  } catch (error) {
    debugFlags.warn('rehydration', '[DockUiStore] Failed to read legacy Control Center state:', error);
    return null;
  }
}

function hydrateFromLegacyControlCenter(
  dockId: string,
  legacyState: Record<string, unknown> | null,
): DockUiState | null {
  if (!legacyState) return null;

  const defaults = createDefaultDockUiState(dockId);
  const profile = getProfile(dockId);
  const isVertical =
    legacyState.dockPosition === 'left' || legacyState.dockPosition === 'right';
  const sizeRange = isVertical ? profile.vertical : profile.horizontal;

  const floatingSize = legacyState.floatingSize;
  const floatingPosition = legacyState.floatingPosition;

  return {
    dockPosition:
      legacyState.dockPosition === 'bottom' ||
      legacyState.dockPosition === 'left' ||
      legacyState.dockPosition === 'right' ||
      legacyState.dockPosition === 'top' ||
      legacyState.dockPosition === 'floating'
        ? legacyState.dockPosition
        : defaults.dockPosition,
    layoutBehavior:
      legacyState.layoutBehavior === 'overlay' || legacyState.layoutBehavior === 'push'
        ? legacyState.layoutBehavior
        : defaults.layoutBehavior,
    retractedMode:
      legacyState.retractedMode === 'hidden' || legacyState.retractedMode === 'peek'
        ? legacyState.retractedMode
        : defaults.retractedMode,
    open: typeof legacyState.open === 'boolean' ? legacyState.open : defaults.open,
    pinned: typeof legacyState.pinned === 'boolean' ? legacyState.pinned : defaults.pinned,
    size:
      typeof legacyState.height === 'number'
        ? clamp(legacyState.height, sizeRange.min, sizeRange.max)
        : defaults.size,
    floatingPosition:
      isRecord(floatingPosition) &&
      typeof floatingPosition.x === 'number' &&
      typeof floatingPosition.y === 'number'
        ? { x: floatingPosition.x, y: floatingPosition.y }
        : defaults.floatingPosition,
    floatingSize:
      isRecord(floatingSize) &&
      typeof floatingSize.width === 'number' &&
      typeof floatingSize.height === 'number'
        ? {
            width: Math.max(profile.floating.minWidth, floatingSize.width),
            height: Math.max(profile.floating.minHeight, floatingSize.height),
          }
        : defaults.floatingSize,
    panelLayoutResetTrigger: 0,
  };
}

function getInitialDockState(): Record<string, DockUiState> {
  const legacyControlCenter = hydrateFromLegacyControlCenter(
    'control-center',
    readLegacyControlCenterState(),
  );

  if (!legacyControlCenter) {
    return {};
  }

  return {
    'control-center': legacyControlCenter,
  };
}

function resolveDock(state: Record<string, DockUiState>, dockId: string): DockUiState {
  return state[dockId] ?? createDefaultDockUiState(dockId);
}

export interface DockUiStoreState {
  docks: Record<string, DockUiState>;
  setDockOpen: (dockId: string, open: boolean) => void;
  toggleDockOpen: (dockId: string) => void;
  setDockPinned: (dockId: string, pinned: boolean) => void;
  setDockPosition: (dockId: string, position: DockPosition) => void;
  setDockLayoutBehavior: (dockId: string, behavior: LayoutBehavior) => void;
  setDockRetractedMode: (dockId: string, mode: RetractedMode) => void;
  setDockSize: (dockId: string, size: number) => void;
  setDockFloatingPosition: (dockId: string, x: number, y: number) => void;
  setDockFloatingSize: (dockId: string, width: number, height: number) => void;
  triggerDockLayoutReset: (dockId: string) => void;
  resetDockState: (dockId: string) => void;
}

export function getDockStateSnapshot(
  state: Pick<DockUiStoreState, 'docks'>,
  dockId: string,
): DockUiState {
  return resolveDock(state.docks, dockId);
}

export function useDockState<T>(
  dockId: string,
  selector: (dock: DockUiState) => T,
): T {
  return useDockUiStore((state) => selector(getDockStateSnapshot(state, dockId)));
}

export const useDockUiStore = create<DockUiStoreState>()(
  persist(
    (set) => ({
      docks: getInitialDockState(),

      setDockOpen: (dockId, open) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.open === open) return state;
          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, open },
            },
          };
        }),

      toggleDockOpen: (dockId) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, open: !current.open },
            },
          };
        }),

      setDockPinned: (dockId, pinned) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.pinned === pinned) return state;
          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, pinned },
            },
          };
        }),

      setDockPosition: (dockId, position) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.dockPosition === position) return state;

          const profile = getProfile(dockId);
          const isVertical = position === 'left' || position === 'right';
          const wasFloating = current.dockPosition === 'floating';
          const nextSize =
            position === 'floating'
              ? current.size
              : isVertical
                ? profile.vertical.defaultSize
                : profile.horizontal.defaultSize;

          const next: DockUiState = {
            ...current,
            dockPosition: position,
            size: nextSize,
          };

          if (position === 'floating' || wasFloating) {
            next.open = true;
            if (wasFloating && position !== 'floating') {
              next.pinned = true;
            }
          }

          return {
            docks: {
              ...state.docks,
              [dockId]: next,
            },
          };
        }),

      setDockLayoutBehavior: (dockId, behavior) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.layoutBehavior === behavior) return state;
          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, layoutBehavior: behavior },
            },
          };
        }),

      setDockRetractedMode: (dockId, mode) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.retractedMode === mode) return state;
          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, retractedMode: mode },
            },
          };
        }),

      setDockSize: (dockId, size) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (current.dockPosition === 'floating') return state;

          const profile = getProfile(dockId);
          const isVertical =
            current.dockPosition === 'left' || current.dockPosition === 'right';
          const range = isVertical ? profile.vertical : profile.horizontal;
          const nextSize = clamp(size, range.min, range.max);
          if (current.size === nextSize) return state;

          return {
            docks: {
              ...state.docks,
              [dockId]: { ...current, size: nextSize },
            },
          };
        }),

      setDockFloatingPosition: (dockId, x, y) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          if (
            current.floatingPosition.x === x &&
            current.floatingPosition.y === y
          ) {
            return state;
          }
          return {
            docks: {
              ...state.docks,
              [dockId]: {
                ...current,
                floatingPosition: { x, y },
              },
            },
          };
        }),

      setDockFloatingSize: (dockId, width, height) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          const profile = getProfile(dockId);
          const nextWidth = Math.max(profile.floating.minWidth, width);
          const nextHeight = Math.max(profile.floating.minHeight, height);
          if (
            current.floatingSize.width === nextWidth &&
            current.floatingSize.height === nextHeight
          ) {
            return state;
          }

          return {
            docks: {
              ...state.docks,
              [dockId]: {
                ...current,
                floatingSize: {
                  width: nextWidth,
                  height: nextHeight,
                },
              },
            },
          };
        }),

      triggerDockLayoutReset: (dockId) =>
        set((state) => {
          const current = resolveDock(state.docks, dockId);
          return {
            docks: {
              ...state.docks,
              [dockId]: {
                ...current,
                panelLayoutResetTrigger: Date.now(),
              },
            },
          };
        }),

      resetDockState: (dockId) =>
        set((state) => ({
          docks: {
            ...state.docks,
            [dockId]: createDefaultDockUiState(dockId),
          },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('dockUi')),
      skipHydration: false,
      partialize: (state) => ({
        docks: state.docks,
      }),
      version: 1,
      migrate: (persistedState) => {
        if (
          persistedState &&
          typeof persistedState === 'object' &&
          'docks' in persistedState &&
          persistedState.docks &&
          typeof persistedState.docks === 'object'
        ) {
          return persistedState as any;
        }

        return {
          docks: getInitialDockState(),
        };
      },
    },
  ),
);

if (typeof window !== 'undefined') {
  exposeStoreForDebugging(useDockUiStore, 'dockUi');

  setTimeout(() => {
    manuallyRehydrateStore(useDockUiStore, 'dockUi_local', 'DockUi');
  }, 50);
}

export const dockUiSelectors = {
  byDock: (dockId: string) => (state: DockUiStoreState) =>
    getDockStateSnapshot(state, dockId),
};
