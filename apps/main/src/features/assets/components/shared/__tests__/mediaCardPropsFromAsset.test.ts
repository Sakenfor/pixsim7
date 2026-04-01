import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetModel } from '../../../models/asset';

// ---------------------------------------------------------------------------
// Mocks – hoisted so vi.mock can reference them
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // jsdom doesn't provide matchMedia — stub before any module loads
  if (typeof globalThis.window !== 'undefined' && !globalThis.window.matchMedia) {
    (globalThis.window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  return {
  getAssetDisplayUrls: vi.fn(() => ({
    mainUrl: 'https://cdn.example.com/video.mp4',
    thumbnailUrl: '/api/v1/media/thumb-key',
    previewUrl: '/api/v1/media/preview-key',
  })),
  downloadOnGenerate: false as boolean,
};
});

// Break transitive chain: favoriteTag → api imports cause deep module loading
vi.mock('../../../lib/favoriteTag', () => ({
  FAVORITE_TAG_SLUG: 'user:favorite',
}));

vi.mock('../../../models/asset', () => ({
  getAssetDisplayUrls: mocks.getAssetDisplayUrls,
}));

vi.mock('../../../stores/mediaSettingsStore', () => ({
  useMediaSettingsStore: {
    getState: () => ({
      serverSettings: { download_on_generate: mocks.downloadOnGenerate },
    }),
  },
}));

// Import after mocks
import { mediaCardPropsFromAsset } from '../mediaCardPropsFromAsset';

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
describe('mediaCardPropsFromAsset – remote video gating', () => {
  beforeEach(() => {
    mocks.downloadOnGenerate = false;
    mocks.getAssetDisplayUrls.mockReturnValue({
      mainUrl: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: '/api/v1/media/thumb-key',
      previewUrl: '/api/v1/media/preview-key',
    });
  });

  it('suppresses remoteUrl for generated video when download_on_generate=true and not local-ready', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({ syncStatus: 'remote', storedKey: undefined });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).toBe('');
  });

  it('returns remoteUrl for generated video when download_on_generate=true and local-ready (downloaded)', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({ syncStatus: 'downloaded' });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).not.toBe('');
  });

  it('returns remoteUrl for generated video when download_on_generate=true and local-ready (storedKey)', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({ syncStatus: 'remote', storedKey: 'stored/video.mp4' });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).not.toBe('');
  });

  it('returns remoteUrl when download_on_generate=false (remote fallback enabled)', () => {
    mocks.downloadOnGenerate = false;
    const asset = makeAsset({ syncStatus: 'remote', storedKey: undefined });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).not.toBe('');
  });

  it('does not suppress remoteUrl for non-video assets even with download_on_generate=true', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({ mediaType: 'image', syncStatus: 'remote', storedKey: undefined });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).not.toBe('');
  });

  it('does not suppress remoteUrl for non-generated video (manual upload)', () => {
    mocks.downloadOnGenerate = true;
    const asset = makeAsset({
      uploadMethod: 'manual',
      sourceGenerationId: undefined,
      syncStatus: 'remote',
      storedKey: undefined,
    });
    const props = mediaCardPropsFromAsset(asset);
    expect(props.remoteUrl).not.toBe('');
  });
});
