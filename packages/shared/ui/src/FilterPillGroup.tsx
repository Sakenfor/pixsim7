/**
 * FilterPillGroup - Single-select filter pill buttons
 *
 * A row of toggle buttons for filtering data by category. Supports an optional
 * "All" pill, per-option counts, and wrapping on small containers.
 *
 * @example Basic usage
 * ```tsx
 * <FilterPillGroup
 *   options={[
 *     { value: 'world-tool', label: 'World Tools', count: 5 },
 *     { value: 'helper', label: 'Helpers', count: 3 },
 *   ]}
 *   value={familyFilter}
 *   onChange={setFamilyFilter}
 *   allLabel="All"
 * />
 * ```
 *
 * @example Without "All" and without counts
 * ```tsx
 * <FilterPillGroup
 *   options={families.map(f => ({ value: f, label: f }))}
 *   value={selected}
 *   onChange={setSelected}
 * />
 * ```
 */

import clsx from 'clsx';

export interface FilterPillOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export interface FilterPillGroupProps<T extends string = string> {
  /** Available filter options */
  options: FilterPillOption<T>[];
  /** Currently selected value, or null for "All" */
  value: T | null;
  /** Called when selection changes. Passes null when "All" is selected. */
  onChange: (value: T | null) => void;
  /** Label for the "All" option. If omitted, no "All" pill is rendered. */
  allLabel?: string;
  /** Total count shown on the "All" pill. If omitted, sums option counts. */
  allCount?: number;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional className for the wrapper */
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2 py-1 text-xs gap-1.5',
} as const;

/**
 * Single-select filter pill group for category/family/tag filtering.
 */
export function FilterPillGroup<T extends string = string>({
  options,
  value,
  onChange,
  allLabel,
  allCount,
  size = 'md',
  className,
}: FilterPillGroupProps<T>) {
  const sizeClass = SIZE_CLASSES[size];
  const resolvedAllCount = allCount ?? options.reduce((sum, o) => sum + (o.count ?? 0), 0);
  const showAllCount = allCount !== undefined || options.some((o) => o.count !== undefined);

  return (
    <div className={clsx('flex flex-wrap', size === 'sm' ? 'gap-1' : 'gap-1.5', className)}>
      {allLabel && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={clsx(
            'rounded border transition-colors',
            sizeClass,
            value === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-blue-400',
          )}
        >
          {allLabel}
          {showAllCount && ` (${resolvedAllCount})`}
        </button>
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={clsx(
            'rounded border transition-colors',
            sizeClass,
            value === option.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:border-blue-400',
          )}
        >
          {option.label}
          {option.count !== undefined && ` (${option.count})`}
        </button>
      ))}
    </div>
  );
}
