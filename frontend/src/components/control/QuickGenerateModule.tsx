import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useControlCenterStore } from '../../stores/controlCenterStore';
import { PromptInput } from '@pixsim7/ui';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useProviders } from '../../hooks/useProviders';
import { useProviderSpecs } from '../../hooks/useProviderSpecs';
import { generateAsset } from '../../lib/api/controlCenter';
import { DynamicParamForm, type ParamSpec } from './DynamicParamForm';
import { ArrayFieldInput } from './ArrayFieldInput';
import { useJobsStore } from '../../stores/jobsStore';
import { JobStatusIndicator } from './JobStatusIndicator';
import { ccSelectors } from '../../stores/selectors';

export function QuickGenerateModule() {
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

  const { providers } = useProviders();
  const { specs } = useProviderSpecs(providerId);

  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const setLastCreatedJob = useJobsStore(s => s.setLastCreatedJob);
  const addOrUpdateJob = useJobsStore(s => s.addOrUpdateJob);

  // Dynamic params from operation_specs
  const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});

  // Operation-specific array fields for video_transition
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);

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
    setJobId(null);

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

      // Clear prompt and show job ID
      setPrompt('');
      setJobId(result.job_id);
      setLastCreatedJob(result.job_id);

      // Seed store with initial job status (queued/pending)
      // Pass originalParams for retry capability
      addOrUpdateJob({
        id: result.job_id,
        user_id: 0, // unknown client-side until fetched
        workspace_id: null,
        operation_type: operationType,
        provider_id: providerId || 'pixverse',
        params: params,
        status: result.status,
        error_message: null,
        retry_count: 0,
        priority: 0,
        parent_job_id: null,
        scheduled_at: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      } as any, params); // Pass params as originalParams

      // eslint-disable-next-line no-console
      console.log('Generation job created:', result);
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
      {/* Top controls */}
      <div className="flex gap-3 items-start flex-shrink-0">
        {/* Left column - Prompt and dynamic fields */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Operation selector */}
          <div className="flex gap-2 items-center">
            <label className="text-xs text-neutral-500 font-medium">Operation</label>
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value as any)}
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

          {/* Error display */}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}

          {/* Job status indicator */}
          {jobId && (
            <div>
              <JobStatusIndicator jobId={jobId} />
            </div>
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
    </div>
  );
}
