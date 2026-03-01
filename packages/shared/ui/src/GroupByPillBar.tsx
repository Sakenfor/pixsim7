import { toggleInStack } from './groupByUtils';

export interface GroupByOption<T extends string = string> {
  value: T;
  label: string;
}

export interface GroupByPillBarProps<T extends string = string> {
  options: GroupByOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  onClear?: () => void;
  className?: string;
}

export function GroupByPillBar<T extends string = string>({
  options,
  selected,
  onToggle,
  onClear,
  className,
}: GroupByPillBarProps<T>) {
  const noneActive = selected.length === 0;

  return (
    <div className={`flex flex-wrap gap-1.5 items-center ${className ?? ''}`}>
      {/* "None" pill — shown when nothing selected */}
      <button
        type="button"
        onClick={onClear ? onClear : undefined}
        className={`px-2 py-1 text-xs rounded border transition-colors ${
          noneActive
            ? 'bg-accent border-accent text-accent-text'
            : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
        }`}
        disabled={noneActive}
      >
        None
      </button>

      {options.map((opt) => {
        const index = selected.indexOf(opt.value);
        const isSelected = index >= 0;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`px-2 py-1 text-xs rounded border transition-colors inline-flex items-center gap-1 ${
              isSelected
                ? 'bg-accent border-accent text-accent-text'
                : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
            }`}
          >
            <span>{opt.label}</span>
            {selected.length > 1 && isSelected && (
              <span className="text-[10px] px-1 rounded-full bg-white/20">
                {index + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
