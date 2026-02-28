export interface SegmentedControlProps<T extends string = string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  label,
  value,
  onChange,
  options,
  disabled,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              value === opt.value
                ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900'
                : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
