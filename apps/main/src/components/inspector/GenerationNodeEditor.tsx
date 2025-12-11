import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';
import type { DraftSceneNode } from '@/modules/scene-builder';
import type { SceneRef } from '@/types';
import { useToast } from '@pixsim7/shared.ui';
import { useGraphStore } from '@/stores/graphStore';
import { getValidationSummary } from '@pixsim7/game.engine';
import { createGeneration, type GenerationResponse } from '@/lib/api/generations';
import { useGenerationNodeForm } from './useGenerationNodeForm';

interface GenerationNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function GenerationNodeEditor({ node, onUpdate }: GenerationNodeEditorProps) {
  const toast = useToast();
  const getCurrentScene = useGraphStore((s) => s.getCurrentScene);

  // Use consolidated form hook for all field state + validation
  const {
    values,
    setField,
    buildConfig,
    validation: validationResult,
    validationStatus,
    hasErrors,
  } = useGenerationNodeForm({ node });

  // Test generation state (UI-only, not part of form)
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<GenerationResponse | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  // Auto-expand validation panel if there are errors
  useEffect(() => {
    if (hasErrors) {
      setShowValidation(true);
    }
  }, [hasErrors]);

  function handleApply() {
    if (hasErrors) {
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
            value={values.generationType}
            onChange={(e) => setField('generationType', e.target.value as any)}
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
            value={values.purpose}
            onChange={(e) => setField('purpose', e.target.value as any)}
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
            value={values.strategy}
            onChange={(e) => setField('strategy', e.target.value as any)}
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
            value={values.seedSource}
            onChange={(e) => setField('seedSource', e.target.value as any)}
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
            value={values.templateId}
            onChange={(e) => setField('templateId', e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="template-123"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={values.enabled}
            onChange={(e) => setField('enabled', e.target.checked)}
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
              value={values.moodFrom}
              onChange={(e) => setField('moodFrom', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="tense"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Mood To</label>
            <input
              type="text"
              value={values.moodTo}
              onChange={(e) => setField('moodTo', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="calm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Pacing</label>
            <select
              value={values.pacing}
              onChange={(e) => setField('pacing', e.target.value as any)}
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
              value={values.transitionType}
              onChange={(e) => setField('transitionType', e.target.value as any)}
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
              value={values.durationMin}
              onChange={(e) => setField('durationMin', e.target.value)}
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
              value={values.durationMax}
              onChange={(e) => setField('durationMax', e.target.value)}
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
              value={values.durationTarget}
              onChange={(e) => setField('durationTarget', e.target.value)}
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
            value={values.rating}
            onChange={(e) => setField('rating', e.target.value as any)}
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
            value={values.requiredElements}
            onChange={(e) => setField('requiredElements', e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="character_A, location_cafe"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Avoid Elements (comma-separated)</label>
          <input
            type="text"
            value={values.avoidElements}
            onChange={(e) => setField('avoidElements', e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="violence, profanity"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Content Rules (one per line)</label>
          <textarea
            value={values.contentRules}
            onChange={(e) => setField('contentRules', e.target.value)}
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
            value={values.fallbackMode}
            onChange={(e) => setField('fallbackMode', e.target.value as any)}
            className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="default_content">Default Content</option>
            <option value="skip">Skip</option>
            <option value="retry">Retry</option>
            <option value="placeholder">Placeholder</option>
          </select>
        </div>

        {values.fallbackMode === 'default_content' && (
          <div>
            <label className="block text-xs font-medium mb-1">Default Content ID</label>
            <input
              type="text"
              value={values.defaultContentId}
              onChange={(e) => setField('defaultContentId', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="fallback-video-123"
            />
          </div>
        )}

        {values.fallbackMode === 'retry' && (
          <div>
            <label className="block text-xs font-medium mb-1">Max Retries</label>
            <input
              type="number"
              value={values.maxRetries}
              onChange={(e) => setField('maxRetries', e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              min="1"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1">Timeout (ms)</label>
          <input
            type="number"
            value={values.timeoutMs}
            onChange={(e) => setField('timeoutMs', e.target.value)}
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
