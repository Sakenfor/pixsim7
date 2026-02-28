import { describe, it, expect } from 'vitest';

import { buildGenerationRequest, type QuickGenerateContext } from '../quickGenerateLogic';

function createBaseContext(partial: Partial<QuickGenerateContext> = {}): QuickGenerateContext {
  return {
    operationType: 'text_to_image',
    prompt: '',
    dynamicParams: {},
    prompts: [],
    ...partial,
  };
}

describe('buildGenerationRequest', async () => {
  it('requires a prompt for text-based operations', async () => {
    const result = await buildGenerationRequest(createBaseContext());

    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Please enter a prompt');
  });

  it('accepts a prompt and trims whitespace for text operations', async () => {
    const result = await buildGenerationRequest(
      createBaseContext({
        prompt: '   cinematic dusk skyline   ',
      })
    );

    expect(result.error).toBeUndefined();
    expect(result.params).toBeDefined();
    expect(result?.params?.prompt).toBe('cinematic dusk skyline');
  });

  it('clamps prompt to maxChars in payload', async () => {
    const result = await buildGenerationRequest(
      createBaseContext({
        prompt: '   cinematic dusk skyline   ',
        maxChars: 9,
      })
    );

    expect(result.error).toBeUndefined();
    expect(result.finalPrompt).toBe('cinematic');
    expect(result?.params?.prompt).toBe('cinematic');
  });

  it('keeps 50 chars of headroom when clamping larger prompt limits', async () => {
    const overlongPrompt = 'x'.repeat(160);
    const result = await buildGenerationRequest(
      createBaseContext({
        prompt: overlongPrompt,
        maxChars: 100,
      })
    );

    expect(result.error).toBeUndefined();
    expect(result.finalPrompt).toHaveLength(50);
    expect(result?.params?.prompt).toHaveLength(50);
    expect(result.finalPrompt).toBe(overlongPrompt.slice(0, 50));
  });

  it('does not let dynamicParams.prompt override clamped prompt', async () => {
    const result = await buildGenerationRequest(
      createBaseContext({
        prompt: '  hero in storm  ',
        dynamicParams: {
          prompt: 'stale unbounded prompt from params store',
          model: 'seedream_4',
        },
        maxChars: 4,
      })
    );

    expect(result.error).toBeUndefined();
    expect(result.finalPrompt).toBe('hero');
    expect(result?.params?.prompt).toBe('hero');
    expect(result?.params?.model).toBe('seedream_4');
  });

  it('requires a prompt for image_to_image even when an image is provided', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: '   ',
      dynamicParams: { source_asset_id: 42 },
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toContain('Please enter a prompt');
  });

  it('requires a source image for image_to_image', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Add neon rim light',
      dynamicParams: {},  // No source_asset_id
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toContain('No image selected');
  });

  it('passes validation when image_to_image uses composition_assets', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Add neon rim light',
      dynamicParams: { source_asset_id: 42 },
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      prompt: 'Add neon rim light',
      composition_assets: [
        { asset: 'asset:42', layer: 0, role: 'environment', media_type: 'image' },
      ],
    });
  });

  it('builds composition_assets from multi-queue assets for image_to_image', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Blend the characters',
      operationInputs: [
        { id: 'a', asset: { id: 10, mediaType: 'image' }, queuedAt: '' },
        { id: 'b', asset: { id: 11, mediaType: 'image' }, queuedAt: '' },
      ] as any,
      dynamicParams: {},
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      composition_assets: [
        { asset: 'asset:10', layer: 0, role: 'environment', media_type: 'image' },
        { asset: 'asset:11', layer: 1, role: 'main_character', media_type: 'image' },
      ],
    });
  });

  it('builds composition_assets from queued local URLs when backend IDs are unavailable', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Blend these',
      operationInputs: [
        {
          id: 'local-a',
          asset: { id: -1, mediaType: 'image', previewUrl: 'blob:local-image-1' },
          queuedAt: '',
        },
      ] as any,
      dynamicParams: {},
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.composition_assets).toEqual([
      { url: 'blob:local-image-1', layer: 0, role: 'environment', media_type: 'image' },
    ]);
  });

  it('assigns default roles to composition_assets (first=environment, others=main_character)', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Combine these images',
      operationInputs: [
        { id: 'a', asset: { id: 1, mediaType: 'image' }, queuedAt: '' },
        { id: 'b', asset: { id: 2, mediaType: 'image' }, queuedAt: '' },
        { id: 'c', asset: { id: 3, mediaType: 'image' }, queuedAt: '' },
      ] as any,
      dynamicParams: {},
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.composition_assets).toEqual([
      { asset: 'asset:1', layer: 0, role: 'environment', media_type: 'image' },
      { asset: 'asset:2', layer: 1, role: 'main_character', media_type: 'image' },
      { asset: 'asset:3', layer: 2, role: 'main_character', media_type: 'image' },
    ]);
  });

  it('infers roles from asset tags when available', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Combine these images',
      operationInputs: [
        {
          id: 'a',
          asset: {
            id: 1,
            mediaType: 'image',
            tags: [{ slug: 'char:hero', name: 'hero' }],
          },
          queuedAt: '',
        },
        {
          id: 'b',
          asset: {
            id: 2,
            mediaType: 'image',
            tags: [{ slug: 'bg', name: 'bg' }],
          },
          queuedAt: '',
        },
        {
          id: 'c',
          asset: {
            id: 3,
            mediaType: 'image',
            tags: [{ slug: 'npc:alex', name: 'alex' }],
          },
          queuedAt: '',
        },
      ] as any,
      dynamicParams: {},
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    // char:hero -> main_character
    // bg -> environment
    // npc:alex -> main_character (namespace "npc" maps to main_character)
    expect(result.params?.composition_assets).toEqual([
      { asset: 'asset:1', layer: 0, role: 'main_character', media_type: 'image' },
      { asset: 'asset:2', layer: 1, role: 'environment', media_type: 'image' },
      { asset: 'asset:3', layer: 2, role: 'main_character', media_type: 'image' },
    ]);
  });

  it('falls back to default role when tags do not map', async () => {
    const context = createBaseContext({
      operationType: 'image_to_image',
      prompt: 'Combine these images',
      operationInputs: [
        {
          id: 'a',
          asset: {
            id: 1,
            mediaType: 'image',
            tags: [{ slug: 'unknown:tag', name: 'tag' }],
          },
          queuedAt: '',
        },
        {
          id: 'b',
          asset: {
            id: 2,
            mediaType: 'image',
            // no tags
          },
          queuedAt: '',
        },
      ] as any,
      dynamicParams: {},
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    // First gets default environment, second gets default main_character
    expect(result.params?.composition_assets).toEqual([
      { asset: 'asset:1', layer: 0, role: 'environment', media_type: 'image' },
      { asset: 'asset:2', layer: 1, role: 'main_character', media_type: 'image' },
    ]);
  });

  it('normalizes toggle params to ints and drops disabled ones', async () => {
    const context = createBaseContext({
      prompt: 'waves',
      dynamicParams: {
        audio: true,
        multi_shot: 'true',
        off_peak: 'false',
      },
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      audio: 1,
      multi_shot: 1,
    });
    expect(result.params).not.toHaveProperty('off_peak');
  });

  it('rounds duration values to integers', async () => {
    const context = createBaseContext({
      prompt: 'waves',
      dynamicParams: {
        duration: '12.6',
      },
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.duration).toBe(13);
  });

  it('includes sanitized transition durations per segment', async () => {
    const context = createBaseContext({
      operationType: 'video_transition',
      prompt: 'make it seamless',
      dynamicParams: { source_asset_ids: [1, 2, 3] },
      prompts: ['fade', 'sparkle'],
      transitionDurations: [1.2, 9],
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.durations).toEqual([1, 5]);
  });

  it('accepts source_asset_ids for video_transition without imageUrls', async () => {
    const context = createBaseContext({
      operationType: 'video_transition',
      prompt: 'make it seamless',
      dynamicParams: { source_asset_ids: [1, 2, 3] },
      prompts: ['fade', 'sparkle'],
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params).toMatchObject({
      composition_assets: [
        { asset: 'asset:1', role: 'transition_input', layer: 0, media_type: 'image' },
        { asset: 'asset:2', role: 'transition_input', layer: 1, media_type: 'image' },
        { asset: 'asset:3', role: 'transition_input', layer: 2, media_type: 'image' },
      ],
      prompts: ['fade', 'sparkle'],
    });
  });

  it('prefers source_asset_id and strips legacy image_url for image_to_video', async () => {
    const context = createBaseContext({
      operationType: 'image_to_video',
      prompt: 'animate this',
      dynamicParams: { source_asset_id: 7, image_url: 'img_id:legacy' },
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.composition_assets).toMatchObject([
      { asset: 'asset:7', role: 'source_image', media_type: 'image' },
    ]);
    expect(result.params).not.toHaveProperty('image_url');
  });

  it('uses queued local URLs as source_image composition assets for image_to_video', async () => {
    const context = createBaseContext({
      operationType: 'image_to_video',
      prompt: 'animate this',
      dynamicParams: {},
      operationInputs: [
        {
          id: 'local-i2v',
          asset: { id: -42, mediaType: 'image', previewUrl: 'blob:local-i2v' },
          queuedAt: '',
        },
      ] as any,
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.composition_assets).toEqual([
      { url: 'blob:local-i2v', layer: 0, role: 'source_image', media_type: 'image' },
    ]);
  });

  it('accepts queued local URLs for video_extend without requiring backend IDs', async () => {
    const context = createBaseContext({
      operationType: 'video_extend',
      prompt: '',
      dynamicParams: {},
      operationInputs: [
        {
          id: 'local-extend',
          asset: { id: -9, mediaType: 'video', previewUrl: 'blob:local-video' },
          queuedAt: '',
        },
      ] as any,
    });

    const result = await buildGenerationRequest(context);
    expect(result.error).toBeUndefined();
    expect(result.params?.composition_assets).toEqual([
      { url: 'blob:local-video', layer: 0, role: 'source_video', media_type: 'video' },
    ]);
  });
});
