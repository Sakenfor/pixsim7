import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isVideoPlayingAsset: vi.fn<(assetId: string | number) => boolean>(),
  viewerOpenEmit: vi.fn<(asset: unknown) => void>(),
  subscribeToUpdates: vi.fn<(callback: (asset: unknown) => void) => () => void>(),
  emitAssetViewed: vi.fn<(assetId: string | number) => void>(),
}));

vi.mock('@lib/utils', () => ({
  hmrSingleton: (_key: string, factory: () => unknown) => factory(),
}));

vi.mock('@features/mediaViewer', () => ({
  useAssetRegionStore: { getState: () => ({ drawingMode: 'select' }) },
  useAssetViewerOverlayStore: { getState: () => ({ overlayMode: 'none' }) },
  useCaptureRegionStore: { getState: () => ({ drawingMode: 'select' }) },
}));

vi.mock('@/components/media/viewer/overlays/builtins/maskOverlayStore', () => ({
  useMaskOverlayStore: { getState: () => ({ mode: 'view', isSaving: false }) },
}));

vi.mock('@/components/media/viewer/panels/viewerViewportStore', () => ({
  isViewerZoomedIn: () => false,
}));

vi.mock('../../lib/activeVideoRegistry', () => ({
  isAnyVideoPlaying: () => false,
  isVideoPlayingAsset: (assetId: string | number) => mocks.isVideoPlayingAsset(assetId),
}));

vi.mock('../../lib/assetEvents', () => ({
  assetEvents: {
    subscribeToUpdates: (callback: (asset: unknown) => void) => mocks.subscribeToUpdates(callback),
    emitAssetViewed: (assetId: string | number) => mocks.emitAssetViewed(assetId),
  },
}));

vi.mock('../../lib/viewerOpenEvents', () => ({
  viewerOpenEvents: {
    emit: (asset: unknown) => mocks.viewerOpenEmit(asset),
  },
}));

vi.mock('../../models/asset', () => ({
  fromAssetResponse: (asset: unknown) => asset,
}));

import { useAssetViewerStore, type ViewerAsset } from '../assetViewerStore';

// Auto-follow swaps are debounced (decoder-churn coalescing), so the store now
// schedules timers. Fake them file-wide so deferred swaps are deterministic and
// no in-flight settle timer leaks into a later test.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function makeViewerVideo(
  overrides: Partial<ViewerAsset> = {},
): ViewerAsset {
  const id = overrides.id ?? 101;
  return {
    id,
    name: `Asset ${id}`,
    type: 'video',
    url: `https://cdn.example.com/${id}.mp4`,
    fullUrl: `https://cdn.example.com/${id}.mp4`,
    source: 'gallery',
    _assetModel: { id: `model-${id}-v1` } as ViewerAsset['_assetModel'],
    ...overrides,
  };
}

describe('assetViewerStore video source stability', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // no-op
    }
    mocks.isVideoPlayingAsset.mockReset();
    mocks.isVideoPlayingAsset.mockReturnValue(false);
    mocks.viewerOpenEmit.mockClear();
    mocks.subscribeToUpdates.mockReset();
    mocks.subscribeToUpdates.mockReturnValue(() => {});
    mocks.emitAssetViewed.mockReset();
    useAssetViewerStore.setState(useAssetViewerStore.getInitialState(), true);
  });

  it('preserves current video url/fullUrl while that same asset is actively playing', () => {
    const initial = makeViewerVideo({
      _assetModel: { id: 'model-101-v1' } as ViewerAsset['_assetModel'],
    });
    useAssetViewerStore.getState().openViewer(initial, [initial], 'recent');

    mocks.isVideoPlayingAsset.mockReturnValue(true);
    const refreshed = makeViewerVideo({
      url: '/api/v1/media/stored-101',
      fullUrl: '/api/v1/media/stored-101',
      _assetModel: { id: 'model-101-v2' } as ViewerAsset['_assetModel'],
    });

    useAssetViewerStore.getState().registerScope('recent', 'recent', [refreshed]);

    const current = useAssetViewerStore.getState().currentAsset;
    expect(current).toBeTruthy();
    expect(current?.url).toBe(initial.url);
    expect(current?.fullUrl).toBe(initial.fullUrl);
    expect(current?._assetModel).toBe(refreshed._assetModel);
    expect(mocks.isVideoPlayingAsset).toHaveBeenCalledWith(initial.id);
  });

  it('applies refreshed video url/fullUrl when the asset is not actively playing', () => {
    const initial = makeViewerVideo({
      _assetModel: { id: 'model-101-v1' } as ViewerAsset['_assetModel'],
    });
    useAssetViewerStore.getState().openViewer(initial, [initial], 'recent');

    mocks.isVideoPlayingAsset.mockReturnValue(false);
    const refreshed = makeViewerVideo({
      url: '/api/v1/media/stored-101',
      fullUrl: '/api/v1/media/stored-101',
      _assetModel: { id: 'model-101-v2' } as ViewerAsset['_assetModel'],
    });

    useAssetViewerStore.getState().registerScope('recent', 'recent', [refreshed]);

    const current = useAssetViewerStore.getState().currentAsset;
    expect(current).toBeTruthy();
    expect(current?.url).toBe(refreshed.url);
    expect(current?.fullUrl).toBe(refreshed.fullUrl);
    expect(current?._assetModel).toBe(refreshed._assetModel);
  });
});

