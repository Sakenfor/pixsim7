import { useEffect, useState } from 'react';

import { PRESET_CATEGORIES, isCanonicalPresetCategory } from './presetCategories';

const CUSTOM_SENTINEL = '__custom__';
const NONE_SENTINEL = '';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Tailwind class string applied to both the <select> and the custom <input>. */
  className?: string;
  /** Optional placeholder for the freeform input that shows on "Custom…". */
  customPlaceholder?: string;
  /** Allow choosing "no category". Defaults to true. */
  allowEmpty?: boolean;
  disabled?: boolean;
  /** id forwarded to the <select> so an external <label htmlFor> still works. */
  id?: string;
}

/**
 * Curated preset-category dropdown with a "Custom…" escape hatch.
 *
 * The persisted value is just the string — the component derives its UI mode
 * from whether `value` is canonical, empty, or a non-canonical custom string.
 * Picking "Custom…" reveals a text input alongside the dropdown so the user
 * can type a one-off label without losing the curated set.
 */
export function CategorySelect({
  value,
  onChange,
  className,
  customPlaceholder = 'Custom category…',
  allowEmpty = true,
  disabled,
  id,
}: CategorySelectProps) {
  // Whether the user has explicitly opted into custom mode this session.
  // Initialised from the incoming value so editing a preset that already has
  // a non-canonical category lands directly in custom mode.
  const [customMode, setCustomMode] = useState<boolean>(
    () => value !== '' && !isCanonicalPresetCategory(value),
  );

  // If the parent flips `value` to a canonical option (e.g. modal reset),
  // exit custom mode automatically. We don't auto-enter custom mode on a
  // non-canonical incoming value here — the initial state above already
  // handled the mount case, and forcing the flag on every parent change
  // would fight an in-progress edit where `value` is briefly empty.
  useEffect(() => {
    if (value !== '' && isCanonicalPresetCategory(value)) {
      setCustomMode(false);
    }
  }, [value]);

  const selectValue = customMode
    ? CUSTOM_SENTINEL
    : isCanonicalPresetCategory(value)
      ? value
      : NONE_SENTINEL;

  const handleSelectChange = (next: string) => {
    if (next === CUSTOM_SENTINEL) {
      setCustomMode(true);
      // Don't clobber an existing custom value if one happens to be present.
      if (isCanonicalPresetCategory(value)) onChange('');
      return;
    }
    setCustomMode(false);
    onChange(next);
  };

  return (
    <div className="flex gap-2">
      <select
        id={id}
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        disabled={disabled}
        className={className}
      >
        {allowEmpty && <option value={NONE_SENTINEL}>— Uncategorized —</option>}
        {PRESET_CATEGORIES.map((opt) => (
          <option key={opt.value} value={opt.value} title={opt.hint}>
            {opt.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>✏️ Custom…</option>
      </select>
      {customMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={customPlaceholder}
          disabled={disabled}
          className={className}
          autoFocus
        />
      )}
    </div>
  );
}
