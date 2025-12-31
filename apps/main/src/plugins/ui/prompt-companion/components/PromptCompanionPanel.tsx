/**
 * Prompt Companion Panel
 *
 * Interactive toolbar component rendered alongside prompt input surfaces.
 * Provides quick actions for prompt analysis, variant suggestions, and pack hints.
 */

import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { Button } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import type { PromptCompanionContext } from '@lib/ui/promptCompanionSlot';
import { usePromptCompanionEvents } from '@lib/ui/promptCompanionSlot';
import { useApi } from '@/hooks/useApi';
import { BlockBreakdownDrawer } from './BlockBreakdownDrawer';
import { VariantSuggestionsDrawer } from './VariantSuggestionsDrawer';
import { PackHintsDrawer } from './PackHintsDrawer';
import { BlockBuilderModal } from './BlockBuilderModal';

// ============================================================================
// Types
// ============================================================================

interface PromptAnalysis {
  prompt: string;
  segments: Array<{
    role: string;
    text: string;
    start_pos?: number;
    end_pos?: number;
    category?: string;
    metadata?: Record<string, unknown>;
  }>;
  tags: string[];
}

interface CategoryDiscoveryResponse {
  prompt_text: string;
  parser_roles: Array<{ role: string; text: string }>;
  existing_ontology_ids: string[];
  suggested_ontology_ids: Array<{
    id: string;
    label: string;
    description?: string;
    kind: string;
    confidence: number;
  }>;
  suggested_packs: Array<{
    pack_id: string;
    pack_label: string;
    parser_hints: Record<string, string[]>;
    notes?: string;
  }>;
  suggested_action_blocks: Array<{
    block_id: string;
    prompt: string;
    tags: Record<string, unknown>;
    notes?: string;
  }>;
}

// ============================================================================
// Main Component
// ============================================================================

