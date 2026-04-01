 
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
  const syncOperationMock = vi.fn();

  const sessionState = {
    operationType: 'image_to_image',
    providerId: 'pixverse',
    generating: false,
    prompt: 'base prompt',
    uiState: {} as Record<string, unknown>,
    setProvider: vi.fn(),
    setOperationType: vi.fn(),
    setGenerating: setGeneratingMock,
    setPrompt: vi.fn(),
    setUiState: vi.fn(),
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
  controlValues: {},
  syncOperation: syncOperationMock,
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
  assetEvents: {
    subscribeToUpdates: vi.fn(() => ({ unsubscribe: () => {} })),
  },
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

vi.mock('@/types/operations', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getFallbackOperation: vi.fn((operationType: string) => operationType),
  };
});

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
  PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY: 'prompt_tool_run_context_patch',
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

describe('useQuickGenerateController.generate with assetOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    testState.sessionState.operationType = 'image_to_image';
    testState.sessionState.providerId = 'pixverse';
    testState.sessionState.generating = false;
    testState.sessionState.prompt = 'base prompt';
    testState.sessionState.uiState = {};

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

  it('rolls pinned template in once mode for generate with assetOverrides and submits the rolled prompt', async () => {
    const { result } = renderHook(() => useQuickGenerateController());

    const asset = {
      id: 123,
      mediaType: 'image',
      providerUploads: {},
      lastUploadStatusByProvider: {},
    } as any;

    await act(async () => {
      await result.current.generate({ assetOverrides: [asset] });
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

  it('uses server template rolling in each mode for generate with assetOverrides (no client roll)', async () => {
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
      await result.current.generate({ assetOverrides: [asset] });
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

  it('merges prompt-tool run context patch into generation runContext', async () => {
    testState.blockTemplateState.templateRollMode = 'each';
    testState.sessionState.uiState = {
      prompt_tool_run_context_patch: {
        guidance_patch: {
          reference_merge: {
            asset_count: 2,
          },
        },
        composition_assets_patch: [
          { asset_id: 123, operation: 'reference_merge' },
        ],
      },
    };

    const { result } = renderHook(() => useQuickGenerateController());

    const asset = {
      id: 123,
      mediaType: 'image',
      providerUploads: {},
      lastUploadStatusByProvider: {},
    } as any;

    await act(async () => {
      await result.current.generate({ assetOverrides: [asset] });
    });

    expect(testState.generateAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runContext: expect.objectContaining({
          block_template_id: 'tpl-1',
          guidance_patch: {
            reference_merge: {
              asset_count: 2,
            },
          },
          composition_assets_patch: [
            { asset_id: 123, operation: 'reference_merge' },
          ],
        }),
      }),
    );
  });

  it('updates tracked generationId for direct executeGeneration calls', async () => {
    const { result } = renderHook(() => useQuickGenerateController());

    const asset = {
      id: 123,
      mediaType: 'image',
      providerUploads: {},
      lastUploadStatusByProvider: {},
    } as any;

    expect(result.current.generationId).toBeNull();

    await act(async () => {
      const response = await result.current.executeGeneration({ assetOverrides: [asset] });
      expect(response.generationIds).toEqual([42]);
    });

    expect(result.current.generationId).toBe(42);
    expect(testState.setWatchingGenerationMock).toHaveBeenCalledWith(42);
  });
});
