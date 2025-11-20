import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';
import type { DraftSceneNode } from '../../modules/scene-builder';
import type {
  GenerationNodeConfig,
  GenerationStrategy,
  StyleRules,
  DurationRule,
  ConstraintSet,
  FallbackConfig,
  SceneRef,
  GenerationValidationResult,
} from '@pixsim7/shared.types';
import { useToast } from '@pixsim7/shared.ui';
import { useGraphStore } from '../../stores/graphStore';
import {
  validateGenerationNode,
  getValidationStatus,
  getValidationSummary,
  type ValidationStatus,
} from '@pixsim7/game-core/generation/validator';
import { createGeneration, type GenerationResponse } from '../../lib/api/generations';

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
  const [testResult, setTestResult] = useState<GenerationResponse | null>(null);

  // Validation state
  const [validationResult, setValidationResult] = useState<GenerationValidationResult>({
    errors: [],
    warnings: [],
    suggestions: [],
  });
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('ok');
  const [showValidation, setShowValidation] = useState(false);

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

  // Run validation whenever configuration changes
  useEffect(() => {
    const config = buildConfig();
    const result = validateGenerationNode(config, {
      // TODO: Pass actual world and user prefs when available
      world: undefined,
      userPrefs: undefined,
    });

    setValidationResult(result);
    setValidationStatus(getValidationStatus(result));

    // Auto-expand validation panel if there are errors
    if (result.errors.length > 0) {
      setShowValidation(true);
    }
  }, [
    generationType,
    purpose,
    strategy,
    seedSource,
    enabled,
    templateId,
    moodFrom,
    moodTo,
    pacing,
    transitionType,
    durationMin,
    durationMax,
    durationTarget,
    rating,
    requiredElements,
    avoidElements,
    contentRules,
    fallbackMode,
    defaultContentId,
    maxRetries,
    timeoutMs,
  ]);

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
    // Check validation
    if (validationResult.errors.length > 0) {
      toast.error(`Validation failed: ${validationResult.errors[0]}`);
      setShowValidation(true);
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
    // Check validation
    if (validationResult.errors.length > 0) {
      toast.error(`Cannot test: ${validationResult.errors[0]}`);
      setShowValidation(true);
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

      // Use canonical generations API
      const result = await createGeneration({
        config,
        provider_id: 'pixverse',
        from_scene: fromScene,
        to_scene: undefined,
        name: `Test: ${config.generationType}`,
        description: 'Test generation from editor',
        priority: 5, // Medium priority for test generations
      });

      setTestResult(result);
      toast.success(
        `Test generation created (ID: ${result.id}). ` +
        `Status: ${result.status}. Check generations list for updates.`
      );
    } catch (error) {
      toast.error(`Test generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Create a minimal error result for display
      setTestResult(null);
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Validation Status Badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-semibold ${
              validationStatus === 'error'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : validationStatus === 'warning'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            }`}
          >
            {validationStatus === 'error' && '❌ Has Errors'}
            {validationStatus === 'warning' && '⚠️ Has Warnings'}
            {validationStatus === 'ok' && '✅ Valid'}
          </span>
          <span className="text-xs text-neutral-500">
            {getValidationSummary(validationResult)}
          </span>
        </div>
        <button
          onClick={() => setShowValidation(!showValidation)}
          className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          {showValidation ? '▼ Hide Details' : '▶ Show Details'}
        </button>
      </div>

      {/* Validation Details Panel */}
      {showValidation && (
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded space-y-3">
          {/* Errors */}
          {validationResult.errors.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1.5">
                ❌ Errors ({validationResult.errors.length})
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {validationResult.errors.map((error, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-0.5">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {validationResult.warnings.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1.5">
                ⚠️ Warnings ({validationResult.warnings.length})
              </div>
              <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                {validationResult.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-0.5">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {validationResult.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">
                💡 Suggestions ({validationResult.suggestions.length})
              </div>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                {validationResult.suggestions.map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-0.5">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* All clear message */}
          {validationResult.errors.length === 0 &&
            validationResult.warnings.length === 0 &&
            validationResult.suggestions.length === 0 && (
              <div className="text-xs text-green-600 dark:text-green-400 text-center py-2">
                ✅ All validation checks passed
              </div>
            )}
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
                testResult.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                testResult.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
              }`}>
                {testResult.status}
              </span>
            </div>

            <div className="space-y-2">
              <div className="text-xs">
                <strong>Generation ID:</strong>{' '}
                <code className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">
                  {testResult.id}
                </code>
              </div>

              <div className="text-xs">
                <strong>Provider:</strong> {testResult.provider_id}
              </div>

              <div className="text-xs">
                <strong>Operation:</strong> {testResult.operation_type}
              </div>

              {testResult.error_message && (
                <div className="text-xs text-red-600 dark:text-red-400">
                  <strong>Error:</strong> {testResult.error_message}
                </div>
              )}

              {testResult.asset_id && (
                <div className="text-xs text-green-600 dark:text-green-400">
                  <strong>Asset ID:</strong> {testResult.asset_id}
                </div>
              )}

              <div className="text-xs text-neutral-500">
                <strong>Created:</strong> {new Date(testResult.created_at).toLocaleString()}
              </div>
            </div>
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
