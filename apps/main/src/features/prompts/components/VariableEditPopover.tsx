import clsx from 'clsx';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import { getVariableClassVisual } from '../lib/variableClassVisuals';
import { buildTransformSpec, parseTransformSpec, TRANSFORM_OPTIONS } from '../lib/variableTransforms';

import { TransformPicker } from './TransformPicker';

export interface VariableEditPopoverProps {
  /** Canonical uppercase variable name. */
  name: string;
  /** Whether the name is already saved. */
  saved: boolean;
  /** Whether the name's class is a hard-coded default (recognised by default). */
  defaultClass?: boolean;
  /** Optional description shown for an already-saved variable (read-only here). */
  description?: string;
  /** Current substitution value (phase 2). */
  value?: string;
  /** Current transform spec ('id' or 'id:arg') applied to the resolved value. */
  transform?: string;
  /** Save the token as a known variable, persisting the (possibly empty) value
   *  and transform (null = no transform). */
  onSave: (value: string, transform: string | null) => void;
  /** Remove the saved variable. */
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * Editor variable popover — the click target for an uppercase VAR token in the
 * prompt. Covers save/unsave plus the phase-2 substitution value (the text the
 * variable expands to; empty = stays a literal symbol). Mirrors
 * OperatorEditPopover's chrome.
 */
export function VariableEditPopover({
  name,
  saved,
  defaultClass = false,
  description,
  value,
  transform,
  onSave,
  onRemove,
  onCancel,
}: VariableEditPopoverProps) {
  const [draft, setDraft] = useState(value ?? '');

  // Split the incoming spec into the picker's id + arg. An unknown id (newer
  // backend transform) falls back to "none" rather than erroring.
  const [initialId, initialArg] = transform ? parseTransformSpec(transform) : ['', null];
  const knownInitialId = TRANSFORM_OPTIONS.some((o) => o.id === initialId) ? initialId : '';
  const [transformId, setTransformId] = useState(knownInitialId);
  const [transformArg, setTransformArg] = useState(initialArg ?? '');

  const draftSpec = buildTransformSpec(transformId, transformArg);
  const hasValue = draft.trim().length > 0;

  const valueDirty = draft.trim() !== (value ?? '').trim();
  const transformDirty = (draftSpec ?? '') !== (transform ?? '');
  const dirty = valueDirty || transformDirty;

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      {/* Header — name + saved state */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
          <span>Variable</span>
          <span
            className={clsx(
              'inline-flex items-center gap-1 normal-case tracking-normal',
              saved
                ? 'text-emerald-600 dark:text-emerald-400'
                : defaultClass
                  ? 'text-emerald-600/80 dark:text-emerald-400/80'
                  : 'text-neutral-400 dark:text-neutral-500',
            )}
          >
            {saved ? (
              <>
                <Icon name="check" size={11} /> Saved
              </>
            ) : defaultClass ? (
              'Recognised (default)'
            ) : (
              'Not saved'
            )}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {(() => {
            const visual = getVariableClassVisual(name);
            if (!visual) return null;
            return (
              <span className="inline-flex items-center gap-1">
                <span className={clsx('w-2 h-2 rounded-full', visual.dotClass)} />
                <Icon name={visual.icon} size={13} className="text-neutral-500" />
              </span>
            );
          })()}
          <span className="font-mono text-sm text-neutral-800 dark:text-neutral-200">{name}</span>
        </div>
        {description && (
          <div className="mt-1 text-[11px] italic text-neutral-500 dark:text-neutral-400">
            {description}
          </div>
        )}
      </div>

      {/* Value — substitution text (phase 2) */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
          Expands to
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Leave empty to keep it a literal symbol"
          className="w-full resize-y rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
        <p className="mt-1 text-[10px] text-neutral-400 italic">
          When set, this text replaces {name} in the generated prompt.
        </p>
      </div>

      {/* Transform — post-process the resolved value (inert without a value) */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <TransformPicker
          previewValue={draft}
          transformId={transformId}
          transformArg={transformArg}
          onSelect={setTransformId}
          onArgChange={setTransformArg}
        />
      </div>

      {/* Footer — actions */}
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-2 py-1 rounded text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </button>
        {saved && (
          <button
            type="button"
            onClick={onRemove}
            className="px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(draft, hasValue ? draftSpec : null)}
          disabled={saved && !dirty}
          className="flex-1 px-2 py-1 rounded text-xs bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saved ? 'Save' : 'Save variable'}
        </button>
      </div>
    </div>
  );
}
