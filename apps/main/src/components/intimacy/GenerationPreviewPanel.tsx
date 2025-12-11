/**
 * Generation Preview Panel
 *
 * Shows live content generation previews based on intimacy scene configuration
 * and simulated relationship state. Allows designers to test generation before
 * committing to a scene design.
 *
 * @see frontend/src/lib/intimacy/generationPreview.ts
 * @see docs/INTIMACY_SCENE_COMPOSER.md - Phase 3
 */

import React, { useState, useEffect } from 'react';
import type { IntimacySceneConfig, GenerationSocialContext } from '@/types';
import type { SimulatedRelationshipState } from '@/lib/intimacy/gateChecking';
import type { IntimacyPreviewResult } from '@/lib/intimacy/generationPreview';
import {
  generateIntimacyPreview,
  startIntimacyPreview,
  getPreviewStatus,
} from '@/lib/intimacy/generationPreview';
import { deriveSocialContext } from '@/lib/intimacy/socialContextDerivation';
import { SocialContextPanel } from '../generation/SocialContextPanel';

interface GenerationPreviewPanelProps {
  /** Scene configuration */
  scene: IntimacySceneConfig;

  /** Simulated relationship state */
  relationshipState: SimulatedRelationshipState;

  /** World max rating (optional) */
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** User max rating (optional) */
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Workspace ID (optional) */
  workspaceId?: number;

  /** Provider ID for generation (e.g., 'pixverse') */
  providerId?: string;

  /** Generation parameters from shared settings (model, quality, duration, multi_shot, audio, off_peak, etc.) */
  generationParams?: Record<string, any>;
}

export function GenerationPreviewPanel({
  scene,
  relationshipState,
  worldMaxRating,
  userMaxRating,
  workspaceId,
  providerId,
  generationParams,
}: GenerationPreviewPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewResult, setPreviewResult] = useState<IntimacyPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSocialContext, setShowSocialContext] = useState(false);

  // Derive social context for display
  const socialContext = deriveSocialContext(
    relationshipState,
    scene,
    worldMaxRating,
    userMaxRating
  );

  // Handle generate button click
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setPreviewResult(null);

    try {
      // Start generation (non-blocking)
      const { generationId, result } = await startIntimacyPreview({
        scene,
        relationshipState,
        worldMaxRating,
        userMaxRating,
        workspaceId,
        providerId,
        generationParams,
      });

      setPreviewResult(result);

      // Poll for updates
      const pollInterval = setInterval(async () => {
        try {
          const updated = await getPreviewStatus(generationId, result.socialContext);
          setPreviewResult(updated);

          // Stop polling when done
          if (updated.status === 'completed' || updated.status === 'failed') {
            clearInterval(pollInterval);
            setIsGenerating(false);

            if (updated.status === 'failed') {
              setError(updated.error || 'Generation failed');
            }
          }
        } catch (err: any) {
          clearInterval(pollInterval);
          setIsGenerating(false);
          setError(err.message || 'Failed to check generation status');
        }
      }, 2000);

      // Cleanup after timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isGenerating) {
          setIsGenerating(false);
          setError('Generation timed out');
        }
      }, 60000);
    } catch (err: any) {
      setIsGenerating(false);
      setError(err.message || 'Failed to start generation');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Content Generation Preview
        </h3>
        <button
          onClick={() => setShowSocialContext(!showSocialContext)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showSocialContext ? 'Hide' : 'Show'} Social Context
        </button>
      </div>

      {/* Social Context (collapsible) */}
      {showSocialContext && (
        <div className="border dark:border-neutral-700 rounded-lg p-4 bg-neutral-50 dark:bg-neutral-800">
          <SocialContextPanel socialContext={socialContext} readOnly={true} />
        </div>
      )}

      {/* Generate Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            isGenerating
              ? 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 cursor-not-allowed'
              : 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating...
            </span>
          ) : (
            '🎲 Generate Preview'
          )}
        </button>

        {previewResult && !isGenerating && (
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span>Status:</span>
            <StatusBadge status={previewResult.status} />
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-medium text-red-900 dark:text-red-300">Generation Error</div>
              <div className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Result */}
      {previewResult && (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="p-3 rounded-lg border dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-neutral-600 dark:text-neutral-400">Generation ID</div>
                <div className="font-mono text-neutral-900 dark:text-neutral-100">
                  #{previewResult.generationId}
                </div>
              </div>
              <div>
                <div className="text-neutral-600 dark:text-neutral-400">Intimacy Band</div>
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  {socialContext.intimacyBand || 'none'}
                </div>
              </div>
              <div>
                <div className="text-neutral-600 dark:text-neutral-400">Content Rating</div>
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  {socialContext.contentRating || 'sfw'}
                </div>
              </div>
              {previewResult.metadata?.duration && (
                <div>
                  <div className="text-neutral-600 dark:text-neutral-400">Duration</div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {(previewResult.metadata.duration / 1000).toFixed(2)}s
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Generated Content */}
          {previewResult.content && (
            <div className="p-4 rounded-lg border dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Generated Content
                </h4>
                <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  {previewResult.content.type}
                </span>
              </div>

              {/* Content Display */}
              {previewResult.content.dialogue && (
                <div className="space-y-2">
                  {previewResult.content.dialogue.map((line, i) => (
                    <div
                      key={i}
                      className="p-3 rounded bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {/* Metadata tags */}
              {previewResult.content.metadata?.tags && (
                <div className="mt-3 pt-3 border-t dark:border-neutral-700">
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">Tags:</div>
                  <div className="flex gap-2 flex-wrap">
                    {previewResult.content.metadata.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      {!previewResult && !isGenerating && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <div className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
            💡 Generation Tips
          </div>
          <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>Adjust relationship state to test different intimacy levels</li>
            <li>Check social context to see what will be sent to the generator</li>
            <li>Generation uses scene type, mood, and content rating</li>
            <li>Preview content is placeholder until backend is fully implemented</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Status badge component
 */
function StatusBadge({
  status,
}: {
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
}) {
  const colors = {
    pending: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    queued: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    processing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  };

  const icons = {
    pending: '⏳',
    queued: '⏳',
    processing: '⚙️',
    completed: '✓',
    failed: '✗',
    cancelled: '🚫',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
      {icons[status]} {status}
    </span>
  );
}
