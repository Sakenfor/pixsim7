/**
 * RelatedPromptsPopover — one button, two related views behind tabs:
 *   - "Similar" — semantic find-similar (SimilarPromptsBody), with a Find gate
 *     and tuning controls.
 *   - "Word variations" — per-word success deltas (VariantSuggestionsBody),
 *     auto-run on open.
 *
 * They share the same neighbour vector search underneath (see
 * similarPromptsSearchCache), so grouping them under one entry point matches how
 * they relate. Each tab keeps its own controls and fetch behaviour; the host
 * (PromptComposer) owns the search state and gates each hook's `open` on its tab.
 */

import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';

import { Icon } from '@lib/icons';

import type { SimilarPromptsSearch } from '../hooks/useSimilarPromptsSearch';
import type { VariantOutcomes } from '../hooks/useVariantOutcomes';

import { SimilarPromptsBody, type SimilarPromptsBodyProps } from './SimilarPromptsPopover';
import { VariantSuggestionsBody } from './VariantSuggestionsPopover';

export type RelatedPromptsTab = 'similar' | 'variants';

export interface RelatedPromptsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  tab: RelatedPromptsTab;
  onTabChange: (tab: RelatedPromptsTab) => void;
  /** Shared state from useSimilarPromptsSearch (Similar tab). */
  search: SimilarPromptsSearch;
  /** Shared state from useVariantOutcomes (Word variations tab). */
  outcomes: VariantOutcomes;
  onUse?: SimilarPromptsBodyProps['onUse'];
  onCompare?: SimilarPromptsBodyProps['onCompare'];
  onPromote?: SimilarPromptsBodyProps['onPromote'];
  onOpenFamilies?: SimilarPromptsBodyProps['onOpenFamilies'];
}

const TABS: { key: RelatedPromptsTab; label: string }[] = [
  { key: 'similar', label: 'Similar' },
  { key: 'variants', label: 'Word variations' },
];

export function RelatedPromptsPopover({
  open,
  onClose,
  anchor,
  triggerRef,
  tab,
  onTabChange,
  search,
  outcomes,
  onUse,
  onCompare,
  onPromote,
  onOpenFamilies,
}: RelatedPromptsPopoverProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      triggerRef={triggerRef}
      placement="bottom"
      align="end"
      offset={6}
      className="w-[360px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
        <Icon name="sparkles" size={12} className="text-neutral-400 dark:text-neutral-500" />
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTabChange(key)}
            className={clsx(
              'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              tab === key
                ? 'bg-accent/15 text-accent'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'similar' ? (
        <SimilarPromptsBody
          open={open}
          onClose={onClose}
          search={search}
          onUse={onUse}
          onCompare={onCompare}
          onPromote={onPromote}
          onOpenFamilies={onOpenFamilies}
        />
      ) : (
        <VariantSuggestionsBody outcomes={outcomes} />
      )}
    </Popover>
  );
}
