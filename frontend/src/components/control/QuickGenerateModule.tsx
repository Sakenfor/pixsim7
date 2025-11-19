import { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useControlCenterStore, type ControlCenterState } from '../../stores/controlCenterStore';
import { useAssetSelectionStore } from '../../stores/assetSelectionStore';
import { PromptInput } from '@pixsim7/ui';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useProviders } from '../../hooks/useProviders';
import { useProviderSpecs } from '../../hooks/useProviderSpecs';
import { generateAsset } from '../../lib/api/controlCenter';
import { DynamicParamForm, type ParamSpec } from './DynamicParamForm';
import { ArrayFieldInput } from './ArrayFieldInput';
import { useGenerationsStore, isGenerationTerminal } from '../../stores/generationsStore';
import { ccSelectors } from '../../stores/selectors';
import { logEvent } from '../../lib/logging';
import { GenerationPluginRenderer } from '../../lib/providers';
import { useGenerationWebSocket } from '../../hooks/useGenerationWebSocket';

export function QuickGenerateModule() {
  const navigate = useNavigate();

  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  // Use stable selectors to reduce re-renders
  const operationType = useControlCenterStore(ccSelectors.operationType);
  const providerId = useControlCenterStore(ccSelectors.providerId);
  const presetId = useControlCenterStore(ccSelectors.presetId);
  const presetParams = useControlCenterStore(ccSelectors.presetParams);
  const generating = useControlCenterStore(ccSelectors.generating);
  const recentPrompts = useControlCenterStore(ccSelectors.recentPrompts);

  const setProvider = useControlCenterStore(s => s.setProvider);
  const setOperationType = useControlCenterStore(s => s.setOperationType);
  const setGenerating = useControlCenterStore(s => s.setGenerating);
  const pushPrompt = useControlCenterStore(s => s.pushPrompt);

  // Active asset support
  const lastSelectedAsset = useAssetSelectionStore(s => s.lastSelectedAsset);

  const { providers } = useProviders();
  const { specs } = useProviderSpecs(providerId);

  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore(s => s.setWatchingGeneration);

  // Dynamic params from operation_specs
  const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});

  // Operation-specific array fields for video_transition
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);

  // Function to use active asset
  const useActiveAsset = () => {
    if (!lastSelectedAsset) return;

    // Auto-fill based on operation type and asset type
    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') {
      setDynamicParams(prev => ({ ...prev, image_url: lastSelectedAsset.url }));
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video') {
      setDynamicParams(prev => ({ ...prev, video_url: lastSelectedAsset.url }));
    }
  };

  // Auto-fill when active asset changes (if compatible with operation)
  useEffect(() => {
    if (!lastSelectedAsset) return;

    if (operationType === 'image_to_video' && lastSelectedAsset.type === 'image' && !dynamicParams.image_url) {
      setDynamicParams(prev => ({ ...prev, image_url: lastSelectedAsset.url }));
    } else if (operationType === 'video_extend' && lastSelectedAsset.type === 'video' && !dynamicParams.video_url) {
      setDynamicParams(prev => ({ ...prev, video_url: lastSelectedAsset.url }));
    }
  }, [lastSelectedAsset, operationType]);

  // Get parameter specs for current operation
  const paramSpecs = useMemo<ParamSpec[]>(() => {
    if (!specs?.operation_specs) return [];
    const opSpec = specs.operation_specs[operationType];
    if (!opSpec?.parameters) return [];

    // Filter out prompt and operation-specific array fields we handle separately
    return opSpec.parameters.filter((p: any) =>
      p.name !== 'prompt' &&
      p.name !== 'image_urls' &&
      p.name !== 'prompts'
    );
  }, [specs, operationType]);

  // Check if operation requires special array fields
  const needsArrayFields = operationType === 'video_transition';

  function handleDynamicParamChange(name: string, value: any) {
    setDynamicParams(prev => ({ ...prev, [name]: value }));
  }

  async function onGenerate() {
    const p = prompt.trim();

    // Validation
    if (operationType === 'text_to_video' && !p) {
      setError('Prompt is required for text-to-video');
      return;
    }

    if (operationType === 'image_to_video' && !dynamicParams.image_url) {
      setError('Image URL is required for image-to-video');
      return;
    }

    if (operationType === 'video_extend') {
      if (!dynamicParams.video_url && !dynamicParams.original_video_id) {
        setError('Either video URL or provider video ID is required');
        return;
      }
    }

    if (operationType === 'video_transition') {
      const validImages = imageUrls.filter(s => s.trim());
      const validPrompts = prompts.filter(s => s.trim());
      if (!validImages.length || !validPrompts.length) {
        setError('Both image URLs and prompts are required for video transition');
        return;
      }
      if (validImages.length !== validPrompts.length) {
        setError('Number of image URLs must match number of prompts');
        return;
      }
    }

    setError(null);
    if (p) pushPrompt(p);
    setGenerating(true);
    setGenerationId(null);

    try {
      // Build params - merge preset params, dynamic params, and operation-specific params
      const params: Record<string, any> = {
        prompt: p,
        ...presetParams,
        ...dynamicParams,
      };

      // Add array fields for video_transition
      if (operationType === 'video_transition') {
        params.image_urls = imageUrls.filter(s => s.trim());
        params.prompts = prompts.filter(s => s.trim());
      }

      const result = await generateAsset({
        prompt: p,
        providerId,
        presetId,
        operationType,
        extraParams: params,
        presetParams,
      });

      // Clear prompt and show generation ID
      setPrompt('');
      const genId = result.job_id;
      setGenerationId(genId);
      setWatchingGeneration(genId);

      // Seed store with initial generation status
      addOrUpdateGeneration({
        id: genId,
        user_id: 0, // unknown client-side until fetched
        workspace_id: null,
        operation_type: operationType,
        provider_id: providerId || 'pixverse',
        raw_params: params,
        canonical_params: params,
        inputs: [],
        reproducible_hash: null,
        prompt_version_id: null,
        final_prompt: p,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      logEvent('INFO', 'generation_created', {
        generationId: genId,
        operationType,
        providerId: providerId || 'pixverse',
        status: result.status || 'pending'
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to generate asset');
    } finally {
      setGenerating(false);
    }
  }

  function restorePrompt(p: string) {
    setPrompt(p);
  }

  const maxChars = resolvePromptLimit(providerId);
  const canGenerate = operationType === 'text_to_video'
    ? prompt.trim().length > 0
    : true; // Other operations may not strictly require prompt

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      {/* Active asset indicator */}
      {lastSelectedAsset && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-xs flex-shrink-0">
          <span className="font-medium text-blue-700 dark:text-blue-300">
            Active: {lastSelectedAsset.name} ({lastSelectedAsset.type})
          </span>
          <div className="flex-1" />
          {(operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
           (operationType === 'video_extend' && lastSelectedAsset.type === 'video') ? (
            <button
              onClick={useActiveAsset}
              className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              disabled={generating}
            >
              Use Asset
            </button>
          ) : null}
        </div>
      )}

      {/* Top controls */}
      <div className="flex gap-3 items-start flex-shrink-0">
        {/* Left column - Prompt and dynamic fields */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Operation selector */}
          <div className="flex gap-2 items-center">
            <label className="text-xs text-neutral-500 font-medium">Operation</label>
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value as ControlCenterState['operationType'])}
              disabled={generating}
              className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50"
            >
              <option value="text_to_video">Text to Video</option>
              <option value="image_to_video">Image to Video</option>
              <option value="video_extend">Video Extend</option>
              <option value="video_transition">Video Transition</option>
              <option value="fusion">Fusion</option>
            </select>
          </div>

          {/* Prompt input - canonical */}
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxChars={maxChars}
            disabled={generating}
            variant="compact"
            placeholder={`Describe what you want to generate (${operationType})…`}
          />

          {/* Array fields for video_transition */}
          {needsArrayFields && (
            <div className="grid grid-cols-2 gap-3">
              <ArrayFieldInput
                value={imageUrls}
                onChange={setImageUrls}
                placeholder="Image URL"
                label="Image URLs"
                disabled={generating}
                minItems={2}
              />
              <ArrayFieldInput
                value={prompts}
                onChange={setPrompts}
                placeholder="Prompt"
                label="Prompts"
                disabled={generating}
                minItems={2}
              />
            </div>
          )}

          {/* Dynamic parameter form based on operation_specs */}
          {paramSpecs.length > 0 && (
            <div className="border-t pt-3">
              <DynamicParamForm
                specs={paramSpecs}
                values={dynamicParams}
                onChange={handleDynamicParamChange}
                disabled={generating}
                operationType={operationType}
              />
            </div>
          )}

          {/* Provider-specific plugin UI */}
          {providerId && (
            <GenerationPluginRenderer
              providerId={providerId}
              operationType={operationType}
              values={dynamicParams}
              onChange={handleDynamicParamChange}
              disabled={generating}
            />
          )}

          {/* Error display */}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}

          {/* Generation status indicator */}
          {generationId && (
            <GenerationStatusDisplay generationId={generationId} />
          )}
        </div>

        {/* Right column - Provider and controls */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3">
          <div>
            <label className="text-xs text-neutral-500 font-medium block mb-1">Provider</label>
            <select
              value={providerId ?? ''}
              onChange={(e) => setProvider(e.target.value || undefined)}
              disabled={generating}
              className="w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
            >
              <option value="">Auto</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Active preset display */}
          {presetId && (
            <div className="text-xs p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
              <div className="font-medium text-blue-700 dark:text-blue-300">Preset: {presetId}</div>
              {Object.keys(presetParams).length > 0 && (
                <div className="mt-1 text-neutral-600 dark:text-neutral-400">
                  {Object.entries(presetParams).map(([k, v]) => (
                    <div key={k}>{k}: {String(v)}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onGenerate}
            disabled={generating || !canGenerate}
            className={clsx(
              'py-2.5 px-4 rounded text-sm font-medium text-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !canGenerate
                ? 'bg-neutral-400'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div className="border-t pt-3 flex-shrink-0">
          <div className="text-xs text-neutral-500 font-medium mb-2">Recent prompts:</div>
          <div className="flex gap-1 flex-wrap">
            {recentPrompts.slice(0, 5).map((p, i) => (
              <button
                key={i}
                onClick={() => restorePrompt(p)}
                disabled={generating}
                className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 truncate max-w-xs disabled:opacity-50"
                title={p}
              >
                {p.length > 50 ? `${p.slice(0, 50)}…` : p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="border-t pt-3 flex-shrink-0">
        <div className="text-xs text-neutral-500 font-medium mb-2">Quick shortcuts:</div>
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => navigate('/assets')}
            className="flex flex-col items-center gap-1 p-2 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-xs"
          >
            <span>🖼️</span>
            <span>Gallery</span>
          </button>
          <button
            onClick={() => navigate('/workspace')}
            className="flex flex-col items-center gap-1 p-2 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-xs"
          >
            <span>🎨</span>
            <span>Workspace</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex flex-col items-center gap-1 p-2 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-xs"
          >
            <span>🏠</span>
            <span>Home</span>
          </button>
          <button
            onClick={() => navigate('/graph/1')}
            className="flex flex-col items-center gap-1 p-2 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-xs"
          >
            <span>🕸️</span>
            <span>Graph</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Simple inline generation status display with WebSocket updates and retry support
 * Replaces the deleted JobStatusIndicator
 */
function GenerationStatusDisplay({ generationId }: { generationId: number }) {
  const generation = useGenerationsStore(s => s.generations.get(generationId));
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const [retrying, setRetrying] = useState(false);

  // Fallback polling if WebSocket disconnects (backup only)
  useEffect(() => {
    if (!generationId) return;

    // Check if generation is in terminal state
    if (generation && isGenerationTerminal(generation.status)) {
      return;
    }

    // Poll every 5 seconds as backup (WebSocket is primary)
    const interval = setInterval(async () => {
      try {
        const { getGeneration } = await import('../../lib/api/generations');
        const updated = await getGeneration(generationId);
        addOrUpdateGeneration(updated);

        if (isGenerationTerminal(updated.status)) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error(`Failed to poll generation ${generationId}:`, err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [generationId, generation?.status, addOrUpdateGeneration]);

  async function handleRetry() {
    if (!generation || retrying) return;

    setRetrying(true);
    try {
      const { retryGeneration } = await import('../../lib/api/generations');
      const newGeneration = await retryGeneration(generationId);

      // Update store with new generation
      addOrUpdateGeneration(newGeneration);

      // Switch display to new generation after 1 second
      setTimeout(() => {
        // The parent component should ideally track the new generation ID
        // For now, just show success message
        logEvent('INFO', 'generation_retried', {
          originalId: generationId,
          newId: newGeneration.id,
        });
      }, 1000);
    } catch (err: any) {
      console.error(`Failed to retry generation ${generationId}:`, err);
      alert(err.response?.data?.detail || 'Failed to retry generation');
    } finally {
      setRetrying(false);
    }
  }

  if (!generation) {
    return (
      <div className="text-xs p-2 bg-neutral-100 dark:bg-neutral-800 rounded">
        Generation #{generationId} (loading...)
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    processing: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    failed: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    cancelled: 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300',
  };

  const statusColor = statusColors[generation.status] || statusColors.pending;
  const canRetry = generation.status === 'failed' && generation.retry_count < 3;

  return (
    <div className={`text-xs p-2 border rounded ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium">Generation #{generationId}</div>
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Retry this generation (useful for content filter rejections)"
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      <div className="mt-1">Status: {generation.status}</div>
      {generation.retry_count > 0 && (
        <div className="mt-1 text-xs opacity-75">
          Retry attempt: {generation.retry_count}/3
        </div>
      )}
      {generation.error_message && (
        <div className="mt-1 text-red-600 dark:text-red-400">
          Error: {generation.error_message}
        </div>
      )}
      {generation.asset_id && (
        <div className="mt-1">Asset ID: {generation.asset_id}</div>
      )}
    </div>
  );
}
