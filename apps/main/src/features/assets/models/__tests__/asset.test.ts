import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetModel } from '../asset';

// ---------------------------------------------------------------------------
// Mocks – hoisted so vi.mock can reference them
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  downloadOnGenerate: false as boolean,
  getAssetDisplayUrls: vi.fn(() => ({
    mainUrl: undefined as string | undefined,
    thumbnailUrl: '/api/v1/media/thumb-key' as string | undefined,
    previewUrl: '/api/v1/media/preview-key' as string | undefined,
  })),
}));

vi.mock('../../stores/mediaSettingsStore', () => ({
  useMediaSettingsStore: {
    getState: () => ({
      serverSettings: { download_on_generate: mocks.downloadOnGenerate },
    }),
  },
}));

vi.mock('@lib/api/client', () => ({
  BACKEND_BASE: 'http://localhost:8000',
}));

vi.mock('@lib/media/backendUrl', () => ({
  ensureBackendAbsolute: (url: string | undefined) => url,
}));

vi.mock('../../lib/assetUrlResolver', () => ({
  resolveAssetUrl: () => mocks.getAssetDisplayUrls().mainUrl,
  resolveThumbnailUrl: () => mocks.getAssetDisplayUrls().thumbnailUrl,
  resolvePreviewUrl: () => mocks.getAssetDisplayUrls().previewUrl,
}));

// Import after mocks
import { toViewerAsset } from '../asset';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAsset(overrides: Partial<AssetModel> = {}): AssetModel {
  return {
    id: 1,
    createdAt: '2026-03-28T00:00:00Z',
    isArchived: false,
    mediaType: 'video',
    providerAssetId: 'pv-123',
    providerId: 'pixverse',
    syncStatus: 'remote',
    userId: 1,
    uploadMethod: 'generated',
    sourceGenerationId: 42,
    remoteUrl: 'https://cdn.example.com/video.mp4',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('toViewerAsset – remote video fallback gating', () => {
  beforeEach(() => {
    mocks.downloadOnGenerate = false;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: undefined,
      thumbnailUrl: '/api/v1/media/thumb-key',
      previewUrl: '/api/v1/media/preview-key',
    });
  });

  it('suppresses remote video fallback when download_on_generate=true and not local-ready', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({ syncStatus: 'remote', storedKey: undefined });
    const viewer = toViewerAsset(asset);
    // Remote is suppressed and the only other display URLs are image
    // thumb/preview — never valid <video> sources — so there is no playable
    // video source and fullUrl is left undefined (poster still rides as `url`).
    expect(viewer.fullUrl).toBeUndefined();
  });

  it('never uses an image thumbnail/preview as a video fullUrl', () => {
    mocks.downloadOnGenerate = false;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: undefined,
      thumbnailUrl: '/api/v1/media/thumb-key.jpg',
      previewUrl: '/api/v1/media/preview-key.jpg',
    });
    // No remote video source either → nothing playable.
    const asset = makeAsset({ remoteUrl: undefined, syncStatus: 'remote', storedKey: undefined });
    const viewer = toViewerAsset(asset);
    // An image src would render as a broken <video>; better to have no source.
    expect(viewer.fullUrl).toBeUndefined();
    // The thumbnail still rides along as the poster/url.
    expect(viewer.url).toBe('/api/v1/media/thumb-key.jpg');
  });

  it('falls back to a video preview (but never an image one) when no main/remote source', () => {
    mocks.downloadOnGenerate = false;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: undefined,
      thumbnailUrl: '/api/v1/media/thumb-key.jpg',
      previewUrl: '/api/v1/media/preview-clip.mp4',
    });
    const asset = makeAsset({ remoteUrl: undefined, syncStatus: 'remote', storedKey: undefined });
    const viewer = toViewerAsset(asset);
    expect(viewer.fullUrl).toBe('/api/v1/media/preview-clip.mp4');
  });

  it('provides fullUrl from local source when download_on_generate=true and local-ready (downloaded)', () => {
    mocks.downloadOnGenerate = true;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: '/api/v1/media/stored-key',
      thumbnailUrl: '/api/v1/media/thumb-key',
      previewUrl: '/api/v1/media/preview-key',
    });
    const asset = makeAsset({ syncStatus: 'downloaded', storedKey: 'stored-key' });
    const viewer = toViewerAsset(asset);
    expect(viewer.fullUrl).toBe('/api/v1/media/stored-key');
  });

  it('provides fullUrl from local source when download_on_generate=true and has storedKey', () => {
    mocks.downloadOnGenerate = true;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: '/api/v1/media/stored-key',
      thumbnailUrl: '/api/v1/media/thumb-key',
      previewUrl: '/api/v1/media/preview-key',
    });
    const asset = makeAsset({ syncStatus: 'remote', storedKey: 'stored-key' });
    const viewer = toViewerAsset(asset);
    expect(viewer.fullUrl).toBe('/api/v1/media/stored-key');
  });

  it('allows remote fallback for videos when download_on_generate=false', () => {
    mocks.downloadOnGenerate = false;
    const asset = makeAsset({ syncStatus: 'remote', storedKey: undefined });
    const viewer = toViewerAsset(asset);
    // remoteUrl should be used in the fallback chain
    expect(viewer.fullUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('does not gate non-video assets even with download_on_generate=true', () => {
    mocks.downloadOnGenerate = true;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: 'https://cdn.example.com/image.png',
      thumbnailUrl: '/api/v1/media/thumb-key',
      previewUrl: '/api/v1/media/preview-key',
    });
    const asset = makeAsset({
      mediaType: 'image',
      syncStatus: 'remote',
      storedKey: undefined,
      remoteUrl: 'https://cdn.example.com/image.png',
    });
    const viewer = toViewerAsset(asset);
    expect(viewer.fullUrl).toBe('https://cdn.example.com/image.png');
  });

  it('does not gate non-generated video (manual upload)', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({
      uploadMethod: 'manual',
      sourceGenerationId: undefined,
      syncStatus: 'remote',
      storedKey: undefined,
    });
    const viewer = toViewerAsset(asset);
    // Should use remote fallback since it's not a generated video
    expect(viewer.fullUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('sets viewer type to video for video assets', () => {
    const asset = makeAsset();
    const viewer = toViewerAsset(asset);
    expect(viewer.type).toBe('video');
  });

  it('sets viewer type to image for image assets', () => {
    const asset = makeAsset({ mediaType: 'image' });
    const viewer = toViewerAsset(asset);
    expect(viewer.type).toBe('image');
  });
});
