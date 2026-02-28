export interface ToolbarSelectProps<T extends string = string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  disabled?: boolean;
  className?: string;
}

export function ToolbarSelect<T extends string = string>({
  label,
  value,
  onChange,
  options,
  disabled,
  className = '',
}: ToolbarSelectProps<T>) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <select
        className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