describe('assetViewerStore navigateToAssetId', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // no-op
    }
    mocks.isVideoPlayingAsset.mockReset();
    mocks.isVideoPlayingAsset.mockReturnValue(false);
    mocks.emitAssetViewed.mockReset();
    useAssetViewerStore.setState(useAssetViewerStore.getInitialState(), true);
  });

  it('navigates by id using the latest active scope ordering', () => {
    const a = makeViewerVideo({ id: 201 });
    const b = makeViewerVideo({ id: 202 });
    useAssetViewerStore.getState().openViewer(a, [a, b], 'recent');

    const newlyLanded = makeViewerVideo({ id: 203 });
    useAssetViewerStore.getState().registerScope('recent', 'recent', [newlyLanded, a, b]);

    useAssetViewerStore.getState().navigateToAssetId(a.id);
    let state = useAssetViewerStore.getState();
    expect(state.currentAsset?.id).toBe(a.id);
    expect(state.currentIndex).toBe(1);

    useAssetViewerStore.getState().navigateToAssetId(newlyLanded.id);
    state = useAssetViewerStore.getState();
    expect(state.currentAsset?.id).toBe(newlyLanded.id);
    expect(state.currentIndex).toBe(0);
  });

  it('is a no-op when the target id is absent from the active list', () => {
    const a = makeViewerVideo({ id: 301 });
    const b = makeViewerVideo({ id: 302 });
    useAssetViewerStore.getState().openViewer(a, [a, b], 'recent');

    useAssetViewerStore.getState().navigateToAssetId(999999);
    const state = useAssetViewerStore.getState();
    expect(state.currentAsset?.id).toBe(a.id);
    expect(state.currentIndex).toBe(0);
  });
});

describe('assetViewerStore scope re-registration stability', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // no-op
    }
    mocks.isVideoPlayingAsset.mockReset();
    mocks.isVideoPlayingAsset.mockReturnValue(false);
    mocks.emitAssetViewed.mockReset();
    useAssetViewerStore.setState(useAssetViewerStore.getInitialState(), true);
  });

  it('keeps the selected active scope when other scopes register first', () => {
    const current = makeViewerVideo({ id: 401 });
    useAssetViewerStore.setState({
      currentAsset: current,
      mode: 'side',
      activeScopeId: 'recent',
      scopes: {},
      assetList: [],
      currentIndex: -1,
    });

    const probesAssets = [
      makeViewerVideo({ id: 402 }),
      makeViewerVideo({ id: 401 }),
    ];
    useAssetViewerStore.getState().registerScope('probes', 'Probes (2)', probesAssets);

    let state = useAssetViewerStore.getState();
    expect(state.activeScopeId).toBe('recent');
    expect(state.assetList).toEqual([]);

    const recentAssets = [
      makeViewerVideo({ id: 403 }),
      makeViewerVideo({ id: 401 }),
    ];
    useAssetViewerStore.getState().registerScope('recent', 'Recent (2)', recentAssets);

    state = useAssetViewerStore.getState();
    expect(state.activeScopeId).toBe('recent');
    // First-time hydration of the active scope must not steal the viewer off
    // the asset already on screen, nor spuriously flag a pending head — it just
    // registers the scope contents. (assetList stays lazily synced via nav.)
    expect(state.scopes.recent?.assets.map((a) => a.id)).toEqual([403, 401]);
    expect(state.currentAsset?.id).toBe(401);
    expect(state.pendingHeadId).toBeNull();
  });

  it('reclaims the preferred scope after a fallback stole active (refresh-churn repro)', () => {
    const current = makeViewerVideo({ id: 501 });
    // Simulate post-refresh: the user's preferred scope is "recent", but on
    // reload it briefly registers then unregisters (viewer-open flicker / empty
    // cache) while "probes" stays registered.
    useAssetViewerStore.setState({
      currentAsset: current,
      mode: 'side',
      preferredScopeId: 'recent',
      activeScopeId: 'recent',
      scopes: {},
      assetList: [],
      currentIndex: -1,
    });

    const probes = [makeViewerVideo({ id: 502 }), makeViewerVideo({ id: 501 })];
    useAssetViewerStore.getState().registerScope('probes', 'Probes (2)', probes);
    const recent = [makeViewerVideo({ id: 503 }), makeViewerVideo({ id: 501 })];
    useAssetViewerStore.getState().registerScope('recent', 'Recent (2)', recent);

    // recent flickers out → fallback must NOT permanently hand active to probes.
    useAssetViewerStore.getState().unregisterScope('recent');
    expect(useAssetViewerStore.getState().activeScopeId).toBe('probes');

    // recent comes back → it must reclaim active because it's the preferred scope.
    useAssetViewerStore.getState().registerScope('recent', 'Recent (2)', recent);
    const state = useAssetViewerStore.getState();
    expect(state.activeScopeId).toBe('recent');
    expect(state.preferredScopeId).toBe('recent');
  });
});

