import type { PromptBlockLike } from '@pixsim7/core.prompt';
import { DEFAULT_PROMPT_ROLE } from '@pixsim7/core.prompt';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { Icon } from '@lib/icons';

import { getPromptRoleBadgeClass, getPromptRoleHex, getPromptRoleLabel } from '@/lib/promptRoleUi';

interface PromptBlockItem extends PromptBlockLike {
  id: string;
}

export interface InlineBlocksEditorProps {
  blocks: PromptBlockItem[];
  disabled: boolean;
  promptRoleColors: Record<string, string>;
  roleOptions: string[];
  onUpdateBlocks: (blocks: PromptBlockItem[]) => void;
  onAddBlock: () => void;
  onRemoveBlock: (id: string) => void;
}

interface PendingFocus {
  blockIndex: number;
  cursorPos: number;
}

let nextInlineBlockId = Date.now();

export function InlineBlocksEditor({
  blocks,
  disabled,
  promptRoleColors,
  roleOptions,
  onUpdateBlocks,
  onAddBlock,
  onRemoveBlock,
}: InlineBlocksEditorProps) {
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  // Resolve pending focus after blocks update
  useEffect(() => {
    const pf = pendingFocusRef.current;
    if (!pf) return;
    pendingFocusRef.current = null;

    const block = blocks[pf.blockIndex];
    if (!block) return;
    const ta = textareaRefs.current.get(block.id);
    if (!ta) return;
    ta.focus();
    const pos = Math.min(pf.cursorPos, ta.value.length);
    ta.setSelectionRange(pos, pos);
  }, [blocks]);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = '0';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const setTextareaRef = useCallback(
    (id: string, el: HTMLTextAreaElement | null) => {
      if (el) {
        textareaRefs.current.set(id, el);
      } else {
        textareaRefs.current.delete(id);
      }
    },
    []
  );

  // Auto-resize all textareas on mount and block changes
  useLayoutEffect(() => {
    for (const ta of textareaRefs.current.values()) {
      autoResize(ta);
    }
  }, [blocks, autoResize]);

  const handleTextChange = useCallback(
    (blockId: string, text: string) => {
      onUpdateBlocks(blocks.map((b) => (b.id === blockId ? { ...b, text } : b)));
    },
    [blocks, onUpdateBlocks]
  );

  const handleRoleChange = useCallback(
    (blockId: string, role: string) => {
      onUpdateBlocks(
        blocks.map((b) => (b.id === blockId ? { ...b, role: role || DEFAULT_PROMPT_ROLE } : b))
      );
    },
    [blocks, onUpdateBlocks]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, blockIndex: number) => {
      const ta = e.currentTarget;
      const block = blocks[blockIndex];
      if (!block) return;

      // Tab / Shift+Tab: move between blocks
      if (e.key === 'Tab') {
        e.preventDefault();
        const nextIndex = e.shiftKey ? blockIndex - 1 : blockIndex + 1;
        const nextBlock = blocks[nextIndex];
        if (nextBlock) {
          const nextTa = textareaRefs.current.get(nextBlock.id);
          if (nextTa) {
            nextTa.focus();
            nextTa.setSelectionRange(nextTa.value.length, nextTa.value.length);
          }
        }
        return;
      }

      // Enter (no shift): split or add block
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const pos = ta.selectionStart;
        const text = block.text;

        if (pos >= text.length) {
          // At end: add new empty block after current
          const newId = `inline-block-${++nextInlineBlockId}`;
          const next = [...blocks];
          next.splice(blockIndex + 1, 0, { id: newId, role: DEFAULT_PROMPT_ROLE, text: '' });
          pendingFocusRef.current = { blockIndex: blockIndex + 1, cursorPos: 0 };
          onUpdateBlocks(next);
        } else {
          // In middle: split block at cursor
          const before = text.slice(0, pos);
          const after = text.slice(pos);
          const newId = `inline-block-${++nextInlineBlockId}`;
          const next = blocks.map((b) => (b.id === block.id ? { ...b, text: before } : b));
          next.splice(blockIndex + 1, 0, { id: newId, role: block.role, text: after });
          pendingFocusRef.current = { blockIndex: blockIndex + 1, cursorPos: 0 };
          onUpdateBlocks(next);
        }
        return;
      }

      // Backspace at position 0
      if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        if (block.text === '') {
          // Empty block: delete it, focus prev
          if (blocks.length <= 1) return;
          const prevIndex = Math.max(0, blockIndex - 1);
          const prevBlock = blocks[prevIndex];
          if (prevBlock) {
            pendingFocusRef.current = {
              blockIndex: prevIndex,
              cursorPos: prevBlock.text.length,
            };
          }
          onRemoveBlock(block.id);
        } else if (blockIndex > 0) {
          // Non-empty: merge into previous block
          const prev = blocks[blockIndex - 1];
          const mergePos = prev.text.length;
          const mergedText = prev.text + block.text;
          const next = blocks
            .filter((b) => b.id !== block.id)
            .map((b) => (b.id === prev.id ? { ...b, text: mergedText } : b));
          pendingFocusRef.current = { blockIndex: blockIndex - 1, cursorPos: mergePos };
          onUpdateBlocks(next);
        }
      }
    },
    [blocks, onUpdateBlocks, onRemoveBlock]
  );

  return (
    <div className="flex flex-wrap gap-1.5 items-start">
      {blocks.map((block, index) => {
        const borderColor = getPromptRoleHex(block.role, promptRoleColors);
        const badgeColor = getPromptRoleBadgeClass(block.role, promptRoleColors);

        return (
          <div
            key={block.id}
            className="group/chip inline-flex items-start gap-1 rounded-md border bg-white dark:bg-neutral-900/60 px-1.5 py-1 min-w-[140px] max-w-full"
            style={{ borderColor }}
          >
            {/* Role badge with hidden select overlay */}
            <label
              className={clsx(
                'relative inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 cursor-pointer mt-0.5',
                'border-neutral-200 dark:border-neutral-700',
                'text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/60',
                disabled && 'opacity-60 cursor-not-allowed'
              )}
              title="Change role"
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
              <span className="whitespace-nowrap">{getPromptRoleLabel(block.role)}</span>
              <Icon name="chevronDown" size={9} className="text-neutral-400 dark:text-neutral-500" />
              <select
                value={block.role}
                disabled={disabled}
                onChange={(e) => handleRoleChange(block.id, e.target.value)}
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

            {/* Auto-sizing textarea */}
            <textarea
              ref={(el) => setTextareaRef(block.id, el)}
              value={block.text}
              disabled={disabled}
              placeholder="..."
              onChange={(e) => {
                handleTextChange(block.id, e.target.value);
                autoResize(e.currentTarget);
              }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              rows={1}
              className={clsx(
                'flex-1 min-w-[100px] bg-transparent text-sm outline-none resize-none overflow-hidden py-0.5',
                'placeholder:text-neutral-400 dark:placeholder:text-neutral-600'
              )}
            />

            {/* Delete button, visible on hover */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemoveBlock(block.id)}
              title="Remove block"
              aria-label="Remove block"
              className={clsx(
                'p-0.5 rounded shrink-0 mt-0.5 transition-opacity',
                'text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400',
                'opacity-0 group-hover/chip:opacity-100 focus:opacity-100',
                disabled && 'hidden'
              )}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        );
      })}

      {/* Add block button */}
      <button
        type="button"
        disabled={disabled}
        onClick={onAddBlock}
        title="Add block"
        className={clsx(
          'inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs transition-colors mt-0.5',
          'border-neutral-300 dark:border-neutral-700',
          'text-neutral-500 dark:text-neutral-400',
          'hover:border-neutral-400 hover:text-neutral-700 dark:hover:border-neutral-600 dark:hover:text-neutral-200'
        )}
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}
