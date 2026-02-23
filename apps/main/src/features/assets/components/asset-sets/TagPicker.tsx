import clsx from 'clsx';
import { useState, useCallback, useRef, useEffect } from 'react';

import { Icon } from '@lib/icons';

import { useTagAutocomplete } from '@features/assets/lib/useTagAutocomplete';

import { ruleInputClasses } from './filterRules';

export function TagPicker({
  selected,
  onChangeTags,
  tagMode,
  onChangeTagMode,
}: {
  selected: string[];
  onChangeTags: (tags: string[]) => void;
  tagMode?: 'any' | 'all';
  onChangeTagMode?: (mode: 'any' | 'all') => void;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { results, loading } = useTagAutocomplete(input, { enabled: open && input.length > 0 });

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toLowerCase();
      if (normalized && !selected.includes(normalized)) {
        onChangeTags([...selected, normalized]);
      }
      setInput('');
    },
    [selected, onChangeTags],
  );

  const removeTag = useCallback(
    (tag: string) => onChangeTags(selected.filter((t) => t !== tag)),
    [selected, onChangeTags],
  );

  const currentMode = tagMode ?? 'any';

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1">
      {/* Match mode toggle */}
      {onChangeTagMode && (
        <div className="flex gap-0.5">
          {(['any', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeTagMode(mode)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                currentMode === mode
                  ? 'bg-accent text-accent-text'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600',
              )}
            >
              {mode === 'any' ? 'Any' : 'All'}
            </button>
          ))}
        </div>
      )}
      {/* Selected tag chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md bg-accent/15 text-accent text-[10px] font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="p-0.5 rounded hover:bg-accent/25"
              >
                <Icon name="x" size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Autocomplete input */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === 'Backspace' && !input && selected.length > 0) {
              removeTag(selected[selected.length - 1]);
            }
          }}
          placeholder={selected.length > 0 ? 'Add more…' : 'Search tags…'}
          className={ruleInputClasses}
        />
        {open && (results.length > 0 || loading) && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[160px] overflow-y-auto">
            {results.map((tag) => {
              const fullTag = `${tag.namespace}:${tag.name}`;
              const isSelected = selected.includes(fullTag);
              return (
                <button
                  key={fullTag}
                  type="button"
                  onClick={() => { addTag(fullTag); setOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left',
                    isSelected
                      ? 'text-accent font-medium bg-accent/5'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700',
                  )}
                >
                  <Icon name="tag" size={10} className="text-neutral-400 shrink-0" />
                  <span className="text-neutral-400">{tag.namespace}:</span>
                  <span className="truncate">{tag.display_name ?? tag.name}</span>
                  {isSelected && <Icon name="check" size={10} className="ml-auto text-accent shrink-0" />}
                </button>
              );
            })}
            {loading && (
              <div className="px-2.5 py-1.5 text-[10px] text-neutral-400">Searching…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
