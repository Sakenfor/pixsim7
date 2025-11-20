import { useState } from 'react';
import clsx from 'clsx';

export interface ArrayFieldInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  minItems?: number;
}

export function ArrayFieldInput({
  value = [],
  onChange,
  placeholder = 'Enter value',
  disabled = false,
  label,
  minItems = 0,
}: ArrayFieldInputProps) {
  const [items, setItems] = useState<string[]>(value.length ? value : ['']);

  function updateItem(index: number, val: string) {
    const next = [...items];
    next[index] = val;
    setItems(next);
    // Filter out empty strings for the value passed up
    onChange(next.filter(s => s.trim()));
  }

  function addItem() {
    const next = [...items, ''];
    setItems(next);
  }

  function removeItem(index: number) {
    if (items.length <= Math.max(1, minItems)) return;
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    onChange(next.filter(s => s.trim()));
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-center">
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={`${placeholder} ${index + 1}`}
              disabled={disabled}
              className={clsx(
                'flex-1 p-2 text-sm border rounded bg-white dark:bg-neutral-900',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
            {items.length > Math.max(1, minItems) && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={disabled}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                aria-label={`Remove item ${index + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        disabled={disabled}
        className={clsx(
          'text-xs px-3 py-1.5 rounded border border-dashed',
          'text-neutral-600 dark:text-neutral-400',
          'hover:bg-neutral-50 dark:hover:bg-neutral-800',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        + Add item
      </button>
    </div>
  );
}
