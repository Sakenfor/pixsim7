import type { PromptBlockLike } from '@pixsim7/core.prompt';
import {
  BASE_PROMPT_ROLES,
  DEFAULT_PROMPT_ROLE,
  composePromptFromBlocks,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import { FoldGroup, GroupedFold, PromptInput } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Folder,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApi } from '@/hooks/useApi';
import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';
import {
  BlockBreakdownDrawer,
  BlockBuilderModal,
  PackHintsDrawer,
  VariantSuggestionsDrawer,
} from '@/plugins/ui/prompt-companion/components';

import { useSemanticActionBlocks } from '../hooks/useSemanticActionBlocks';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptTag } from '../types';

type PromptComposerMode = 'text' | 'blocks';

interface PromptBlockItem extends PromptBlockLike {
  id: string;
}

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
    tags?: PromptTag[];
  };
}

interface PromptAnalysis {
  prompt: string;
  candidates: PromptBlockCandidate[];
  tags: PromptTag[];
}

interface CategoryDiscoveryResponse {
  prompt_text: string;
  candidates: PromptBlockCandidate[];
  existing_ontology_ids: string[];
  suggestions?: Record<string, unknown>;
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
  suggested_candidates: PromptBlockCandidate[];
}

export interface PromptComposerProps {
  value: string;
  onChange: (val: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  resizable?: boolean;
  minHeight?: number;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}\u2026`;
}

function composePrompt(blocks: PromptBlockItem[]) {
  return composePromptFromBlocks(blocks);
}

export function PromptComposer({
  value,
  onChange,
  maxChars,
  placeholder,
  disabled = false,
  className,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
}: PromptComposerProps) {
  const api = useApi();
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);
  const [mode, setMode] = useState<PromptComposerMode>('text');
  const [blocks, setBlocks] = useState<PromptBlockItem[]>([
    { id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' },
  ]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [showBlockBreakdown, setShowBlockBreakdown] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showPackHints, setShowPackHints] = useState(false);
  const [showBlockBuilder, setShowBlockBuilder] = useState(false);

  const [analyzingBlocks, setAnalyzingBlocks] = useState(false);
  const [fetchingVariants, setFetchingVariants] = useState(false);
  const [fetchingPacks, setFetchingPacks] = useState(false);

  const [blockAnalysis, setBlockAnalysis] = useState<PromptAnalysis | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [packHints, setPackHints] = useState<CategoryDiscoveryResponse | null>(null);

  const idCounterRef = useRef(1);
  const lastComposedRef = useRef<string | null>(null);
  const lastParsedRef = useRef<string | null>(null);
  const parseRequestIdRef = useRef(0);
  const expandAllRef = useRef<(() => void) | null>(null);
  const collapseAllRef = useRef<(() => void) | null>(null);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>(BASE_PROMPT_ROLES);
    blocks.forEach((block) => {
      if (block.role) roles.add(block.role);
    });
    return Array.from(roles);
  }, [blocks]);

  const {
    results: semanticMatches,
    loading: semanticLoading,
  } = useSemanticActionBlocks(value, {
    enabled: mode === 'blocks',
    minChars: 16,
    debounceMs: 450,
  });

  const updateBlocks = useCallback(
    (nextBlocks: PromptBlockItem[]) => {
      setBlocks(nextBlocks);
      const composed = composePrompt(nextBlocks);
      lastComposedRef.current = composed;
      if (composed !== value) {
        onChange(composed);
      }
    },
    [onChange, value]
  );

  const seedBlocksFromPrompt = useCallback(
    async (text: string, { force = false }: { force?: boolean } = {}) => {
      const normalized = text.trim();
      if (!force && normalized && lastParsedRef.current === normalized) {
        return;
      }

      if (!normalized) {
        lastParsedRef.current = '';
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
        return;
      }

      const requestId = ++parseRequestIdRef.current;
      setIsParsing(true);
      setParseError(null);

      try {
        const response = await api.post<AnalyzePromptResponse>('/prompts/analyze', {
          text: normalized,
        });
        if (requestId !== parseRequestIdRef.current) return;

        const candidates = response?.analysis?.candidates ?? [];

        const derivedBlocks = deriveBlocksFromCandidates(candidates, {
          defaultRole: DEFAULT_PROMPT_ROLE,
          fallbackText: normalized,
        });

        const ensured = ensurePromptBlocks(derivedBlocks, normalized, DEFAULT_PROMPT_ROLE);
        const nextBlocks = ensured.map((candidate, index) => ({
          id: `block-${Date.now()}-${index}`,
          role: candidate.role,
          text: candidate.text,
        }));

        lastParsedRef.current = normalized;
        updateBlocks(nextBlocks);
      } catch (err) {
        if (requestId !== parseRequestIdRef.current) return;
        setParseError(err instanceof Error ? err.message : 'Failed to parse prompt');
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: normalized }]);
      } finally {
        if (requestId === parseRequestIdRef.current) {
          setIsParsing(false);
        }
      }
    },
    [api, updateBlocks]
  );

  const handleModeChange = useCallback(
    (nextMode: PromptComposerMode) => {
      if (nextMode === mode) return;

      if (nextMode === 'blocks') {
        setMode('blocks');
        return;
      }

      const composed = composePrompt(blocks);
      lastComposedRef.current = composed;
      if (composed !== value) {
        onChange(composed);
      }
      setMode('text');
    },
    [blocks, mode, onChange, value]
  );

  useEffect(() => {
    if (mode !== 'blocks') return;
    if (value === lastComposedRef.current) return;
    void seedBlocksFromPrompt(value);
  }, [mode, seedBlocksFromPrompt, value]);

  const addBlock = useCallback(() => {
    const nextId = `block-${idCounterRef.current++}`;
    updateBlocks([
      ...blocks,
      { id: nextId, role: DEFAULT_PROMPT_ROLE, text: '' },
    ]);
  }, [blocks, updateBlocks]);

  const removeBlock = useCallback(
    (id: string) => {
      const nextBlocks = blocks.filter((block) => block.id !== id);
      updateBlocks(nextBlocks.length ? nextBlocks : [{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
    },
    [blocks, updateBlocks]
  );

  const moveBlock = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const next = [...blocks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      updateBlocks(next);
    },
    [blocks, updateBlocks]
  );

  const insertSemanticBlock = useCallback(
    (text: string, role?: string | null) => {
      const nextId = `block-${idCounterRef.current++}`;
      updateBlocks([...blocks, { id: nextId, role: role || DEFAULT_PROMPT_ROLE, text }]);
    },
    [blocks, updateBlocks]
  );

  const handleInsertBlock = useCallback(
    (text: string) => {
      insertSemanticBlock(text, DEFAULT_PROMPT_ROLE);
    },
    [insertSemanticBlock]
  );

  const handleAnalyzeBlocks = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to analyze');
      return;
    }

    setAnalyzingBlocks(true);
    setAssistantError(null);

    try {
      const response = await api.post<AnalyzePromptResponse>('/prompts/analyze', {
        text: normalized,
      });
      const analysis = response.analysis;
      const next: PromptAnalysis = {
        prompt: analysis?.prompt || normalized,
        candidates: analysis?.candidates || [],
        tags: analysis?.tags || [],
      };
      setBlockAnalysis(next);
      setShowBlockBreakdown(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze prompt';
      setAssistantError(message);
    } finally {
      setAnalyzingBlocks(false);
    }
  }, [api, value]);

  const handleSuggestVariants = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to get variants');
      return;
    }

    const isDevMode = import.meta.env.DEV;
    setFetchingVariants(true);
    setAssistantError(null);

    try {
      const result = await api.post<{ variants: string[] }>(
        '/dev/prompt-editor/suggest-variants',
        { prompt_text: normalized, count: 3 }
      );
      setVariants(result.variants || []);
      setShowVariants(true);
    } catch (err: unknown) {
      if (isDevMode) {
        const message = err instanceof Error ? err.message : 'Variants API unavailable';
        setAssistantError(message);
      }
      setVariants([]);
      setShowVariants(true);
    } finally {
      setFetchingVariants(false);
    }
  }, [api, value]);

  const handlePackHints = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to discover packs');
      return;
    }

    const isDevMode = import.meta.env.DEV;
    setFetchingPacks(true);
    setAssistantError(null);

    try {
      const result = await api.post<CategoryDiscoveryResponse>(
        '/dev/prompt-categories/discover',
        { prompt_text: normalized }
      );
      setPackHints(result);
      setShowPackHints(true);
    } catch (err: unknown) {
      if (isDevMode) {
        const message = err instanceof Error ? err.message : 'Pack hints unavailable';
        setAssistantError(message);
      }
    } finally {
      setFetchingPacks(false);
    }
  }, [api, value]);

  const handleSelectVariant = useCallback(
    (variant: string) => {
      onChange(variant);
      setShowVariants(false);
    },
    [onChange]
  );

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const trimmed = maxChars != null ? text.slice(0, maxChars) : text;
      onChange(trimmed);
    } catch {
      // Clipboard access denied or unavailable
    }
  }, [onChange, maxChars]);

  const composedPrompt = useMemo(() => composePrompt(blocks), [blocks]);
  const remaining = typeof maxChars === 'number' ? maxChars - composedPrompt.length : null;
  const isOverLimit = remaining !== null && remaining < 0;

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeChange('text')}
            className={clsx(
              'px-2 py-1 text-xs font-medium transition-colors',
              mode === 'text'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
          >
            Text
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleModeChange('blocks')}
            className={clsx(
              'px-2 py-1 text-xs font-medium border-l border-neutral-300 dark:border-neutral-700 transition-colors',
              mode === 'blocks'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
          >
            Blocks
          </button>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={handlePasteFromClipboard}
          title="Paste from clipboard"
          className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <ClipboardPaste size={14} />
        </button>

        {mode === 'blocks' && (
          <button
            type="button"
            disabled={disabled || isParsing}
            onClick={() => seedBlocksFromPrompt(value, { force: true })}
            title="Re-parse blocks"
            aria-label="Re-parse blocks"
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <RefreshCw size={14} className={clsx(isParsing && 'animate-spin')} />
          </button>
        )}

        {mode === 'blocks' && (
          <button
            type="button"
            disabled={disabled || analyzingBlocks}
            onClick={handleAnalyzeBlocks}
            title="Analyze prompt blocks"
            aria-label="Analyze prompt blocks"
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {analyzingBlocks ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
          </button>
        )}

        {mode === 'blocks' && (
          <button
            type="button"
            disabled={disabled || fetchingVariants}
            onClick={handleSuggestVariants}
            title="Suggest prompt variants"
            aria-label="Suggest prompt variants"
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {fetchingVariants ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
          </button>
        )}

        {mode === 'blocks' && (
          <button
            type="button"
            disabled={disabled || fetchingPacks}
            onClick={handlePackHints}
            title="Discover pack hints"
            aria-label="Discover pack hints"
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            {fetchingPacks ? <RefreshCw size={12} className="animate-spin" /> : <Folder size={12} />}
          </button>
        )}

        {mode === 'blocks' && (
          <button
            type="button"
            disabled={disabled || !blockAnalysis || blockAnalysis.candidates.length === 0}
            onClick={() => setShowBlockBuilder(true)}
            title="Open block builder"
            aria-label="Open block builder"
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
          >
            <Plus size={12} />
          </button>
        )}

        {mode === 'blocks' && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => expandAllRef.current?.()}
              title="Expand all blocks"
              aria-label="Expand all blocks"
              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => collapseAllRef.current?.()}
              title="Collapse all blocks"
              aria-label="Collapse all blocks"
              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            >
              <ChevronUp size={12} />
            </button>
          </>
        )}

        {mode === 'blocks' && (
          <span className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
            {blocks.length} block{blocks.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {mode === 'blocks' && assistantError && (
        <div className="text-xs text-red-600 dark:text-red-400">{assistantError}</div>
      )}

      {mode === 'text' ? (
        <PromptInput
          value={value}
          onChange={onChange}
          maxChars={maxChars}
          placeholder={placeholder}
          disabled={disabled}
          variant={variant}
          showCounter={showCounter}
          resizable={resizable}
          minHeight={minHeight}
          className="h-full"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {parseError && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {parseError}
            </div>
          )}

          {(semanticLoading || semanticMatches.length > 0) && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                <Sparkles size={12} />
              </span>
              {semanticLoading && (
                <RefreshCw
                  size={12}
                  className="text-neutral-500 dark:text-neutral-400 animate-spin flex-shrink-0"
                />
              )}
              {semanticMatches.slice(0, 5).map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => insertSemanticBlock(match.prompt, match.role)}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded border whitespace-nowrap',
                    'border-neutral-200 dark:border-neutral-700',
                    'text-neutral-600 dark:text-neutral-300',
                    'hover:border-blue-400 hover:bg-blue-50 dark:hover:border-blue-500 dark:hover:bg-blue-900/20'
                  )}
                  title={`${match.block_id} (${Math.round(match.similarity_score * 100)}%)`}
                >
                  {match.block_id}
                </button>
              ))}
            </div>
          )}

          <FoldGroup
            renderControls={({ expandAll, collapseAll }) => {
              expandAllRef.current = expandAll;
              collapseAllRef.current = collapseAll;
              return null;
            }}
          >
            <div className="flex flex-col gap-2">
              {blocks.map((block, index) => {
                const summaryText = block.text.trim()
                  ? truncate(block.text.trim(), 60)
                  : 'Empty block';
                const badgeColor = getPromptRoleBadgeClass(block.role, promptRoleColors);

                return (
                  <GroupedFold
                    key={block.id}
                    id={block.id}
                    indicator="chevron"
                    showIndicatorWhenOpen
                    summaryClassName="not-italic"
                    contentClassName="block"
                    summary={
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
                          <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
                          {getPromptRoleLabel(block.role)}
                        </span>
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                          {summaryText}
                        </span>
                      </span>
                    }
                  >
                    <div className="mt-1 flex items-stretch gap-2">
                      <div className={clsx('w-1 rounded-full opacity-70 shrink-0', badgeColor)} />
                      <div className="flex-1 min-w-0 pr-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label
                            className={clsx(
                              'relative inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                              'border-neutral-200 dark:border-neutral-700',
                              'text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/60',
                              disabled && 'opacity-60'
                            )}
                            title="Change role"
                          >
                            <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
                            <span>{getPromptRoleLabel(block.role)}</span>
                            <ChevronDown size={11} className="text-neutral-400 dark:text-neutral-500" />
                            <select
                              value={block.role}
                              disabled={disabled}
                              onChange={(e) => {
                                const nextRole = e.target.value || DEFAULT_PROMPT_ROLE;
                                const nextBlocks = blocks.map((item) =>
                                  item.id === block.id ? { ...item, role: nextRole } : item
                                );
                                updateBlocks(nextBlocks);
                              }}
                              aria-label="Change block role"
                              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                            >
                              {roleOptions.map((role) => (
                                <option key={role} value={role}>
                                  {getPromptRoleLabel(role)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              disabled={disabled || index === 0}
                              onClick={() => moveBlock(index, 'up')}
                              title="Move block up"
                              aria-label="Move block up"
                              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={disabled || index === blocks.length - 1}
                              onClick={() => moveBlock(index, 'down')}
                              title="Move block down"
                              aria-label="Move block down"
                              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                            >
                              <ArrowDown size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => removeBlock(block.id)}
                              title="Remove block"
                              aria-label="Remove block"
                              className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <textarea
                          value={block.text}
                          disabled={disabled}
                          onChange={(e) => {
                            const nextText = e.target.value;
                            const nextBlocks = blocks.map((item) =>
                              item.id === block.id ? { ...item, text: nextText } : item
                            );
                            updateBlocks(nextBlocks);
                          }}
                          placeholder="Block text..."
                          className={clsx(
                            'w-full rounded-md border px-2 py-1.5 text-sm bg-transparent outline-none',
                            'border-neutral-200/80 dark:border-neutral-700/80',
                            'focus:ring-2 focus:ring-blue-500/35',
                            'resize-y min-h-[64px]'
                          )}
                        />
                      </div>
                    </div>
                  </GroupedFold>
                );
              })}
            </div>
          </FoldGroup>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={addBlock}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Add block
            </button>
            <div className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
              Blocks render as paragraphs
            </div>
          </div>

          {showCounter && typeof maxChars === 'number' && (
            <div className="text-xs flex justify-between items-center">
              {isOverLimit && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Over limit by {Math.abs(remaining ?? 0)} chars
                </span>
              )}
              <span className={clsx(
                'tabular-nums ml-auto',
                isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500'
              )}>
                {composedPrompt.length} / {maxChars}
              </span>
            </div>
          )}
        </div>
      )}

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
        isDevMode={import.meta.env.DEV}
      />

      <PackHintsDrawer
        open={showPackHints}
        onClose={() => setShowPackHints(false)}
        packHints={packHints}
        isDevMode={import.meta.env.DEV}
      />

      <BlockBuilderModal
        open={showBlockBuilder}
        onClose={() => setShowBlockBuilder(false)}
        candidates={blockAnalysis?.candidates || []}
        onInsertBlock={handleInsertBlock}
      />
    </div>
  );
}
