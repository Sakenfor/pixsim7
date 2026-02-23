// eslint-disable-next-line import/no-unresolved
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const rollTemplateMock = vi.fn();
  const generateAssetMock = vi.fn();
  const buildGenerationRequestMock = vi.fn();
  const addOrUpdateMock = vi.fn();
  const setWatchingGenerationMock = vi.fn();
  const setGeneratingMock = vi.fn();
  const recordUsageMock = vi.fn();

  const sessionState = {
    operationType: 'image_to_image',
    providerId: 'pixverse',
    generating: false,
    prompt: 'base prompt',
    setProvider: vi.fn(),
    setOperationType: vi.fn(),
    setGenerating: setGeneratingMock,
    setPrompt: vi.fn(),
  };

  const settingsState = {
    params: {},
  };

  const inputState = {
    inputsByOperation: {},
    getCurrentInput: vi.fn(() => null),
  };

  const generationsState = {
    generations: new Map<number, any>(),
    addOrUpdate: addOrUpdateMock,
    setWatchingGeneration: setWatchingGenerationMock,
  };

  const blockTemplateState = {
    pinnedTemplateId: 'tpl-1',
    templateRollMode: 'once' as 'once' | 'each',
    draftCharacterBindings: {},
  };

  return {
    rollTemplateMock,
    generateAssetMock,
    buildGenerationRequestMock,
    addOrUpdateMock,
    setWatchingGenerationMock,
    setGeneratingMock,
    recordUsageMock,
    sessionState,
    settingsState,
    inputState,
    generationsState,
    blockTemplateState,
  };
});

vi.mock('@lib/api/blockTemplates', () => ({
  rollTemplate: testState.rollTemplateMock,
}));

vi.mock('@lib/api/errorHandling', () => ({
  extractErrorMessage: (err: unknown, fallback?: string) =>
    (err instanceof Error ? err.message : undefined) ?? fallback ?? 'Unknown error',
}));

vi.mock('@lib/utils/logging', () => ({
  logEvent: vi.fn(),
}));

vi.mock('@features/assets', () => ({
  extractFrame: vi.fn(),
  fromAssetResponse: vi.fn(),
  getAssetDisplayUrls: vi.fn(() => ({ thumbnailUrl: '', previewUrl: '', mainUrl: '' })),
  toSelectedAsset: vi.fn((asset: any) => ({ id: asset.id, source: 'gallery' })),
}));

vi.mock('@features/assets/lib/assetSetResolver', () => ({
  resolveAssetSet: vi.fn(),
  assetModelsToInputItems: vi.fn(),
}));

vi.mock('@features/assets/stores/assetSetStore', () => ({
  useAssetSetStore: {
    getState: () => ({
      getSet: vi.fn(),
    }),
  },
}));

vi.mock('@features/generation', () => {
  const useSessionStore = Object.assign(
    (selector: (state: any) => any) => selector(testState.sessionState),
    {
      getState: () => testState.sessionState,
    },
  );

  const useSettingsStore = Object.assign(
    (selector: (state: any) => any) => selector(testState.settingsState),
    {
      getState: () => testState.settingsState,
    },
  );

  const useInputStore = Object.assign(
    (selector: (state: any) => any) => selector(testState.inputState),
    {
      getState: () => testState.inputState,
    },
  );

  const useGenerationsStore = Object.assign(
    (selector: (state: any) => any) => selector(testState.generationsState),
    {
      getState: () => testState.generationsState,
    },
  );

  return {
    useGenerationScopeStores: () => ({
      useSessionStore,
      useSettingsStore,
      useInputStore,
    }),
    useGenerationsStore,
    createPendingGeneration: (input: any) => input,
  };
});

vi.mock('@features/generation/lib/api', () => ({
  generateAsset: testState.generateAssetMock,
}));

vi.mock('@features/prompts', () => ({
  useQuickGenerateBindings: vi.fn(() => ({
    dynamicParams: {},
    prompts: [],
    transitionDurations: [],
    lastSelectedAsset: null,
  })),
}));

vi.mock('@features/prompts/stores/blockTemplateStore', () => {
  const useBlockTemplateStore = Object.assign(
    (selector: (state: any) => any) => selector(testState.blockTemplateState),
    {
      getState: () => testState.blockTemplateState,
    },
  );

  return { useBlockTemplateStore };
});

