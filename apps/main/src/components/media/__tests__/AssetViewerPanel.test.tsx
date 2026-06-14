import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockAsset {
  id: number;
  name: string;
  type: 'video';
  url: string;
  fullUrl: string;
  source: 'gallery';
}

interface MockViewerState {
  currentAsset: MockAsset;
  mode: 'side' | 'fullscreen';
  settings: {
    autoPlayVideos: boolean;
    loopVideos: boolean;
    showMetadata: boolean;
  };
  showMetadata: boolean;
  currentIndex: number;
  assetList: MockAsset[];
  scopes: Record<string, unknown>;
  activeScopeId: string | null;
  closeViewer: () => void;
  toggleFullscreen: () => void;
  navigatePrev: () => void;
  navigateNext: () => void;
  toggleMetadata: () => void;
}

const mocks = vi.hoisted(() => ({
  state: {} as MockViewerState,
  refAsset: vi.fn((id: number) => `asset:${id}`),
  authenticatedMedia: vi.fn<
    (url: string | undefined, options: unknown) => { src: string | undefined }
  >(
    () => ({ src: undefined }),
  ),
  streamSrc: vi.fn<(url: string | undefined) => string | undefined>(() => undefined),
  suspended: false,
  managedVideoRef: vi.fn(),
}));

vi.mock('@pixsim7/shared.ref.core', () => ({
  Ref: { asset: (id: number) => mocks.refAsset(id) },
}));
vi.mock('@lib/icons', () => ({ Icon: () => null }));
vi.mock('@lib/media/mediaSuspendStore', () => ({
  useMediaSuspended: () => mocks.suspended,
}));
vi.mock('@lib/media/videoDecoder', () => ({
  useManagedVideoSource: () => mocks.managedVideoRef,
}));
vi.mock('@features/assets', () => ({
  useAssetViewerStore: (selector: (state: MockViewerState) => unknown) =>
    selector(mocks.state),
  selectCanNavigatePrev: (state: MockViewerState) => state.currentIndex > 0,
  selectCanNavigateNext: (state: MockViewerState) =>
    state.currentIndex < state.assetList.length - 1,
}));
vi.mock('@features/contextHub', () => ({
  CAP_ASSET_SELECTION: 'assetSelection',
  useProvideCapability: () => {},
}));
vi.mock('@features/panels', () => ({
  ensurePanelMetadataRegistered: vi.fn(),
  panelManager: {
    getPanelMetadata: () => ({ id: 'asset-viewer' }),
    subscribe: () => () => {},
  },
  usePanel: () => ({ open: vi.fn(), close: vi.fn() }),
}));
vi.mock('@features/panels/components/host/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
}));
vi.mock('@features/panels/lib/panelIds', () => ({
  PANEL_IDS: { assetViewer: 'asset-viewer' },
}));
vi.mock('@/hooks/useMediaStreamSrc', () => ({
  useMediaStreamSrc: (url: string | undefined) => mocks.streamSrc(url),
}));
vi.mock('@/hooks/useAuthenticatedMedia', () => ({
  useAuthenticatedMedia: (url: string | undefined, options: unknown) =>
    mocks.authenticatedMedia(url, options),
}));
vi.mock('../viewer', () => ({
  AssetViewerDockview: () => <div data-testid="asset-viewer-dockview" />,
}));

import { AssetViewerPanel } from '../AssetViewerPanel';

function videoAsset(id: number, fullUrl = `/api/v1/media/video-${id}.mp4`): MockAsset {
  return {
    id,
    name: `video ${id}`,
    type: 'video',
    url: `/api/v1/media/thumb-${id}.jpg`,
    fullUrl,
    source: 'gallery',
  };
}

function makeState(mode: 'side' | 'fullscreen'): MockViewerState {
  const assetList = [videoAsset(1), videoAsset(2)];
  return {
    currentAsset: assetList[0],
    mode,
    settings: {
      autoPlayVideos: true,
      loopVideos: true,
      showMetadata: false,
    },
    showMetadata: false,
    currentIndex: 0,
    assetList,
    scopes: {},
    activeScopeId: null,
    closeViewer: vi.fn(),
    toggleFullscreen: vi.fn(),
    navigatePrev: vi.fn(),
    navigateNext: vi.fn(),
    toggleMetadata: vi.fn(),
  };
}

beforeEach(() => {
  mocks.state = makeState('side');
  mocks.refAsset.mockClear();
  mocks.authenticatedMedia.mockClear();
  mocks.authenticatedMedia.mockReturnValue({ src: undefined });
  mocks.streamSrc.mockClear();
  mocks.streamSrc.mockReturnValue(undefined);
  mocks.suspended = false;
  mocks.managedVideoRef.mockClear();
});

afterEach(() => cleanup());

describe('AssetViewerPanel media loading', () => {
  it('does not start a duplicate full-media fetch while the docked viewer owns rendering', () => {
    render(<AssetViewerPanel />);

    expect(mocks.streamSrc).toHaveBeenCalledWith(undefined);
    expect(mocks.authenticatedMedia).toHaveBeenCalledWith(undefined, {
      mediaType: 'image',
      active: false,
    });
  });

  it('streams fullscreen videos and does not resolve them into authenticated blobs', () => {
    mocks.state = makeState('fullscreen');
    mocks.streamSrc.mockReturnValue('/api/v1/media/video-1.mp4?token=test');

    const { container } = render(<AssetViewerPanel />);

    expect(mocks.streamSrc).toHaveBeenCalledWith('/api/v1/media/video-1.mp4');
    expect(mocks.authenticatedMedia).toHaveBeenCalledWith(undefined, {
      mediaType: 'image',
      active: true,
    });
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      '/api/v1/media/video-1.mp4?token=test',
    );
  });

  it('does not rebuild refs for the whole navigation list on each strip selection', () => {
    const { rerender } = render(<AssetViewerPanel />);
    expect(mocks.refAsset).toHaveBeenCalledTimes(3);

    mocks.state = {
      ...mocks.state,
      currentAsset: mocks.state.assetList[1],
      currentIndex: 1,
    };
    rerender(<AssetViewerPanel />);

    expect(mocks.refAsset).toHaveBeenCalledTimes(4);
  });
});
