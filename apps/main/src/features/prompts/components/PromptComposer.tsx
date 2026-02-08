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
import { ClipboardPaste } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApi } from '@/hooks/useApi';
import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { usePromptSettingsStore } from '../stores/promptSettingsStore';

type PromptComposerMode = 'text' | 'blocks';

interface PromptBlockItem extends PromptBlockLike {
  id: string;
}

interface AnalyzePromptResponse {
  analysis?: {
    candidates?: PromptBlockCandidate[];
  };
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

  const idCounterRef = useRef(1);
  const lastComposedRef = useRef<string | null>(null);
  const lastParsedRef = useRef<string | null>(null);
  const parseRequestIdRef = useRef(0);

  const roleOptions = useMemo(() => {
    const roles = new Set<string>(BASE_PROMPT_ROLES);
    blocks.forEach((block) => {
      if (block.role) roles.add(block.role);
    });
    return Array.from(roles);
  }, [blocks]);

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
        void seedBlocksFromPrompt(value, { force: true });
        return;
      }

      const composed = composePrompt(blocks);
      lastComposedRef.current = composed;
      if (composed !== value) {
        onChange(composed);
      }
      setMode('text');
    },
    [blocks, mode, onChange, seedBlocksFromPrompt, value]
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
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Re-parse
          </button>
        )}

        {mode === 'blocks' && (
          <span className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
            {blocks.length} block{blocks.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

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
          {isParsing && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Parsing prompt into blocks...
            </div>
          )}
          {parseError && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {parseError}
            </div>
          )}

          <FoldGroup
            renderControls={({ expandAll, collapseAll }) => (
              <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                <button type="button" onClick={expandAll} className="hover:text-neutral-700 dark:hover:text-neutral-200">
                  Expand all
                </button>
                <button type="button" onClick={collapseAll} className="hover:text-neutral-700 dark:hover:text-neutral-200">
                  Collapse all
                </button>
              </div>
            )}
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
                    summaryClassName="not-italic"
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
                    <div className="mt-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-neutral-500 dark:text-neutral-400">Role</label>
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
                          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {getPromptRoleLabel(role)}
                            </option>
                          ))}
                        </select>

                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            disabled={disabled || index === 0}
                            onClick={() => moveBlock(index, 'up')}
                            className="text-[10px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={disabled || index === blocks.length - 1}
                            onClick={() => moveBlock(index, 'down')}
                            className="text-[10px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => removeBlock(block.id)}
                            className="text-[10px] px-2 py-1 rounded border border-red-200 dark:border-red-700 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
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
                          'w-full rounded border p-2 text-sm bg-white dark:bg-neutral-900 outline-none',
                          'border-neutral-200 dark:border-neutral-700',
                          'focus:ring-2 focus:ring-blue-500/40',
                          'resize-y min-h-[70px]'
                        )}
                      />
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
    </div>
  );
}