describe('assetViewerStore follow-latest respects explicit navigation', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // no-op
    }
    mocks.isVideoPlayingAsset.mockReset();
    mocks.isVideoPlayingAsset.mockReturnValue(false);
    mocks.emitAssetViewed.mockReset();
    useAssetViewerStore.setState(useAssetViewerStore.getInitialState(), true);
  });

  it('flags a new arrival as pending (no steal) when the user has navigated off the head', () => {
    const a = makeViewerVideo({ id: 1 });
    const b = makeViewerVideo({ id: 2 });
    const c = makeViewerVideo({ id: 3 });
    useAssetViewerStore.getState().openViewer(a, [a, b, c], 'recent');

    // User clicks an earlier thumb — now parked off the head.
    useAssetViewerStore.getState().navigateToAssetId(b.id);
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(b.id);

    // A fresh video lands while `b` is still loading (not "playing" yet).
    const landed = makeViewerVideo({ id: 4 });
    useAssetViewerStore.getState().registerScope('recent', 'recent', [landed, a, b, c]);

    const state = useAssetViewerStore.getState();
    // Viewer stays on the user's selection; arrival only flags the strip.
    expect(state.currentAsset?.id).toBe(b.id);
    expect(state.pendingHeadId).toBe(landed.id);
  });

  it('auto-follows a new arrival when the user is parked on the head', () => {
    const a = makeViewerVideo({ id: 1 });
    const b = makeViewerVideo({ id: 2 });
    useAssetViewerStore.getState().openViewer(a, [a, b], 'recent');
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(a.id);

    const landed = makeViewerVideo({ id: 3 });
    useAssetViewerStore.getState().registerScope('recent', 'recent', [landed, a, b]);

    // The swap is debounced — until the settle window elapses the viewer stays
    // parked and only the strip pulse (pendingHeadId) advances.
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(a.id);
    expect(useAssetViewerStore.getState().pendingHeadId).toBe(landed.id);

    vi.runOnlyPendingTimers();

    const state = useAssetViewerStore.getState();
    expect(state.currentAsset?.id).toBe(landed.id);
    expect(state.currentIndex).toBe(0);
    expect(state.pendingHeadId).toBeNull();
  });

  it('coalesces a burst of arrivals into a single swap to the newest head', () => {
    const a = makeViewerVideo({ id: 1 });
    useAssetViewerStore.getState().openViewer(a, [a], 'recent');

    const b = makeViewerVideo({ id: 2 });
    const c = makeViewerVideo({ id: 3 });
    const d = makeViewerVideo({ id: 4 });
    // Three heads land back-to-back with no settle between them.
    useAssetViewerStore.getState().registerScope('recent', 'recent', [b, a]);
    useAssetViewerStore.getState().registerScope('recent', 'recent', [c, b, a]);
    useAssetViewerStore.getState().registerScope('recent', 'recent', [d, c, b, a]);

    // Still parked on the pre-burst head; only the strip pulse advanced.
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(a.id);
    expect(useAssetViewerStore.getState().pendingHeadId).toBe(d.id);

    vi.runOnlyPendingTimers();

    // One swap, straight to the newest head — not one per arrival.
    const state = useAssetViewerStore.getState();
    expect(state.currentAsset?.id).toBe(d.id);
    expect(state.currentIndex).toBe(0);
    expect(state.pendingHeadId).toBeNull();
  });

  it('abandons a debounced follow when the user navigates away mid-burst', () => {
    const a = makeViewerVideo({ id: 1 });
    const b = makeViewerVideo({ id: 2 });
    useAssetViewerStore.getState().openViewer(a, [a, b], 'recent');

    const c = makeViewerVideo({ id: 3 });
    useAssetViewerStore.getState().registerScope('recent', 'recent', [c, a, b]);

    // User deliberately jumps to an earlier asset before the settle fires.
    useAssetViewerStore.getState().navigateToAssetId(b.id);
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(b.id);

    vi.runOnlyPendingTimers();

    // The pending settle must not rip the viewer back onto the head.
    expect(useAssetViewerStore.getState().currentAsset?.id).toBe(b.id);
  });
});
