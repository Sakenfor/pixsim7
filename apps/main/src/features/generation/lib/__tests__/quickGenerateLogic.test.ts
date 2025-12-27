import { describe, it, expect } from 'vitest';
import { buildGenerationRequest, type QuickGenerateContext } from '../quickGenerateLogic';

function createBaseContext(partial: Partial<QuickGenerateContext> = {}): QuickGenerateContext {
  return {
    operationType: 'text_to_image',
    prompt: '',
    presetParams: {},
    dynamicParams: {},
    prompts: [],
    ...partial,
  };
}

describe('buildGenerationRequest', () => {
  it('requires a prompt for text-based operations', () => {
    const result = buildGenerationRequest(createBaseContext());

    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Please enter a prompt');
  });

  it('accepts a prompt and trims whitespace for text operations', () => {
    const result = buildGenerationRequest(
      createBaseContext({
        prompt: '   cinematic dusk skyline   ',
      })
    );

    expect(result.error).toBeUndefined();
    expect(result.params).toBeDefined();
    expect(result?.params?.prompt).toBe('cinematic dusk skyline');
  });

  it('requires a prompt for image_to_image even when an image is provided', () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: '   ',
      dynamicParams: { source_asset_id: 42 },
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toContain('Please enter a prompt');
  });

  it('requires a source image for image_to_image', () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Add neon rim light',
      dynamicParams: {},  // No source_asset_id
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toContain('No image selected');
  });

  it('passes validation when image_to_image uses composition_assets', () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Add neon rim light',
      dynamicParams: { source_asset_id: 42 },
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      prompt: 'Add neon rim light',
      composition_assets: [
        { asset: 'asset:42', layer: 0 },
      ],
    });
  });

  it('normalizes toggle params to ints and drops disabled ones', () => {
    const context = createBaseContext({
      prompt: 'waves',
      dynamicParams: {
        audio: true,
        multi_shot: 'true',
        off_peak: 'false',
      },
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      audio: 1,
      multi_shot: 1,
    });
    expect(result.params).not.toHaveProperty('off_peak');
  });

  it('rounds duration values to integers', () => {
    const context = createBaseContext({
      prompt: 'waves',
      dynamicParams: {
        duration: '12.6',
      },
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.duration).toBe(13);
  });

  it('includes sanitized transition durations per segment', () => {
    const context = createBaseContext({
      operationType: 'video_transition',
      prompt: 'make it seamless',
      dynamicParams: { source_asset_ids: [1, 2, 3] },
      prompts: ['fade', 'sparkle'],
      transitionDurations: [1.2, 9],
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.durations).toEqual([1, 5]);
  });

  it('accepts source_asset_ids for video_transition without imageUrls', () => {
    const context = createBaseContext({
      operationType: 'video_transition',
      prompt: 'make it seamless',
      dynamicParams: { source_asset_ids: [1, 2, 3] },
      prompts: ['fade', 'sparkle'],
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      source_asset_ids: [1, 2, 3],
      prompts: ['fade', 'sparkle'],
    });
  });

  it('prefers source_asset_id and strips legacy image_url for image_to_video', () => {
    const context = createBaseContext({
      operationType: 'image_to_video',
      prompt: 'animate this',
      dynamicParams: { source_asset_id: 7, image_url: 'img_id:legacy' },
    });

    const result = buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.source_asset_id).toBe(7);
    expect(result.params).not.toHaveProperty('image_url');
  });
});