export function PromptCompanionPanel(context: PromptCompanionContext) {
  const { promptValue, setPromptValue, surface, isDevMode } = context;
  const api = useApi();
  const { dispatch } = usePromptCompanionEvents();

  // UI State
  const [showBlockBreakdown, setShowBlockBreakdown] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showPackHints, setShowPackHints] = useState(false);
  const [showBlockBuilder, setShowBlockBuilder] = useState(false);

  // Loading states
  const [analyzingBlocks, setAnalyzingBlocks] = useState(false);
  const [fetchingVariants, setFetchingVariants] = useState(false);
  const [fetchingPacks, setFetchingPacks] = useState(false);

  // Data states
  const [blockAnalysis, setBlockAnalysis] = useState<PromptAnalysis | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [packHints, setPackHints] = useState<CategoryDiscoveryResponse | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

  const handleAnalyzeBlocks = useCallback(async () => {
    if (!promptValue.trim()) {
      setError('Enter a prompt to analyze');
      return;
    }

    setAnalyzingBlocks(true);
    setError(null);
    dispatch({ type: 'analyze-request', prompt: promptValue });

    try {
      const result = await api.post<PromptAnalysis>(
        '/dev/prompt-inspector/analyze-prompt',
        { prompt_text: promptValue }
      );
      setBlockAnalysis(result);
      setShowBlockBreakdown(true);
      dispatch({ type: 'analyze-complete', prompt: promptValue, segments: result.segments });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze prompt';
      setError(message);
      console.error('[PromptCompanion] Block analysis error:', err);
    } finally {
      setAnalyzingBlocks(false);
    }
  }, [promptValue, api, dispatch]);

  const handleSuggestVariants = useCallback(async () => {
    if (!promptValue.trim()) {
      setError('Enter a prompt to get variants');
      return;
    }

    setFetchingVariants(true);
    setError(null);

    try {
      // Use prompt edit API to generate variants
      const result = await api.post<{ variants: string[] }>(
        '/dev/prompt-editor/suggest-variants',
        { prompt_text: promptValue, count: 3 }
      );
      setVariants(result.variants || []);
      setShowVariants(true);
      dispatch({ type: 'suggest-variants', prompt: promptValue, variants: result.variants || [] });
    } catch (err: unknown) {
      // Graceful degradation - API may not exist
      const message = err instanceof Error ? err.message : 'Variants API unavailable';
      if (isDevMode) {
        setError(message);
      } else {
        // In production, silently fail with notice
        setVariants([]);
        setShowVariants(true);
      }
      console.warn('[PromptCompanion] Variants API unavailable:', err);
    } finally {
      setFetchingVariants(false);
    }
  }, [promptValue, api, dispatch, isDevMode]);

  const handlePackHints = useCallback(async () => {
    if (!promptValue.trim()) {
      setError('Enter a prompt to discover packs');
      return;
    }

    setFetchingPacks(true);
    setError(null);
    dispatch({ type: 'pack-hints-request', prompt: promptValue });

    try {
      const result = await api.post<CategoryDiscoveryResponse>(
        '/dev/prompt-categories/discover',
        { prompt_text: promptValue }
      );
      setPackHints(result);
      setShowPackHints(true);
      dispatch({ type: 'pack-hints-response', hints: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Pack hints unavailable';
      if (isDevMode) {
        setError(message);
      }
      console.warn('[PromptCompanion] Pack hints error:', err);
    } finally {
      setFetchingPacks(false);
    }
  }, [promptValue, api, dispatch, isDevMode]);

  const handleOpenBlockBuilder = useCallback(() => {
    setShowBlockBuilder(true);
  }, []);

  const handleInsertBlock = useCallback(
    (block: string) => {
      const newPrompt = promptValue ? `${promptValue}\n\n${block}` : block;
      setPromptValue(newPrompt);
      dispatch({ type: 'insert-block', block, position: 'end' });
    },
    [promptValue, setPromptValue, dispatch]
  );

  const handleSelectVariant = useCallback(
    (variant: string) => {
      setPromptValue(variant);
      setShowVariants(false);
      dispatch({ type: 'replace-prompt', newPrompt: variant });
    },
    [setPromptValue, dispatch]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  const hasPrompt = promptValue.trim().length > 0;
  const isCompact = surface === 'quick-generate';

  return (
    <>
      {/* Main Toolbar */}
      <div
        className={clsx(
          'flex items-center gap-1.5 flex-wrap',
          isCompact ? 'p-1' : 'p-2',
          'bg-neutral-50 dark:bg-neutral-900',
          'border border-neutral-200 dark:border-neutral-700',
          'rounded-lg'
        )}
      >
        {/* Explain Blocks Button */}
        <Button
          onClick={handleAnalyzeBlocks}
          disabled={!hasPrompt || analyzingBlocks}
          size="sm"
          variant="outline"
          className="text-xs"
          title="Analyze prompt structure and blocks"
        >
          {analyzingBlocks ? (
            <Icon name="loader" className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Icon name="search" className="h-3 w-3 mr-1" />
          )}
          {isCompact ? 'Blocks' : 'Explain Blocks'}
        </Button>

        {/* Suggest Variants Button */}
        <Button
          onClick={handleSuggestVariants}
          disabled={!hasPrompt || fetchingVariants}
          size="sm"
          variant="outline"
          className="text-xs"
          title="Generate prompt variations"
        >
          {fetchingVariants ? (
            <Icon name="loader" className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Icon name="sparkles" className="h-3 w-3 mr-1" />
          )}
          {isCompact ? 'Variants' : 'Suggest Variants'}
        </Button>

        {/* Pack Hints Button (Dev-only by default) */}
        {isDevMode && (
          <Button
            onClick={handlePackHints}
            disabled={!hasPrompt || fetchingPacks}
            size="sm"
            variant="outline"
            className="text-xs"
            title="Discover semantic packs and categories"
          >
            {fetchingPacks ? (
              <Icon name="loader" className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Icon name="folder" className="h-3 w-3 mr-1" />
            )}
            {isCompact ? 'Packs' : 'Pack Hints'}
          </Button>
        )}

        {/* Block Builder Button */}
        <Button
          onClick={handleOpenBlockBuilder}
          disabled={!blockAnalysis}
          size="sm"
          variant="outline"
          className="text-xs"
          title="Build new blocks from analysis"
        >
          <Icon name="add" className="h-3 w-3 mr-1" />
          {isCompact ? 'Build' : 'Block Builder'}
        </Button>

        {/* Dev Mode Indicator */}
        {!isDevMode && (
          <span className="ml-auto text-xs text-neutral-400" title="Some features require dev mode">
            <Icon name="info" className="h-3 w-3 inline mr-0.5" />
            Limited
          </span>
        )}

        {/* Error Display */}
        {error && (
          <span className="text-xs text-red-500 ml-2 flex items-center gap-1">
            <Icon name="alertCircle" className="h-3 w-3" />
            {error}
          </span>
        )}
      </div>

      {/* Drawers and Modals */}
      <BlockBreakdownDrawer
        open={showBlockBreakdown}
        onClose={() => setShowBlockBreakdown(false)}
        analysis={blockAnalysis}
        onInsertBlock={handleInsertBlock}
      />

      <VariantSuggestionsDrawer
        open={showVariants}
        onClose={() => setShowVariants(false)}
        variants={variants}
        onSelectVariant={handleSelectVariant}
        isDevMode={isDevMode}
      />

      <PackHintsDrawer
        open={showPackHints}
        onClose={() => setShowPackHints(false)}
        packHints={packHints}
        isDevMode={isDevMode}
      />

      <BlockBuilderModal
        open={showBlockBuilder}
        onClose={() => setShowBlockBuilder(false)}
        segments={blockAnalysis?.segments || []}
        onInsertBlock={handleInsertBlock}
      />
    </>
  );
}
