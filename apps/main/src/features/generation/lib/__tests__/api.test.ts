import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareGenerateAssetSubmission } from '../api';

const { getSupportedControlsMock } = vi.hoisted(() => ({
  getSupportedControlsMock: vi.fn(() => [] as string[]),
}));

vi.mock('@features/providers', () => ({
  providerCapabilityRegistry: {
    getSupportedControls: getSupportedControlsMock,
  },
}));

describe('prepareGenerateAssetSubmission', () => {
  beforeEach(() => {
    getSupportedControlsMock.mockReturnValue([]);
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
});