vi.mock('@features/providers', () => ({
  providerCapabilityRegistry: {
    getProviderIdForModel: vi.fn(() => undefined),
    getOperationSpec: vi.fn(() => undefined),
  },
}));

vi.mock('@/types/operations', () => ({
  getFallbackOperation: vi.fn((operationType: string) => operationType),
}));

vi.mock('@/utils/prompt/limits', () => ({
  resolvePromptLimitForModel: vi.fn(() => undefined),
}));

vi.mock('../../lib/combinationStrategies', () => ({
  computeCombinations: vi.fn(() => []),
  computeSetCombinations: vi.fn(() => []),
  isSetStrategy: vi.fn(() => false),
}));

vi.mock('../../lib/quickGenerateLogic', () => ({
  buildGenerationRequest: testState.buildGenerationRequestMock,
}));

vi.mock('../../lib/runContext', () => ({
  createGenerationRunDescriptor: vi.fn(() => ({ id: 'run-1' })),
  createGenerationRunItemContext: vi.fn(() => ({ itemIndex: 0, itemTotal: 1 })),
}));

vi.mock('../../stores/generationHistoryStore', () => ({
  useGenerationHistoryStore: {
    getState: () => ({
      recordUsage: testState.recordUsageMock,
    }),
  },
}));

import { useQuickGenerateController } from '../useQuickGenerateController';

describe('useQuickGenerateController.generateWithAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    testState.sessionState.operationType = 'image_to_image';
    testState.sessionState.providerId = 'pixverse';
    testState.sessionState.generating = false;
    testState.sessionState.prompt = 'base prompt';

    testState.blockTemplateState.pinnedTemplateId = 'tpl-1';
    testState.blockTemplateState.templateRollMode = 'once';
    testState.blockTemplateState.draftCharacterBindings = {};

    testState.rollTemplateMock.mockResolvedValue({
      success: true,
      assembled_prompt: 'rolled template prompt',
    });

    testState.buildGenerationRequestMock.mockImplementation((ctx: any) => ({
      finalPrompt: ctx.prompt,
      params: {
        prompt: ctx.prompt,
        composition_assets: [{ asset: 'asset:123' }],
      },
    }));

    testState.generateAssetMock.mockResolvedValue({
      job_id: 42,
      status: 'pending',
    });
  });

  it('rolls pinned template in once mode for generateWithAsset and submits the rolled prompt', async () => {
    const { result } = renderHook(() => useQuickGenerateController());

    const asset = {
      id: 123,
      mediaType: 'image',
      providerUploads: {},
      lastUploadStatusByProvider: {},
    } as any;

    await act(async () => {
      await result.current.generateWithAsset(asset);
    });

    expect(testState.rollTemplateMock).toHaveBeenCalledTimes(1);
    expect(testState.rollTemplateMock).toHaveBeenCalledWith('tpl-1', {
      character_bindings: undefined,
    });

    expect(testState.buildGenerationRequestMock).toHaveBeenCalled();
    expect(testState.buildGenerationRequestMock.mock.calls[0][0]).toMatchObject({
      prompt: 'rolled template prompt',
    });

    expect(testState.generateAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'rolled template prompt',
      }),
    );
  });

  it('uses server template rolling in each mode for generateWithAsset (no client roll)', async () => {
    testState.blockTemplateState.templateRollMode = 'each';
    testState.blockTemplateState.draftCharacterBindings = {
      hero: { character_id: 'char-1' },
    } as any;

    const { result } = renderHook(() => useQuickGenerateController());

    const asset = {
      id: 123,
      mediaType: 'image',
      providerUploads: {},
      lastUploadStatusByProvider: {},
    } as any;

    await act(async () => {
      await result.current.generateWithAsset(asset);
    });

    expect(testState.rollTemplateMock).not.toHaveBeenCalled();

    expect(testState.buildGenerationRequestMock).toHaveBeenCalled();
    expect(testState.buildGenerationRequestMock.mock.calls[0][0]).toMatchObject({
      prompt: 'base prompt',
    });

    expect(testState.generateAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'base prompt',
        runContext: expect.objectContaining({
          block_template_id: 'tpl-1',
          character_bindings: {
            hero: { character_id: 'char-1' },
          },
        }),
      }),
    );
  });
});
