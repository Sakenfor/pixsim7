import clsx from 'clsx';

import { Icon } from '@lib/icons';

import type { FacetSuggestion, ResolvedFacet } from '../lib/facetRecognition';
import { getVariableClassVisual } from '../lib/variableClassVisuals';

export interface FacetEditPopoverProps {
  /** The owning var token, e.g. `ACTOR1_HIP`. */
  varName: string;
  /** The entity class, e.g. `ACTOR`. */
  className: string;
  /** Recognition result for the clicked facet token. */
  resolved: ResolvedFacet;
  /** Available facets for this class (axes + concrete vocab values) — shown as
   *  hints when the typed facet is unrecognised. */
  suggestions: FacetSuggestion[];
  onClose: () => void;
}

/**
 * Facet popover — the click target for the intra-token `_` access operator
 * (the `_` in `ACTOR1_HIP`). Read-only/informational: it surfaces whether the
 * facet after the `_` is *recognised* against the class's facet set, what it
 * resolved to (a named axis or a concrete vocab value), and — when it isn't —
 * what facets the class does offer. Mirrors OperatorEditPopover's chrome.
 */
export function FacetEditPopover({
  varName,
  className,
  resolved,
  suggestions,
  onClose,
}: FacetEditPopoverProps) {
  const visual = getVariableClassVisual(varName);
  const isValue = resolved.known && resolved.valueId !== undefined;
  const isAxis = resolved.known && !isValue;

  // De-dupe suggestion chips by token; cap so an unrecognised facet on a
  // vocab-heavy class doesn't render hundreds of values.
  const chips = suggestions.slice(0, 12);

  return (
    <div
      className={clsx(
        'w-[260px] rounded-lg shadow-xl border overflow-hidden',
        'bg-white dark:bg-neutral-900',
        'border-neutral-200 dark:border-neutral-700',
      )}
    >
      {/* Header — owning var + facet token */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400">
          <span>Facet</span>
          <span
            className={clsx(
              'inline-flex items-center gap-1 normal-case tracking-normal',
              resolved.known
                ? 'text-violet-600 dark:text-violet-400'
                : 'text-neutral-400 dark:text-neutral-500',
            )}
          >
            {resolved.known ? (
              <>
                <Icon name="check" size={11} /> {isValue ? 'Value' : 'Axis'}
              </>
            ) : (
              'Unrecognised'
            )}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {visual && (
            <span className="inline-flex items-center gap-1">
              <span className={clsx('w-2 h-2 rounded-full', visual.dotClass)} />
              <Icon name={visual.icon} size={13} className="text-neutral-500" />
            </span>
          )}
          <span className="font-mono text-sm text-neutral-800 dark:text-neutral-200">
            {className}
            <span className="text-neutral-400">_</span>
            <span className="text-violet-600 dark:text-violet-400">{resolved.facet}</span>
          </span>
        </div>
      </div>

      {/* Recognition — what the facet resolved to */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        {isValue ? (
          <div className="text-xs text-neutral-700 dark:text-neutral-300">
            Resolves to{' '}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {resolved.valueLabel ?? resolved.valueId}
            </span>
            {resolved.axis && (
              <span className="text-neutral-400">
                {' '}
                · {resolved.axis.label ?? resolved.axis.name} axis
              </span>
            )}
          </div>
        ) : isAxis ? (
          <div className="text-xs text-neutral-700 dark:text-neutral-300">
            Known{' '}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {resolved.axis?.label ?? resolved.facet}
            </span>{' '}
            axis
            {resolved.axis?.source.kind === 'vocab' && (
              <span className="text-neutral-400"> · {resolved.axis.source.category}</span>
            )}
            {resolved.axis?.source.kind === 'freeform' && (
              <span className="text-neutral-400"> · freeform</span>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-neutral-400 italic">
            Not a known facet of {className}.
          </div>
        )}
      </div>

      {/* Hints — facets this class offers (chips) */}
      {chips.length > 0 && (
        <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 max-h-[140px] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">
            {className} facets
          </div>
          <div className="flex flex-wrap gap-1">
            {chips.map((s) => (
              <span
                key={`${s.kind}:${s.value}`}
                title={`${s.label} · ${s.detail}`}
                className={clsx(
                  'px-1.5 py-0.5 rounded text-[11px] font-mono',
                  s.value === resolved.facet
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-400'
                    : s.kind === 'axis'
                      ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
                )}
              >
                {s.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-2 py-1 rounded text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
