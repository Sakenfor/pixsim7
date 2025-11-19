import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';
import type {
  GenerationNodeConfig,
  GenerationStrategy,
  StyleRules,
  DurationRule,
  ConstraintSet,
  FallbackConfig,
  GenerateContentRequest,
  GenerateContentResponse,
  SceneRef,
} from '@pixsim7/types';
import { useToast } from '@pixsim7/ui';
import { useGraphStore } from '../../stores/graphStore';

interface GenerationNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function GenerationNodeEditor({ node, onUpdate }: GenerationNodeEditorProps) {
  const toast = useToast();
  const getCurrentScene = useGraphStore((s) => s.getCurrentScene);

  // Default values based on GenerationNodeConfig
  const [generationType, setGenerationType] = useState<'transition' | 'variation' | 'dialogue' | 'environment'>('transition');
  const [purpose, setPurpose] = useState<'gap_fill' | 'variation' | 'adaptive' | 'ambient'>('gap_fill');
  const [strategy, setStrategy] = useState<GenerationStrategy>('once');
  const [seedSource, setSeedSource] = useState<'playthrough' | 'player' | 'timestamp' | 'fixed' | ''>('');
  const [enabled, setEnabled] = useState(true);
  const [templateId, setTemplateId] = useState('');

  // Style rules
  const [moodFrom, setMoodFrom] = useState('');
  const [moodTo, setMoodTo] = useState('');
  const [pacing, setPacing] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [transitionType, setTransitionType] = useState<'gradual' | 'abrupt'>('gradual');

  // Duration rules
  const [durationMin, setDurationMin] = useState('');
  const [durationMax, setDurationMax] = useState('');
  const [durationTarget, setDurationTarget] = useState('');

  // Constraints
  const [rating, setRating] = useState<'G' | 'PG' | 'PG-13' | 'R' | ''>('');
  const [requiredElements, setRequiredElements] = useState('');
  const [avoidElements, setAvoidElements] = useState('');
  const [contentRules, setContentRules] = useState('');

  // Fallback config
  const [fallbackMode, setFallbackMode] = useState<'default_content' | 'skip' | 'retry' | 'placeholder'>('placeholder');
  const [defaultContentId, setDefaultContentId] = useState('');
  const [maxRetries, setMaxRetries] = useState('3');
  const [timeoutMs, setTimeoutMs] = useState('30000');

  // Test generation state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<GenerateContentResponse | null>(null);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load node data
  useEffect(() => {
    const config = (node.metadata as any)?.config as GenerationNodeConfig | undefined;
    if (!config) return;

    setGenerationType(config.generationType);
    setPurpose(config.purpose);
    setStrategy(config.strategy);
    setSeedSource(config.seedSource || '');
    setEnabled(config.enabled);
    setTemplateId(config.templateId || '');

    // Style
    if (config.style) {
      setMoodFrom(config.style.moodFrom || '');
      setMoodTo(config.style.moodTo || '');
      setPacing(config.style.pacing || 'medium');
      setTransitionType(config.style.transitionType || 'gradual');
    }

    // Duration
    if (config.duration) {
      setDurationMin(config.duration.min?.toString() || '');
      setDurationMax(config.duration.max?.toString() || '');
      setDurationTarget(config.duration.target?.toString() || '');
    }

    // Constraints
    if (config.constraints) {
      setRating(config.constraints.rating || '');
      setRequiredElements(config.constraints.requiredElements?.join(', ') || '');
      setAvoidElements(config.constraints.avoidElements?.join(', ') || '');
      setContentRules(config.constraints.contentRules?.join('\n') || '');
    }

    // Fallback
    if (config.fallback) {
      setFallbackMode(config.fallback.mode);
      setDefaultContentId(config.fallback.defaultContentId || '');
      setMaxRetries(config.fallback.maxRetries?.toString() || '3');
      setTimeoutMs(config.fallback.timeoutMs?.toString() || '30000');
    }
  }, [node]);

