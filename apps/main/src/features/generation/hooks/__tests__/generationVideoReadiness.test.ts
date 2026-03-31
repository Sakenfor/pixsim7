/**
 * Tests for the readiness-gating helpers exported from useGenerationWebSocket.
 *
 * These pure/near-pure helpers determine whether a generated video
 * should be surfaced to the gallery immediately or deferred until
 * local storage is ready.
 */
import { describe, expect, it, vi } from 'vitest';

import type { AssetResponse } from '@lib/api/assets';

// ---------------------------------------------------------------------------
// Mocks — keep the CDN probing stubbed so isAssetReadyForGallery tests
// exercise only the synchronous decision branches.
// ---------------------------------------------------------------------------
vi.mock('@lib/api', () => ({
  pixsimClient: { get: vi.fn(), post: vi.fn() },
  BACKEND_BASE: 'http://localhost:8000',
}));

vi.mock('@lib/utils', () => ({
  debugFlags: { log: vi.fn() },
  hmrSingleton: (_key: string, factory: () => unknown) => factory(),
}));

vi.mock('@features/assets', () => ({
  assetEvents: { emitAssetCreated: vi.fn(), emitAssetUpdated: vi.fn(), emitAssetDeleted: vi.fn() },
  fromAssetResponse: vi.fn((r: unknown) => r),
  getAssetDisplayUrls: vi.fn(() => ({ mainUrl: '', thumbnailUrl: '', previewUrl: '' })),
  useMediaSettingsStore: { getState: () => ({ serverSettings: null }) },
}));

vi.mock('@/types/websocket', () => ({
  parseWebSocketMessage: vi.fn(),
}));

vi.mock('../../models', () => ({
  fromGenerationResponse: vi.fn((r: unknown) => r),
}));

vi.mock('../../stores/generationHistoryStore', () => ({
  useGenerationHistoryStore: { getState: vi.fn(() => ({})) },
}));

vi.mock('../../stores/generationsStore', () => ({
  useGenerationsStore: { getState: vi.fn(() => ({ addOrUpdate: vi.fn(), patch: vi.fn() })) },
}));

// Import the helpers under test (exported with @internal marker)
import {
  hasLocalVideoReady,
  isAssetReadyForGallery,
  isGeneratedVideoAsset,
} from '../useGenerationWebSocket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAssetResponse(overrides: Partial<AssetResponse> = {}): AssetResponse {
  return {
    id: 1,
    user_id: 1,
    media_type: 'video',
    provider_id: 'pixverse',
    provider_asset_id: 'pv-123',
    sync_status: 'remote',
    is_archived: false,
    created_at: '2026-03-28T00:00:00Z',
    ...overrides,
  } as AssetResponse;
}

// ---------------------------------------------------------------------------
// isGeneratedVideoAsset
// ---------------------------------------------------------------------------
describe('isGeneratedVideoAsset', () => {
  it('returns true for video with upload_method=generated', () => {
    expect(isGeneratedVideoAsset(makeAssetResponse({ upload_method: 'generated' }))).toBe(true);
  });

  it('returns true for video with source_generation_id', () => {
    expect(isGeneratedVideoAsset(makeAssetResponse({ source_generation_id: 99 }))).toBe(true);
  });

  it('returns false for image even with upload_method=generated', () => {
    expect(isGeneratedVideoAsset(makeAssetResponse({ media_type: 'image', upload_method: 'generated' }))).toBe(false);
  });

  it('returns false for video without generation markers', () => {
    expect(isGeneratedVideoAsset(makeAssetResponse({ upload_method: 'manual' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasLocalVideoReady
// ---------------------------------------------------------------------------
describe('hasLocalVideoReady', () => {
  it('returns true when sync_status is downloaded', () => {
    expect(hasLocalVideoReady(makeAssetResponse({ sync_status: 'downloaded' }))).toBe(true);
  });

  it('returns true when stored_key is present', () => {
    expect(hasLocalVideoReady(makeAssetResponse({ stored_key: 'media/video.mp4' }))).toBe(true);
  });

  it('returns false when remote-only with no stored_key', () => {
    expect(hasLocalVideoReady(makeAssetResponse({ sync_status: 'remote', stored_key: null }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAssetReadyForGallery – synchronous fast-path branches
// ---------------------------------------------------------------------------
describe('isAssetReadyForGallery', () => {
  it('returns true immediately when asset is locally downloaded', async () => {
    const asset = makeAssetResponse({ sync_status: 'downloaded' });
    await expect(isAssetReadyForGallery(asset)).resolves.toBe(true);
  });

  it('returns false for generated video when requireLocalGeneratedVideo and not local-ready', async () => {
    const asset = makeAssetResponse({
      upload_method: 'generated',
      sync_status: 'remote',
      stored_key: null,
    });
    await expect(
      isAssetReadyForGallery(asset, { requireLocalGeneratedVideo: true }),
    ).resolves.toBe(false);
  });

  it('returns true for generated video when requireLocalGeneratedVideo and locally downloaded', async () => {
    const asset = makeAssetResponse({
      upload_method: 'generated',
      sync_status: 'downloaded',
    });
    await expect(
      isAssetReadyForGallery(asset, { requireLocalGeneratedVideo: true }),
    ).resolves.toBe(true);
  });

  it('returns true for non-video remote asset without requiring local', async () => {
    const asset = makeAssetResponse({
      media_type: 'image',
      sync_status: 'remote',
      upload_method: 'generated',
    });
    await expect(isAssetReadyForGallery(asset)).resolves.toBe(true);
  });

  it('does not block non-video assets even with requireLocalGeneratedVideo', async () => {
    const asset = makeAssetResponse({
      media_type: 'image',
      sync_status: 'remote',
      upload_method: 'generated',
      stored_key: null,
    });
    await expect(
      isAssetReadyForGallery(asset, { requireLocalGeneratedVideo: true }),
    ).resolves.toBe(true);
  });

  it('returns true for non-generated video with remote_url', async () => {
    const asset = makeAssetResponse({
      upload_method: 'manual',
      sync_status: 'remote',
      remote_url: 'https://cdn.example.com/video.mp4',
    });
    const result = await isAssetReadyForGallery(asset, { requireLocalGeneratedVideo: true });
    expect(result).toBe(true);
  });

  it('does not surface generated external remote videos without usable preview thumbnail', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function'
      ? vi.spyOn(globalThis, 'fetch')
      : null;
    const asset = makeAssetResponse({
      upload_method: 'generated',
      sync_status: 'remote',
      remote_url: 'https://media.pixverse.ai/pixverse/mp4/media/web/ori/video.mp4',
    });
    await expect(isAssetReadyForGallery(asset)).resolves.toBe(false);
    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }
  });

  it('surfaces generated external remote videos once usable thumbnail exists', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function'
      ? vi.spyOn(globalThis, 'fetch')
      : null;
    const asset = makeAssetResponse({
      upload_method: 'generated',
      sync_status: 'remote',
      remote_url: 'https://media.pixverse.ai/pixverse/mp4/media/web/ori/video.mp4',
      thumbnail_url: 'https://media.pixverse.ai/pixverse/image/thumb/frame.jpg',
    });
    await expect(isAssetReadyForGallery(asset)).resolves.toBe(true);
    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }
  });
});
