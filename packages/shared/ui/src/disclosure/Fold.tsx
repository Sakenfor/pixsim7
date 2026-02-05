/**
 * Fold - Inline text/content folding component
 *
 * Unlike DisclosureSection (UI panels), Fold is designed for inline use
 * within text content, similar to code folding in IDEs.
 *
 * Use cases:
 * - Fold sentences/paragraphs in parsed prompts
 * - Collapse nested parameters in JSON/config views
 * - Hide verbose sections inline while showing a summary
 */

import * as React from 'react';
import clsx from 'clsx';

// ============================================================================
// Fold - Single inline foldable region
// ============================================================================

export interface FoldProps {
  /** Content to show when expanded */
  children: React.ReactNode;
  /** Summary shown when folded (defaults to "..." or truncated content) */
  summary?: React.ReactNode;
  /** Controlled open state */
  isOpen?: boolean;
  /** Initial open state (uncontrolled) */
  defaultOpen?: boolean;
  /** Callback when toggled */
  onToggle?: (isOpen: boolean) => void;
  /** Additional class for the container */
  className?: string;
  /** Additional class for the summary/trigger */
  summaryClassName?: string;
  /** Additional class for the expanded content */
  contentClassName?: string;
  /** Show fold indicator even when expanded */
  showIndicatorWhenOpen?: boolean;
  /** Indicator style */
  indicator?: 'dots' | 'bracket' | 'chevron' | 'none';
  /** Make the entire content clickable to toggle (vs just the indicator) */
  clickableContent?: boolean;
}

/**
 * Inline foldable region for text content
 *
 * @example
 * ```tsx
 * <p>
 *   This is the intro.
 *   <Fold summary="[2 more sentences]">
 *     This is a longer explanation that can be hidden.
 *     And this is another sentence with more detail.
 *   </Fold>
 * </p>
 * ```
 */
export function Fold({
  children,
  summary,
  isOpen: controlledIsOpen,
  defaultOpen = false,
  onToggle,
  className,
  summaryClassName,
  contentClassName,
  showIndicatorWhenOpen = false,
  indicator = 'dots',
  clickableContent = false,
}: FoldProps) {
  const [internalIsOpen, setInternalIsOpen] = React.useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleToggle = React.useCallback(() => {
    if (isControlled) {
      onToggle?.(!isOpen);
    } else {
      setInternalIsOpen((prev) => {
        const next = !prev;
        onToggle?.(next);
        return next;
      });
    }
  }, [isControlled, isOpen, onToggle]);

  const indicatorElement = React.useMemo(() => {
    if (indicator === 'none') return null;

    const indicators = {
      dots: isOpen ? '⋯' : '…',
      bracket: isOpen ? '⌄' : '⌵',
      chevron: isOpen ? '▾' : '▸',
    };

    return (
      <span
        className={clsx(
          'fold-indicator',
          'inline-flex items-center justify-center',
          'w-4 h-4 text-[10px] leading-none',
          'rounded cursor-pointer select-none',
          'text-neutral-500 dark:text-neutral-400',
          'hover:text-neutral-700 dark:hover:text-neutral-200',
          'hover:bg-neutral-200 dark:hover:bg-neutral-700',
          'transition-colors'
        )}
        onClick={handleToggle}
        role="button"
        aria-expanded={isOpen}
        title={isOpen ? 'Collapse' : 'Expand'}
      >
        {indicators[indicator]}
      </span>
    );
  }, [indicator, isOpen, handleToggle]);

  // Folded state - show summary
  if (!isOpen) {
    return (
      <span
        className={clsx(
          'fold fold--collapsed',
          'inline-flex items-center gap-0.5',
          clickableContent && 'cursor-pointer',
          className
        )}
        onClick={clickableContent ? handleToggle : undefined}
      >
        {indicatorElement}
        {summary && (
          <span
            className={clsx(
              'fold-summary',
              'text-neutral-500 dark:text-neutral-400',
              'text-[0.9em] italic',
              summaryClassName
            )}
          >
            {summary}
          </span>
        )}
      </span>
    );
  }

  // Expanded state - show content
  return (
    <span
      className={clsx(
        'fold fold--expanded',
        'inline',
        clickableContent && 'cursor-pointer',
        className
      )}
      onClick={clickableContent ? handleToggle : undefined}
    >
      {showIndicatorWhenOpen && indicatorElement}
      <span className={clsx('fold-content', contentClassName)}>{children}</span>
    </span>
  );
}

// ============================================================================
// FoldGroup - Manage multiple folds together
// ============================================================================

export interface FoldGroupContextValue {
  openIds: Set<string>;
  toggle: (id: string) => void;
  isOpen: (id: string) => boolean;
  expandAll: () => void;
  collapseAll: () => void;
}

export const FoldGroupContext = React.createContext<FoldGroupContextValue | null>(null);

export interface FoldGroupProps {
  children: React.ReactNode;
  /** Allow multiple folds open (false = accordion) */
  allowMultiple?: boolean;
  /** Initially open fold IDs */
  defaultOpenIds?: string[];
  /** Callback when any fold changes */
  onToggle?: (id: string, isOpen: boolean) => void;
  /** Render prop for controls */
  renderControls?: (ctx: { expandAll: () => void; collapseAll: () => void; openCount: number }) => React.ReactNode;
}

