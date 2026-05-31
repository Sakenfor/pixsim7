import clsx from 'clsx';

import { Icon } from '@lib/icons';

export interface VariableEditPopoverProps {
  /** Canonical uppercase variable name. */
  name: string;
  /** Whether the name is already saved. */
  saved: boolean;
  /** Optional description shown for an already-saved variable (read-only here). */
  description?: string;
  /** Save the clicked token as a known variable. */
  onSave: () => void;
  /** Remove the saved variable. */
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * Editor variable popover — the click target for an uppercase VAR token in the
 * prompt. Scoped to the save/unsave gesture (description editing lives in the
 * analysis-panel modal). Mirrors OperatorEditPopover's chrome.
 */
export function VariableEditPopover({
  name,
  saved,
  description,
  onSave,
  onRemove,
  onCancel,
}: VariableEditPopoverProps) {
  return (
    <div
      className={clsx(
        'w-[240px] rounded-lg shadow-xl border overflow-hidden',
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
                : 'text-neutral-400 dark:text-neutral-500',
            )}
          >
            {saved ? (
              <>
                <Icon name="check" size={11} /> Saved
              </>
            ) : (
              'Not saved'
            )}
          </span>
        </div>
        <div className="mt-1 font-mono text-sm text-neutral-800 dark:text-neutral-200">{name}</div>
        {saved && description && (
          <div className="mt-1 text-[11px] italic text-neutral-500 dark:text-neutral-400">
            {description}
          </div>
        )}
        {!saved && (
          <div className="mt-1 text-[10px] text-neutral-400 italic">
            Save it to reuse this placeholder across prompts.
          </div>
        )}
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
        {saved ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={onSave}
            className="flex-1 px-2 py-1 rounded text-xs bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
          >
            Save variable
          </button>
        )}
      </div>
    </div>
  );
}
