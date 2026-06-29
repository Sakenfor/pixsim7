import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateAsset, prepareGenerateAssetSubmission } from '../api';

const { createGenerationMock, getSupportedControlsMock, uploadAssetToProviderMock } = vi.hoisted(() => ({
  createGenerationMock: vi.fn(),
  getSupportedControlsMock: vi.fn(() => [] as string[]),
  uploadAssetToProviderMock: vi.fn(),
}));

vi.mock('@lib/api/assets', () => ({
  uploadAssetToProvider: uploadAssetToProviderMock,
}));

vi.mock('@lib/api/generations', () => ({
  createGeneration: createGenerationMock,
}));

vi.mock('@features/providers', () => ({
  providerCapabilityRegistry: {
    getSupportedControls: getSupportedControlsMock,
  },
}));

describe('prepareGenerateAssetSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationMock.mockResolvedValue({ id: 123, status: 'pending' });
    getSupportedControlsMock.mockReturnValue([]);
    uploadAssetToProviderMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps artificial_extend at config root and out of provider style params', () => {
    const marker = {
      source_video_id: 101295,
      source_frame_asset_id: 4242,
      method: 'i2v_extracted_frame',
      frame: { mode: 'last' },
    };

    const prepared = prepareGenerateAssetSubmission({
      prompt: 'continue the shot',
      providerId: 'pixverse',
      operationType: 'image_to_video',
      extraParams: {
        model: 'v4',
        artificial_extend: marker,
      },
    });

    const config = prepared.generationConfig as Record<string, any>;

    expect(config.artificial_extend).toEqual(marker);
    expect(config.style?.pixverse?.artificial_extend).toBeUndefined();
    expect(config.style?.pixverse?.model).toBe('v4');
  });

  it('normalizes artificialExtend alias to artificial_extend', () => {
    const marker = {
      source_video_id: 101295,
      frame: { mode: 'timestamp', timestamp_sec: 2.5 },
    };

    const prepared = prepareGenerateAssetSubmission({
      prompt: 'continue the shot',
      providerId: 'pixverse',
      operationType: 'image_to_video',
      extraParams: {
        artificialExtend: marker,
      },
    });

    const config = prepared.generationConfig as Record<string, any>;

    expect(config.artificial_extend).toEqual(marker);
    expect(config.style?.pixverse?.artificialExtend).toBeUndefined();
  });

  it('skips i2v preflight reupload when composition asset has a target provider upload hint', async () => {
    await generateAsset({
      prompt: 'move',
      providerId: 'pixverse',
      operationType: 'image_to_video',
      extraParams: {
        composition_assets: [
          {
            asset: 'asset:10',
            media_type: 'image',
            provider_uploads: {
              pixverse: 'https://media.pixverse.ai/upload/source.jpg',
            },
          },
        ],
      },
    });

    expect(uploadAssetToProviderMock).not.toHaveBeenCalled();
    expect(createGenerationMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent i2v preflight uploads for the same provider asset', async () => {
    let resolveUpload: (() => void) | undefined;
    uploadAssetToProviderMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUpload = resolve;
      }),
    );

    const request = {
      prompt: 'move',
      providerId: 'pixverse',
      operationType: 'image_to_video' as const,
      extraParams: {
        composition_assets: [
          { asset: 'asset:20', media_type: 'image' },
        ],
      },
    };

    const first = generateAsset(request);
    const second = generateAsset(request);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(uploadAssetToProviderMock).toHaveBeenCalledTimes(1);
    expect(uploadAssetToProviderMock).toHaveBeenCalledWith(20, 'pixverse');

    resolveUpload?.();
    await Promise.all([first, second]);

    expect(createGenerationMock).toHaveBeenCalledTimes(2);
  });
});