/**
 * Group multiple Fold components with shared state
 *
 * @example
 * ```tsx
 * <FoldGroup
 *   allowMultiple={false}
 *   renderControls={({ expandAll, collapseAll }) => (
 *     <div>
 *       <button onClick={expandAll}>Expand All</button>
 *       <button onClick={collapseAll}>Collapse All</button>
 *     </div>
 *   )}
 * >
 *   <GroupedFold id="a" summary="Section A...">Content A</GroupedFold>
 *   <GroupedFold id="b" summary="Section B...">Content B</GroupedFold>
 * </FoldGroup>
 * ```
 */
export function FoldGroup({
  children,
  allowMultiple = true,
  defaultOpenIds = [],
  onToggle,
  renderControls,
}: FoldGroupProps) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => new Set(defaultOpenIds));
  const allIdsRef = React.useRef<Set<string>>(new Set());

  const toggle = React.useCallback(
    (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        const willBeOpen = !next.has(id);

        if (willBeOpen) {
          if (!allowMultiple) next.clear();
          next.add(id);
        } else {
          next.delete(id);
        }

        onToggle?.(id, willBeOpen);
        return next;
      });
    },
    [allowMultiple, onToggle]
  );

  const isOpen = React.useCallback((id: string) => openIds.has(id), [openIds]);

  const expandAll = React.useCallback(() => {
    setOpenIds(new Set(allIdsRef.current));
  }, []);

  const collapseAll = React.useCallback(() => {
    setOpenIds(new Set());
  }, []);

  // Track all registered fold IDs
  const registerFold = React.useCallback((id: string) => {
    allIdsRef.current.add(id);
    return () => allIdsRef.current.delete(id);
  }, []);

  const value = React.useMemo(
    () => ({ openIds, toggle, isOpen, expandAll, collapseAll }),
    [openIds, toggle, isOpen, expandAll, collapseAll]
  );

  return (
    <FoldGroupContext.Provider value={value}>
      {renderControls?.({ expandAll, collapseAll, openCount: openIds.size })}
      {children}
    </FoldGroupContext.Provider>
  );
}

// ============================================================================
// GroupedFold - Fold that participates in a FoldGroup
// ============================================================================

export interface GroupedFoldProps extends Omit<FoldProps, 'isOpen' | 'onToggle' | 'defaultOpen'> {
  /** Unique ID within the group */
  id: string;
}

/**
 * Fold component that syncs with parent FoldGroup
 */
export function GroupedFold({ id, ...props }: GroupedFoldProps) {
  const group = React.useContext(FoldGroupContext);

  if (!group) {
    console.warn('GroupedFold must be used within a FoldGroup');
    return <Fold {...props} />;
  }

  return (
    <Fold
      {...props}
      isOpen={group.isOpen(id)}
      onToggle={() => group.toggle(id)}
    />
  );
}

// ============================================================================
// FoldRegions - Render text with multiple fold regions
// ============================================================================

export interface FoldRegion {
  /** Unique ID */
  id: string;
  /** Start index in text */
  start: number;
  /** End index in text */
  end: number;
  /** Summary when folded */
  summary?: string;
  /** Default open state */
  defaultOpen?: boolean;
}

export interface FoldRegionsProps {
  /** Full text content */
  text: string;
  /** Regions to make foldable */
  regions: FoldRegion[];
  /** Props passed to each Fold */
  foldProps?: Partial<FoldProps>;
  /** Wrapper class */
  className?: string;
}

/**
 * Render text with multiple foldable regions
 *
 * @example
 * ```tsx
 * <FoldRegions
 *   text="Hello world. This is a long explanation. And more text."
 *   regions={[
 *     { id: 'middle', start: 13, end: 42, summary: '[...]' }
 *   ]}
 * />
 * ```
 */
export function FoldRegions({ text, regions, foldProps, className }: FoldRegionsProps) {
  // Sort regions by start position
  const sortedRegions = React.useMemo(
    () => [...regions].sort((a, b) => a.start - b.start),
    [regions]
  );

  // Build segments
  const segments = React.useMemo(() => {
    const result: Array<{ type: 'text' | 'fold'; content: string; region?: FoldRegion }> = [];
    let lastEnd = 0;

    for (const region of sortedRegions) {
      // Text before this region
      if (region.start > lastEnd) {
        result.push({
          type: 'text',
          content: text.slice(lastEnd, region.start),
        });
      }

      // The fold region
      result.push({
        type: 'fold',
        content: text.slice(region.start, region.end),
        region,
      });

      lastEnd = region.end;
    }

    // Text after last region
    if (lastEnd < text.length) {
      result.push({
        type: 'text',
        content: text.slice(lastEnd),
      });
    }

    return result;
  }, [text, sortedRegions]);

  return (
    <span className={clsx('fold-regions', className)}>
      {segments.map((segment, i) =>
        segment.type === 'text' ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <Fold
            key={segment.region!.id}
            summary={segment.region!.summary}
            defaultOpen={segment.region!.defaultOpen}
            {...foldProps}
          >
            {segment.content}
          </Fold>
        )
      )}
    </span>
  );
}
