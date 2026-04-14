import { create } from 'zustand';

type AssetIdKey = string;
type AssetId = string | number;

/** Sentinel for `selected[id]` meaning "extract last frame via last_frame=true,
 *  not a raw timestamp". Used to route around ffmpeg fast-seek failures at
 *  end-of-video. */
export const SELECT_LAST_FRAME = -1;

export interface SeekOptions {
  holdUntilCursorNear?: boolean;
}
export type SeekFn = (time: number, opts?: SeekOptions) => void;
export type ExtractFrameFn = (timestamp: number) => void | Promise<void>;
export type ExtractLastFrameFn = () => void | Promise<void>;

interface VideoMarksState {
  byAsset: Record<AssetIdKey, number[]>;
  /** Per-asset "selected frame" — set on explicit seek (mark click, arrow jump,
   *  lock). Read by Upload button to route frame-extract instead of whole-video. */
  selected: Record<AssetIdKey, number>;
  /** Asset whose scrub widget currently has hover focus. Exactly one or none. */
  activeAssetId: AssetIdKey | null;
  /** Live scrub time per asset (updated during hover scrubbing). */
  currentTime: Record<AssetIdKey, number>;
  /** Video duration per asset (set when metadata loads). */
  duration: Record<AssetIdKey, number>;
  /** Seek callback registered by the widget on mount. */
  seekFn: Record<AssetIdKey, SeekFn>;
  /** Extract+upload frame callback registered by MediaCard. */
  extractFrameFn: Record<AssetIdKey, ExtractFrameFn>;
  /** Extract+upload last-frame callback registered by MediaCard. */
  extractLastFrameFn: Record<AssetIdKey, ExtractLastFrameFn>;

  addMark: (assetId: AssetId, time: number) => void;
  removeMark: (assetId: AssetId, time: number) => void;
  clearMarks: (assetId: AssetId) => void;
  setSelected: (assetId: AssetId, time: number | null) => void;
  setActive: (assetId: AssetId | null) => void;
  setCurrentTime: (assetId: AssetId, time: number) => void;
  setDuration: (assetId: AssetId, duration: number) => void;
  setSeekFn: (assetId: AssetId, fn: SeekFn | null) => void;
  setExtractFrameFn: (assetId: AssetId, fn: ExtractFrameFn | null) => void;
  setExtractLastFrameFn: (assetId: AssetId, fn: ExtractLastFrameFn | null) => void;
}

const toKey = (id: AssetId): AssetIdKey => String(id);
const EMPTY: number[] = [];

function setOrDelete<V>(
  map: Record<AssetIdKey, V>,
  key: AssetIdKey,
  value: V | null,
): Record<AssetIdKey, V> {
  if (value === null) {
    if (!(key in map)) return map;
    const next = { ...map };
    delete next[key];
    return next;
  }
  return { ...map, [key]: value };
}

export const useVideoMarksStore = create<VideoMarksState>((set) => ({
  byAsset: {},
  selected: {},
  activeAssetId: null,
  currentTime: {},
  duration: {},
  seekFn: {},
  extractFrameFn: {},
  extractLastFrameFn: {},
  addMark: (assetId, time) =>
    set((state) => {
      const key = toKey(assetId);
      const prev = state.byAsset[key] ?? EMPTY;
      if (prev.some((m) => Math.abs(m - time) < 0.1)) return state;
      return {
        byAsset: { ...state.byAsset, [key]: [...prev, time].sort((a, b) => a - b) },
      };
    }),
  removeMark: (assetId, time) =>
    set((state) => {
      const key = toKey(assetId);
      const prev = state.byAsset[key];
      if (!prev) return state;
      return {
        byAsset: { ...state.byAsset, [key]: prev.filter((m) => m !== time) },
      };
    }),
  clearMarks: (assetId) =>
    set((state) => {
      const key = toKey(assetId);
      if (!(key in state.byAsset)) return state;
      const next = { ...state.byAsset };
      delete next[key];
      return { byAsset: next };
    }),
  setSelected: (assetId, time) =>
    set((state) => {
      const key = toKey(assetId);
      if (time === null) {
        if (!(key in state.selected)) return state;
        const next = { ...state.selected };
        delete next[key];
        return { selected: next };
      }
      return { selected: { ...state.selected, [key]: time } };
    }),
  setActive: (assetId) => set({ activeAssetId: assetId === null ? null : toKey(assetId) }),
  setCurrentTime: (assetId, time) =>
    set((state) => ({ currentTime: { ...state.currentTime, [toKey(assetId)]: time } })),
  setDuration: (assetId, duration) =>
    set((state) => ({ duration: { ...state.duration, [toKey(assetId)]: duration } })),
  setSeekFn: (assetId, fn) =>
    set((state) => ({ seekFn: setOrDelete(state.seekFn, toKey(assetId), fn) })),
  setExtractFrameFn: (assetId, fn) =>
    set((state) => ({ extractFrameFn: setOrDelete(state.extractFrameFn, toKey(assetId), fn) })),
  setExtractLastFrameFn: (assetId, fn) =>
    set((state) => ({ extractLastFrameFn: setOrDelete(state.extractLastFrameFn, toKey(assetId), fn) })),
}));

export function useVideoMarks(assetId: AssetId | null | undefined): number[] {
  return useVideoMarksStore((s) =>
    assetId == null ? EMPTY : s.byAsset[toKey(assetId)] ?? EMPTY,
  );
}

export function getVideoMarks(assetId: AssetId | null | undefined): number[] {
  if (assetId == null) return EMPTY;
  return useVideoMarksStore.getState().byAsset[toKey(assetId)] ?? EMPTY;
}

export function useSelectedVideoTimestamp(assetId: AssetId | null | undefined): number | null {
  return useVideoMarksStore((s) =>
    assetId == null ? null : s.selected[toKey(assetId)] ?? null,
  );
}

export function getSelectedVideoTimestamp(assetId: AssetId | null | undefined): number | null {
  if (assetId == null) return null;
  return useVideoMarksStore.getState().selected[toKey(assetId)] ?? null;
}