  // Validate configuration
  function validateConfig(): string[] {
    const errors: string[] = [];

    // Validate duration ranges
    const minDur = durationMin ? parseFloat(durationMin) : undefined;
    const maxDur = durationMax ? parseFloat(durationMax) : undefined;
    const targetDur = durationTarget ? parseFloat(durationTarget) : undefined;

    if (minDur !== undefined && maxDur !== undefined && minDur > maxDur) {
      errors.push('Duration min cannot be greater than max');
    }

    if (targetDur !== undefined && minDur !== undefined && targetDur < minDur) {
      errors.push('Duration target cannot be less than min');
    }

    if (targetDur !== undefined && maxDur !== undefined && targetDur > maxDur) {
      errors.push('Duration target cannot be greater than max');
    }

    // Validate duration values are positive
    if (minDur !== undefined && minDur < 0) {
      errors.push('Duration min must be positive');
    }
    if (maxDur !== undefined && maxDur < 0) {
      errors.push('Duration max must be positive');
    }
    if (targetDur !== undefined && targetDur < 0) {
      errors.push('Duration target must be positive');
    }

    // Validate requiredElements vs avoidElements
    const required = requiredElements
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const avoid = avoidElements
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    const intersection = required.filter((e) => avoid.includes(e));
    if (intersection.length > 0) {
      errors.push(`Elements cannot be both required and avoided: ${intersection.join(', ')}`);
    }

    // Validate fallback completeness
    if (fallbackMode === 'default_content' && !defaultContentId.trim()) {
      errors.push('Default content ID is required when fallback mode is "default_content"');
    }

    if (fallbackMode === 'retry') {
      const retries = maxRetries ? parseInt(maxRetries) : undefined;
      if (retries === undefined || retries < 1) {
        errors.push('Max retries must be at least 1 when fallback mode is "retry"');
      }
    }

    const timeout = timeoutMs ? parseInt(timeoutMs) : undefined;
    if (timeout !== undefined && timeout < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    return errors;
  }

  function buildConfig(): GenerationNodeConfig {
    const style: StyleRules = {
      moodFrom: moodFrom || undefined,
      moodTo: moodTo || undefined,
      pacing,
      transitionType,
    };

    const duration: DurationRule = {
      min: durationMin ? parseFloat(durationMin) : undefined,
      max: durationMax ? parseFloat(durationMax) : undefined,
      target: durationTarget ? parseFloat(durationTarget) : undefined,
    };

    const constraints: ConstraintSet = {
      rating: rating || undefined,
      requiredElements: requiredElements
        ? requiredElements.split(',').map((e) => e.trim()).filter(Boolean)
        : undefined,
      avoidElements: avoidElements
        ? avoidElements.split(',').map((e) => e.trim()).filter(Boolean)
        : undefined,
      contentRules: contentRules
        ? contentRules.split('\n').map((r) => r.trim()).filter(Boolean)
        : undefined,
    };

    const fallback: FallbackConfig = {
      mode: fallbackMode,
      defaultContentId: defaultContentId || undefined,
      maxRetries: maxRetries ? parseInt(maxRetries) : undefined,
      timeoutMs: timeoutMs ? parseInt(timeoutMs) : undefined,
    };

    return {
      generationType,
      purpose,
      style,
      duration,
      constraints,
      strategy,
      seedSource: seedSource || undefined,
      fallback,
      templateId: templateId || undefined,
      enabled,
      version: 1,
    };
  }

  function handleApply() {
    // Validate first
    const errors = validateConfig();
    setValidationErrors(errors);

    if (errors.length > 0) {
      toast.error(`Validation failed: ${errors[0]}`);
      return;
    }

    const config = buildConfig();

    onUpdate({
      metadata: {
        ...node.metadata,
        config,
      },
    });

    toast.success('Generation node configuration updated');
  }

  async function handleTestGeneration() {
    // Validate first
    const errors = validateConfig();
    setValidationErrors(errors);

    if (errors.length > 0) {
      toast.error(`Cannot test: ${errors[0]}`);
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const config = buildConfig();

      // Build SceneRefs from current scene
      const currentScene = getCurrentScene();
      const fromScene: SceneRef | undefined = currentScene
        ? {
            id: currentScene.id,
            mood: (currentScene.metadata as any)?.mood,
            summary: (currentScene.metadata as any)?.summary,
            location: (currentScene.metadata as any)?.location,
          }
        : undefined;

      // Build job request for existing jobs API
      // Use video_transition operation type as it's closest to content generation
      const jobRequest = {
        operation_type: 'video_transition',
        provider_id: 'pixverse',
        params: {
          // Store generation config in params
          generation_type: config.generationType,
          from_scene: fromScene,
          style: config.style,
          duration: config.duration,
          constraints: config.constraints,
          strategy: config.strategy,
          fallback: config.fallback,
          template_id: config.templateId,
        },
        priority: 5, // Medium priority for test generations
      };

      // Call existing jobs API
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobRequest),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const jobResponse = await response.json();

      // Map JobResponse to GenerateContentResponse for compatibility
      const result: GenerateContentResponse = {
        status: jobResponse.status === 'completed' ? 'complete' :
                jobResponse.status === 'processing' || jobResponse.status === 'queued' ? 'processing' :
                jobResponse.status === 'failed' ? 'failed' : 'queued',
        job_id: jobResponse.id.toString(),
        error: jobResponse.error_message ? {
          code: 'JOB_ERROR',
          message: jobResponse.error_message,
        } : undefined,
        // Content will be populated when job completes
        content: undefined,
      };

      setTestResult(result);
      toast.success(`Test generation job created (ID: ${jobResponse.id}). Check jobs list for status.`);
    } catch (error) {
      toast.error(`Test generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTestResult({
        status: 'failed',
        error: {
          code: 'TEST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            Validation Errors:
          </div>
          <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside">
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Basic Configuration */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Basic Configuration
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Generation Type</label>
          <select
            value={generationType}
            onChange={(e) => setGenerationType(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="transition">Transition</option>
            <option value="variation">Variation</option>
            <option value="dialogue">Dialogue</option>
            <option value="environment">Environment</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Purpose</label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="gap_fill">Gap Fill</option>
            <option value="variation">Variation</option>
            <option value="adaptive">Adaptive</option>
            <option value="ambient">Ambient</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Strategy</label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="once">Once</option>
            <option value="per_playthrough">Per Playthrough</option>
            <option value="per_player">Per Player</option>
            <option value="always">Always</option>
          </select>
          <p className="text-xs text-neutral-500 mt-1">
            Determines when content is regenerated
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Seed Source (optional)</label>
          <select
            value={seedSource}
            onChange={(e) => setSeedSource(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="">None</option>
            <option value="playthrough">Playthrough</option>
            <option value="player">Player</option>
            <option value="timestamp">Timestamp</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Template ID (optional)</label>
          <input
            type="text"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="template-123"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="enabled" className="text-sm font-medium">
            Enabled
          </label>
        </div>
      </div>

      {/* Style Rules */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Style Rules
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Mood From</label>
            <input
              type="text"
              value={moodFrom}
              onChange={(e) => setMoodFrom(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="tense"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Mood To</label>
            <input
              type="text"
              value={moodTo}
              onChange={(e) => setMoodTo(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="calm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Pacing</label>
            <select
              value={pacing}
              onChange={(e) => setPacing(e.target.value as any)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="slow">Slow</option>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Transition Type</label>
            <select
              value={transitionType}
              onChange={(e) => setTransitionType(e.target.value as any)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="gradual">Gradual</option>
              <option value="abrupt">Abrupt</option>
            </select>
          </div>
        </div>
      </div>

      {/* Duration Rules */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Duration Rules (seconds)
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Min</label>
            <input
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="5"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Max</label>
            <input
              type="number"
              value={durationMax}
              onChange={(e) => setDurationMax(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="30"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Target</label>
            <input
              type="number"
              value={durationTarget}
              onChange={(e) => setDurationTarget(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="15"
              min="0"
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* Constraints */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Constraints
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Content Rating</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value as any)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="">None</option>
            <option value="G">G</option>
            <option value="PG">PG</option>
            <option value="PG-13">PG-13</option>
            <option value="R">R</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Required Elements (comma-separated)</label>
          <input
            type="text"
            value={requiredElements}
            onChange={(e) => setRequiredElements(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="character_A, location_cafe"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Avoid Elements (comma-separated)</label>
          <input
            type="text"
            value={avoidElements}
            onChange={(e) => setAvoidElements(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="violence, profanity"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Content Rules (one per line)</label>
          <textarea
            value={contentRules}
            onChange={(e) => setContentRules(e.target.value)}
            rows={3}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="No sudden scene changes&#10;Maintain consistent lighting&#10;..."
          />
        </div>
      </div>

      {/* Fallback Configuration */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Fallback Configuration
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Fallback Mode</label>
          <select
            value={fallbackMode}
            onChange={(e) => setFallbackMode(e.target.value as any)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="default_content">Default Content</option>
            <option value="skip">Skip</option>
            <option value="retry">Retry</option>
            <option value="placeholder">Placeholder</option>
          </select>
        </div>

        {fallbackMode === 'default_content' && (
          <div>
            <label className="block text-xs font-medium mb-1">Default Content ID</label>
            <input
              type="text"
              value={defaultContentId}
              onChange={(e) => setDefaultContentId(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="fallback-video-123"
            />
          </div>
        )}

        {fallbackMode === 'retry' && (
          <div>
            <label className="block text-xs font-medium mb-1">Max Retries</label>
            <input
              type="number"
              value={maxRetries}
              onChange={(e) => setMaxRetries(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              min="1"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1">Timeout (ms)</label>
          <input
            type="number"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            min="1000"
            step="1000"
          />
        </div>
      </div>

      {/* Test Generation */}
      <div className="border-t pt-3 dark:border-neutral-700 space-y-3">
        <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Test Generation
        </div>

        <Button
          variant="secondary"
          onClick={handleTestGeneration}
          disabled={isTesting}
          className="w-full"
        >
          {isTesting ? 'Testing...' : '🧪 Test Generation'}
        </Button>

        {testResult && (
          <div className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
            <div className="text-xs font-semibold mb-2">
              Status: <span className={`px-2 py-0.5 rounded ${
                testResult.status === 'complete' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                testResult.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
              }`}>
                {testResult.status}
              </span>
            </div>

            {testResult.error && (
              <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                Error: {testResult.error.message}
              </div>
            )}

            {testResult.content && (
              <div className="space-y-2">
                <div className="text-xs">
                  <strong>Type:</strong> {testResult.content.type}
                </div>
                {testResult.content.url && (
                  <div className="text-xs">
                    <strong>URL:</strong>{' '}
                    <a
                      href={testResult.content.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 underline"
                    >
                      {testResult.content.url}
                    </a>
                  </div>
                )}
                {testResult.content.duration && (
                  <div className="text-xs">
                    <strong>Duration:</strong> {testResult.content.duration}s
                  </div>
                )}
                {testResult.content.dialogue && testResult.content.dialogue.length > 0 && (
                  <div className="text-xs">
                    <strong>Dialogue:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {testResult.content.dialogue.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {testResult.content.choices && testResult.content.choices.length > 0 && (
                  <div className="text-xs">
                    <strong>Choices:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {testResult.content.choices.map((choice, i) => (
                        <li key={i}>{choice.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {testResult.cost && (
              <div className="text-xs text-neutral-500 mt-2">
                Cost: {testResult.cost.tokens || 'N/A'} tokens, {testResult.cost.time_ms || 'N/A'}ms
              </div>
            )}

            {testResult.job_id && (
              <div className="text-xs text-neutral-500">
                Job ID: <code className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">{testResult.job_id}</code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Apply Button */}
      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}
