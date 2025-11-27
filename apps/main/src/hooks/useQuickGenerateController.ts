import { useState } from 'react';
import { useControlCenterStore } from '../stores/controlCenterStore';
import { useGenerationsStore } from '../stores/generationsStore';
import { ccSelectors } from '../stores/selectors';
import { generateAsset } from '../lib/api/controlCenter';
import { logEvent } from '../lib/logging';
import { buildGenerationRequest } from '../lib/control/quickGenerateLogic';
import { useQuickGenerateBindings } from './useQuickGenerateBindings';

/**
 * Hook: useQuickGenerateController
 *
 * Orchestrates QuickGenerateModule behavior:
 * - Reads/writes Control Center store state.
 * - Binds to queues and active asset via useQuickGenerateBindings.
 * - Runs validation + parameter construction via buildGenerationRequest.
 * - Calls the generation API and seeds generationsStore.
 *
 * This keeps QuickGenerateModule focused on rendering/layout.
 */
export function useQuickGenerateController() {
  // Control Center core state
  const operationType = useControlCenterStore(ccSelectors.operationType);
  const providerId = useControlCenterStore(ccSelectors.providerId);
  const presetId = useControlCenterStore(ccSelectors.presetId);
  const presetParams = useControlCenterStore(ccSelectors.presetParams);
  const generating = useControlCenterStore(ccSelectors.generating);
  const recentPrompts = useControlCenterStore(ccSelectors.recentPrompts);

  const setProvider = useControlCenterStore(s => s.setProvider);
  const setOperationType = useControlCenterStore(s => s.setOperationType);
  const setGenerating = useControlCenterStore(s => s.setGenerating);
  const prompt = useControlCenterStore(s => s.prompt);
  const setPrompt = useControlCenterStore(s => s.setPrompt);
  const pushPrompt = useControlCenterStore(s => s.pushPrompt);

  // Bindings to active asset and queues
  const bindings = useQuickGenerateBindings(operationType, setOperationType);

  // Local error + generation status
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore(s => s.setWatchingGeneration);

  async function generate() {
    const buildResult = buildGenerationRequest({
      operationType,
      prompt,
      presetParams,
      dynamicParams: bindings.dynamicParams,
      imageUrls: bindings.imageUrls,
      prompts: bindings.prompts,
      activeAsset: bindings.lastSelectedAsset,
      mainQueueFirst: bindings.mainQueue[0],
    });

    if (buildResult.error || !buildResult.params) {
      setError(buildResult.error ?? 'Invalid generation request');
      return;
    }

    const finalPrompt = buildResult.finalPrompt;

    setError(null);
    if (finalPrompt) {
      pushPrompt(finalPrompt);
    }
    setGenerating(true);
    setGenerationId(null);

    try {
      const result = await generateAsset({
        prompt: finalPrompt,
        providerId,
        presetId,
        operationType,
        extraParams: buildResult.params,
        presetParams,
      });

      // Clear prompt and show generation ID
      setPrompt('');
      const genId = result.job_id;
      setGenerationId(genId);
      setWatchingGeneration(genId);

      // Seed store with initial generation status
      const now = new Date().toISOString();
      addOrUpdateGeneration({
        id: genId,
        user_id: 0, // unknown client-side until fetched
        workspace_id: null,
        operation_type: operationType,
        provider_id: providerId || 'pixverse',
        raw_params: buildResult.params,
        canonical_params: buildResult.params,
        inputs: [],
        reproducible_hash: null,
        prompt_version_id: null,
        final_prompt: finalPrompt,
        prompt_config: null,
        prompt_source_type: 'inline',
        status: result.status || 'pending',
        priority: 5,
        scheduled_at: null,
        started_at: null,
        completed_at: null,
        error_message: null,
        retry_count: 0,
        parent_generation_id: null,
        asset_id: null,
        name: null,
        description: null,
        created_at: now,
        updated_at: now,
      });

      logEvent('INFO', 'generation_created', {
        generationId: genId,
        operationType,
        providerId: providerId || 'pixverse',
        status: result.status || 'pending',
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to generate asset');
    } finally {
      setGenerating(false);
    }
  }

  return {
    // Core control center state
    operationType,
    providerId,
    presetId,
    presetParams,
    generating,
    recentPrompts,
    prompt,

    // Mutators
    setProvider,
    setOperationType,
    setPrompt,

    // Error + generation ID
    error,
    generationId,

    // Bindings to assets/queues and params
    ...bindings,

    // Actions
    generate,
  };
}

