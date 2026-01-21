import clsx from 'clsx';
import { useMemo } from 'react';

import type { ParamSpec } from '@lib/generation-ui';

/**
 * ParamSpec type has been moved to @lib/generation-ui for better reusability.
 * Re-exported here for backward compatibility.
 *
 * @deprecated Import from '@lib/generation-ui' instead
 */
export type { ParamSpec } from '@lib/generation-ui';

export interface DynamicParamFormProps {
  specs: ParamSpec[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  operationType?: string;
}

// Group params for better UX
const GROUP_ORDER = ['core', 'render', 'style', 'advanced', 'other'];
const GROUP_LABELS: Record<string, string> = {
  core: 'Core Settings',
  render: 'Render Settings',
  style: 'Style & Quality',
  advanced: 'Advanced',
  other: 'Other',
};

export function DynamicParamForm({ specs, values, onChange, disabled = false }: DynamicParamFormProps) {
  // Group parameters
  const grouped = useMemo(() => {
    const groups: Record<string, ParamSpec[]> = {};
    specs.forEach(spec => {
      const group = spec.group || 'other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(spec);
    });
    return groups;
  }, [specs]);

  const sortedGroups = useMemo(() => {
    return GROUP_ORDER.filter(g => grouped[g]?.length);
  }, [grouped]);

  function renderField(spec: ParamSpec) {
    const value = values[spec.name] ?? spec.default ?? '';
    const hasError = spec.required && !value;

    // Enum/select field
    if (spec.enum && Array.isArray(spec.enum)) {
      return (
        <select
          value={value}
          onChange={(e) => onChange(spec.name, e.target.value)}
          disabled={disabled}
          className={clsx(
            'w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            hasError && 'border-red-500'
          )}
          aria-label={spec.description || spec.name}
          aria-required={spec.required}
        >
          {!spec.required && <option value="">None</option>}
          {spec.enum.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // Boolean field
    if (spec.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(spec.name, e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 disabled:opacity-50"
            aria-label={spec.description || spec.name}
          />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            {spec.description || spec.name}
          </span>
        </label>
      );
    }

    // Number field
    if (spec.type === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(spec.name, e.target.value ? Number(e.target.value) : '')}
          disabled={disabled}
          min={spec.min}
          max={spec.max}
          placeholder={spec.default?.toString()}
          className={clsx(
            'w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            hasError && 'border-red-500'
          )}
          aria-label={spec.description || spec.name}
          aria-required={spec.required}
        />
      );
    }

    // Text field (default)
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(spec.name, e.target.value)}
        disabled={disabled}
        placeholder={spec.default?.toString()}
        className={clsx(
          'w-full p-2 text-sm border rounded bg-white dark:bg-neutral-900',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          hasError && 'border-red-500'
        )}
        aria-label={spec.description || spec.name}
        aria-required={spec.required}
      />
    );
  }

  if (!specs.length) {
    return (
      <div className="text-xs text-neutral-500 italic">
        No additional parameters for this operation
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedGroups.map(groupKey => (
        <div key={groupKey} className="space-y-2">
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
            {GROUP_LABELS[groupKey] || groupKey}
          </div>
          <div className="space-y-3">
            {grouped[groupKey].map(spec => (
              <div key={spec.name} className="space-y-1">
                <label className="flex items-center gap-1 text-xs text-neutral-700 dark:text-neutral-300">
                  <span>{spec.name.replace(/_/g, ' ')}</span>
                  {spec.required && <span className="text-red-500">*</span>}
                  {spec.description && (
                    <span className="text-neutral-500" title={spec.description}>ⓘ</span>
                  )}
                </label>
                {renderField(spec)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
