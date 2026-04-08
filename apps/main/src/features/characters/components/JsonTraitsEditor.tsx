import { Button, Input } from '@pixsim7/shared.ui';
import { useMemo, useRef, useState } from 'react';

export interface KeyHint {
  key: string;
  /** Default/placeholder value from species or system */
  default?: string | null;
  /** Where this key comes from */
  origin?: 'template' | 'anatomy' | 'priority' | 'common';
}

export interface JsonTraitsEditorProps {
  traits: Record<string, unknown>;
  onChange: (traits: Record<string, unknown>) => void;
  /** Simple key name suggestions (legacy) */
  suggestedKeys?: string[];
  /** Rich key hints with defaults and origin */
  keyHints?: KeyHint[];
}

const ORIGIN_LABELS: Record<string, string> = {
  template: 'used in template',
  anatomy: 'species anatomy',
  priority: 'visual priority',
  common: 'common',
};

export function JsonTraitsEditor({ traits, onChange, suggestedKeys, keyHints }: JsonTraitsEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = Object.entries(traits);

  // Merge legacy suggestedKeys into keyHints format
  const allHints = useMemo<KeyHint[]>(() => {
    if (keyHints && keyHints.length > 0) return keyHints;
    if (suggestedKeys) return suggestedKeys.map((key) => ({ key }));
    return [];
  }, [keyHints, suggestedKeys]);

  // Hints for keys not already in traits
  const unusedHints = useMemo(
    () => allHints.filter((h) => !(h.key in traits)),
    [allHints, traits],
  );

  // Filtered by what user is typing
  const filteredHints = useMemo(() => {
    const q = newKey.trim().toLowerCase();
    if (!q) return unusedHints;
    return unusedHints.filter((h) => h.key.toLowerCase().includes(q));
  }, [unusedHints, newKey]);

  // Hint lookup for placeholder values on existing keys
  const hintMap = useMemo(() => {
    const map = new Map<string, KeyHint>();
    for (const h of allHints) map.set(h.key, h);
    return map;
  }, [allHints]);

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...traits, [key]: value });
  };

  const handleKeyRename = (oldKey: string, newKeyName: string) => {
    if (!newKeyName || newKeyName === oldKey) return;
    const updated = { ...traits };
    const val = updated[oldKey];
    delete updated[oldKey];
    updated[newKeyName] = val;
    onChange(updated);
  };

  const handleDelete = (key: string) => {
    const updated = { ...traits };
    delete updated[key];
    onChange(updated);
  };

  const handleAdd = (key?: string, defaultValue?: string | null) => {
    const k = key || newKey.trim();
    if (!k || k in traits) return;
    onChange({ ...traits, [k]: defaultValue ?? '' });
    setNewKey('');
    setShowDropdown(false);
  };

  const handleAddFromHint = (hint: KeyHint) => {
    handleAdd(hint.key, hint.default);
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const hint = hintMap.get(key);
        return (
          <div key={key} className="flex items-start gap-2">
            <div className="w-40 shrink-0">
              <Input
                size="sm"
                defaultValue={key}
                onBlur={(e) => handleKeyRename(key, e.target.value)}
              />
              {hint?.origin && (
                <span className="text-[10px] text-neutral-600 pl-1">
                  {ORIGIN_LABELS[hint.origin] ?? hint.origin}
                </span>
              )}
            </div>
            <Input
              size="sm"
              className="flex-1"
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              onChange={(e) => handleValueChange(key, e.target.value)}
              placeholder={hint?.default ?? undefined}
            />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleDelete(key)}
              className="text-red-400 hover:text-red-300 shrink-0 mt-1"
            >
              &times;
            </Button>
          </div>
        );
      })}

      {/* New key input with autocomplete dropdown */}
      <div className="relative pt-1">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            size="sm"
            className="w-40 shrink-0"
            placeholder="New key..."
            value={newKey}
            onChange={(e) => {
              setNewKey(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => setShowDropdown(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setShowDropdown(false);
            }}
          />
          <Button variant="ghost" size="xs" onClick={() => handleAdd()}>
            + Add field
          </Button>
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && filteredHints.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-72 max-h-48 overflow-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-xl">
            {filteredHints.map((hint) => (
              <button
                key={hint.key}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-750 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault(); // Keep focus, prevent onBlur
                  handleAddFromHint(hint);
                }}
              >
                <span className="text-neutral-200">{hint.key}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  {hint.default && (
                    <span className="max-w-[120px] truncate" title={hint.default}>
                      {hint.default}
                    </span>
                  )}
                  {hint.origin && (
                    <span className="text-neutral-600">
                      {ORIGIN_LABELS[hint.origin] ?? hint.origin}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick-add buttons for unused suggestions */}
      {unusedHints.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-xs text-neutral-500">Suggested:</span>
          {unusedHints.slice(0, 12).map((hint) => (
            <button
              key={hint.key}
              className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300"
              onClick={() => handleAddFromHint(hint)}
              title={hint.default ? `Default: ${hint.default}` : undefined}
            >
              {hint.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
