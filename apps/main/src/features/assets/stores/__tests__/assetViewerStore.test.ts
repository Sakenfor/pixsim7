import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(state.assetList.map((a) => a.id)).toEqual([403, 401]);
  });
});
