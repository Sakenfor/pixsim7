import clsx from 'clsx';

import { applyTransform, buildTransformSpec, TRANSFORM_OPTIONS } from '../lib/variableTransforms';

export interface TransformPickerProps {
  /** Current substitution value text — the transform's base when set. */
  previewValue: string;
  /** Variable name — the transform's base when there is no value (so a
   *  value-less transform previews against the name, e.g. THEME → T__H__E__M__E). */
  fallbackText?: string;
  /** Selected transform id ('' = none). */
  transformId: string;
  /** Arg for an arg-taking transform (e.g. the separator for `spaced`). */
  transformArg: string;
  onSelect: (id: string) => void;
  onArgChange: (arg: string) => void;
}

/**
 * Shared transform selector used by both the token-click VariableEditPopover and
 * the VariableEditModal. Renders the None/transform buttons, an arg input for
 * arg-taking transforms, and a live preview of the result. Seeds the default arg
 * when an arg-taking option is first picked. The transform applies to the value
 * when one is set, otherwise to the variable name (fallbackText).
 */
export function TransformPicker({
  previewValue,
  fallbackText = '',
  transformId,
  transformArg,
  onSelect,
  onArgChange,
}: TransformPickerProps) {
  // Base the transform acts on: the value, or the name when there is no value.
  const base = previewValue.trim() || fallbackText.trim();
  const hasBase = base.length > 0;
  const selectedOption = TRANSFORM_OPTIONS.find((o) => o.id === transformId);
  const draftSpec = buildTransformSpec(transformId, transformArg);

  const handleSelect = (id: string) => {
    if (id) {
      const opt = TRANSFORM_OPTIONS.find((o) => o.id === id);
      if (opt?.takesArg && !transformArg) onArgChange(opt.argDefault ?? '');
    }
    onSelect(id);
  };

  const buttonClass = (active: boolean) =>
    clsx(
      'px-2 py-0.5 rounded text-[11px] border transition-colors',
      active
        ? 'bg-violet-500 text-white border-violet-500'
        : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800',
      !hasBase && 'cursor-not-allowed',
    );

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Transform</div>
      <div className={clsx('flex flex-wrap gap-1', !hasBase && 'opacity-40')}>
        <button
          type="button"
          disabled={!hasBase}
          onClick={() => handleSelect('')}
          className={buttonClass(transformId === '')}
        >
          None
        </button>
        {TRANSFORM_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={!hasBase}
            onClick={() => handleSelect(opt.id)}
            className={buttonClass(transformId === opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {hasBase && selectedOption?.takesArg && (
        <div className="mt-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400">{selectedOption.argLabel}</span>
            <input
              type="text"
              value={transformArg}
              onChange={(e) => onArgChange(e.target.value)}
              placeholder={selectedOption.argPlaceholder}
              className={clsx(
                'rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-1.5 py-0.5 text-[11px] font-mono text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-400',
                selectedOption.argWide ? 'min-w-0 flex-1' : 'w-20',
              )}
            />
          </div>
          {selectedOption.argHelp && (
            <p className="mt-1 text-[9px] text-neutral-400">{selectedOption.argHelp}</p>
          )}
        </div>
      )}

      {hasBase && draftSpec && (
        <p className="mt-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
          Preview:{' '}
          <span className="font-mono text-neutral-700 dark:text-neutral-200">
            {applyTransform(draftSpec, base)}
          </span>
          {!previewValue.trim() && (
            <span className="ml-1 not-italic text-neutral-400">(of the name)</span>
          )}
        </p>
      )}
    </div>
  );
}
