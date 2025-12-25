/**
 * Setting Field Renderer
 *
 * Renders individual setting fields based on their type.
 */

import type {
  SettingField,
  ToggleSettingField,
  SelectSettingField,
  RangeSettingField,
  NumberSettingField,
  TextSettingField,
  CustomSettingField,
} from '../../lib/core/types';

interface SettingFieldRendererProps {
  field: SettingField;
  value: any;
  onChange: (value: any) => void;
  allValues: Record<string, any>;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative" />
    </label>
  );
}

function ToggleField({ field, value, onChange, disabled }: {
  field: ToggleSettingField;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleSwitch
      checked={value ?? field.defaultValue ?? false}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function SelectField({ field, value, onChange, disabled }: {
  field: SelectSettingField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? field.defaultValue ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {field.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function RangeField({ field, value, onChange, disabled }: {
  field: RangeSettingField;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const currentValue = value ?? field.defaultValue ?? field.min;
  const displayValue = field.format ? field.format(currentValue) : String(currentValue);

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={currentValue}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-24 h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span className="text-[11px] text-neutral-600 dark:text-neutral-400 w-12 text-right">
        {displayValue}
      </span>
    </div>
  );
}

function NumberField({ field, value, onChange, disabled }: {
  field: NumberSettingField;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      value={value ?? field.defaultValue ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      placeholder={field.placeholder}
      disabled={disabled}
      className="w-20 px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

function TextField({ field, value, onChange, disabled }: {
  field: TextSettingField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value ?? field.defaultValue ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      disabled={disabled}
      className="w-48 px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

function CustomField({ field, value, onChange, disabled }: {
  field: CustomSettingField;
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const Component = field.component;
  return <Component value={value ?? field.defaultValue} onChange={onChange} disabled={disabled} />;
}

export function SettingFieldRenderer({ field, value, onChange, allValues }: SettingFieldRendererProps) {
  // Check showWhen condition
  if (field.showWhen && !field.showWhen(allValues)) {
    return null;
  }

  // Determine if disabled
  const isDisabled = typeof field.disabled === 'function'
    ? field.disabled(allValues)
    : field.disabled ?? false;

  // Render the control based on type
  const renderControl = () => {
    switch (field.type) {
      case 'toggle':
        return <ToggleField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'select':
        return <SelectField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'range':
        return <RangeField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'number':
        return <NumberField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'text':
        return <TextField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'custom':
        return <CustomField field={field} value={value} onChange={onChange} disabled={isDisabled} />;
      case 'color':
        return (
          <input
            type="color"
            value={value ?? field.defaultValue ?? '#000000'}
            onChange={(e) => onChange(e.target.value)}
            disabled={isDisabled}
            className="w-8 h-8 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        );
      default:
        return <span className="text-red-500">Unknown field type</span>;
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100 flex items-center gap-1.5">
          {field.label}
          {field.requiresRestart && (
            <span className="text-[9px] px-1 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
              restart
            </span>
          )}
        </div>
        {field.description && (
          <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
            {field.description}
          </div>
        )}
      </div>
      {renderControl()}
    </div>
  );
}
