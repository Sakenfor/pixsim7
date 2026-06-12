import clsx from 'clsx';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import type {
  RelationRecipe,
  RelationRecipeOperator,
} from '../hooks/useRelationRecipes';
import type { OperatorRange } from '../lib/operatorEditExtension';

/** Resolved typing of one chain operand flanking the operator. */
export interface OperandTyping {
  /** Operand class (e.g. `ACTOR`). */
  kind: string;
  /** Leading facet token (e.g. `HIP`), when the operand is facet-typed. */
  facet?: string;
  /** Human label for the resolved facet (vocab value / axis), for the title. */
  label?: string;
  /** Whether the facet resolves against the class's facet axes. */
  known: boolean;
}

export interface OperatorEditPopoverProps {
  operator: OperatorRange;
  /**
   * Resolved facet typing of the operands flanking this operator, when they're
   * facet-typed vars. Surfaces the relation as operating over typed operands
   * (`ACTOR1_HIP < ACTOR2_HIP` = a relation over anatomy-typed operands).
   */
  operands?: { lhs?: OperandTyping; rhs?: OperandTyping };
  /** Universal swap targets from grammar.operator_vocabulary. Always allowed. */
  swapTargets: string[];
  /** Run length cap from grammar.operator_vocabulary. */
  maxRunLength: number;
  /** Optional recipe match (semantic enrichment for known contexts). */
  recipe?: RelationRecipe | null;
  /** Recipe operator entry matching the clicked op (if any). */
  recipeOp?: RelationRecipeOperator | null;
  /** Apply: replace the operator's char range with `op.repeat(run)`. */
  onApply: (newOp: string, newRun: number) => void;
  onCancel: () => void;
}

function inferBaseChar(raw: string): string {
  if (raw.length === 0) return '=';
  const last = raw[raw.length - 1];
  const first = raw[0];
  if (last === '<' || last === '>') return last;
  return first;
}

const CONTEXT_LABEL: Record<OperatorRange['context'], string> = {
  chain: 'Chain',
  colon: 'Section header',
  angle_bracket: 'Bracket header',
  freestanding: 'Freestanding header',
  // `access` operators are routed to the facet popover, never this one — keyed
  // only to satisfy the exhaustive Record over the context union.
  access: 'Access',
};

/** One operand chip — class plus the facet token coloured by recognition. */
function OperandChip({ t }: { t?: OperandTyping }) {
  if (!t) return <span className="text-neutral-400">—</span>;
  return (
    <span className="inline-flex items-center font-mono" title={t.label}>
      <span className="text-neutral-600 dark:text-neutral-300">{t.kind}</span>
      {t.facet && (
        <>
          <span className="text-neutral-400">_</span>
          <span
            className={clsx(
              t.known
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-amber-600 dark:text-amber-500',
            )}
          >
            {t.facet}
          </span>
        </>
      )}
    </span>
  );
}

export function OperatorEditPopover({
  operator,
  operands,
  swapTargets,
  maxRunLength,
  recipe,
  recipeOp,
  onApply,
  onCancel,
}: OperatorEditPopoverProps) {
  const hasFacetOperand = !!(operands?.lhs?.facet || operands?.rhs?.facet);
  const baseChar = inferBaseChar(operator.raw);
  const [selectedOp, setSelectedOp] = useState<string>(baseChar);
  const [run, setRun] = useState<number>(Math.max(1, operator.run));

  const newRaw = selectedOp.repeat(run);
  const isUnchanged = newRaw === operator.raw;

  // Recommended swaps come from the recipe (de-duped, ordered first).
  const recommended = recipeOp?.swap_targets ?? [];
  const universal = swapTargets.filter((t) => !recommended.includes(t));

  // Run-length semantic label, if the recipe defines one for the current run.
  const runSemanticLabel = recipeOp?.run_semantics?.[String(run)];

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      {/* Header — recipe label + raw op */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
          <span>
            {recipe?.label ?? CONTEXT_LABEL[operator.context]}
          </span>
          <span className="font-mono text-neutral-600 dark:text-neutral-300 normal-case tracking-normal">
            {operator.raw}
          </span>
        </div>
        {recipeOp?.meaning && (
          <div className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 italic">
            {recipeOp.meaning}
          </div>
        )}
        {!recipeOp && (
          <div className="mt-1 text-[10px] text-neutral-400 italic">
            Unrecognised — type-swap remains permissive
          </div>
        )}
      </div>

      {/* Operands — the facet-typed sides of the relation */}
      {hasFacetOperand && (
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
            Operands
          </div>
          <div className="flex items-center gap-2 text-xs">
            <OperandChip t={operands?.lhs} />
            <span className="font-mono text-violet-600 dark:text-violet-400">{operator.raw}</span>
            <OperandChip t={operands?.rhs} />
          </div>
          <p className="mt-1 text-[10px] text-neutral-400 italic">
            Relation over facet-typed operands.
          </p>
        </div>
      )}

      {/* Type swap — recommended first, universal as fallback row */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
          {recommended.length > 0 ? 'Recommended' : 'Type'}
        </div>
        <div className="flex flex-wrap gap-1">
          {recommended.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => setSelectedOp(target)}
              className={clsx(
                'px-2 py-1 rounded text-xs font-mono transition-colors',
                target === selectedOp
                  ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-400'
                  : 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40',
              )}
            >
              {target}
            </button>
          ))}
        </div>
        {universal.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 mt-2 mb-1.5">
              Other
            </div>
            <div className="flex flex-wrap gap-1">
              {universal.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setSelectedOp(target)}
                  className={clsx(
                    'px-2 py-1 rounded text-xs font-mono transition-colors',
                    target === selectedOp
                      ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700',
                  )}
                >
                  {target}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Length stepper */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">Length</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRun(Math.max(1, run - 1))}
            disabled={run <= 1}
            className="w-7 h-7 flex items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Icon name="minus" size={12} />
          </button>
          <div className="flex-1 text-center font-mono text-sm tabular-nums text-neutral-700 dark:text-neutral-300">
            {run}
          </div>
          <button
            type="button"
            onClick={() => setRun(Math.min(maxRunLength, run + 1))}
            disabled={run >= maxRunLength}
            className="w-7 h-7 flex items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Icon name="plus" size={12} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px]">
          <span className="font-mono text-neutral-400">→ {newRaw || '—'}</span>
          {runSemanticLabel && (
            <span className="text-violet-500 dark:text-violet-400 italic">
              {runSemanticLabel}
            </span>
          )}
        </div>
      </div>

      {/* Notes — surface findings recorded for this operator/recipe */}
      {(recipeOp?.notes && recipeOp.notes.length > 0) ||
      (recipe?.notes && recipe.notes.length > 0) ? (
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 max-h-[120px] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
            Notes
          </div>
          <div className="space-y-1.5">
            {(recipeOp?.notes ?? []).concat(recipe?.notes ?? []).map((note, i) => (
              <div
                key={i}
                className="text-[11px] leading-snug text-neutral-700 dark:text-neutral-300"
              >
                {note.model && (
                  <span className="inline-block mr-1 px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[9px] text-neutral-500">
                    {note.model}
                  </span>
                )}
                {note.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Footer — actions */}
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-2 py-1 rounded text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(selectedOp, run)}
          disabled={isUnchanged}
          className="flex-1 px-2 py-1 rounded text-xs bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
