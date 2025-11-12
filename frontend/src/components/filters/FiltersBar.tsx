import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

export type FiltersValue = {
  q?: string;
  tag?: string;
  providerId?: string | null;
  sort?: 'new' | 'old' | 'alpha';
};

interface FiltersBarProps {
  value: FiltersValue;
  onChange: (next: FiltersValue) => void;
  providers: Array<{ id: string; name: string }>;
  tags: string[];
}

export function FiltersBar({ value, onChange, providers, tags }: FiltersBarProps) {
  const [qLocal, setQLocal] = useState<string>(value.q || '');

  // Debounce search input
  useEffect(() => {
    setQLocal(value.q || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q || '') !== qLocal) {
        onChange({ ...value, q: qLocal });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [qLocal]);

  const handleProvider = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value || null;
    onChange({ ...value, providerId });
  };

  const handleSort = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...value, sort: e.target.value as FiltersValue['sort'] });
  };

  const uniqueTags = useMemo(() => Array.from(new Set(tags)).slice(0, 200), [tags]);
  const selectedTag = value.tag;

  const toggleTag = (t: string) => {
    onChange({ ...value, tag: selectedTag === t ? undefined : t });
  };

  // Simple responsive container: details/summary on small screens
  return (
    <div className="w-full">
      <div className="md:hidden">
        <details className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Filters</summary>
          <div className="p-3 space-y-3">
            <LabeledInput
              id="filter-q"
              label="Search"
              placeholder="Search..."
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
            />
            <LabeledSelect id="filter-provider" label="Provider" value={value.providerId || ''} onChange={handleProvider}>
              <option value="">All Providers</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </LabeledSelect>
            <LabeledSelect id="filter-sort" label="Sort" value={value.sort || 'new'} onChange={handleSort}>
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
              <option value="alpha">A–Z</option>
            </LabeledSelect>
            <div>
              <div className="text-xs font-medium mb-1">Tags</div>
              <div className="flex flex-wrap gap-2">
                {uniqueTags.length === 0 && (
                  <span className="text-xs text-neutral-500">No tags in view</span>
                )}
                {uniqueTags.map(t => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={selectedTag === t}
                    onClick={() => toggleTag(t)}
                    className={clsx(
                      'text-xs px-2 py-1 rounded border',
                      selectedTag === t
                        ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                        : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>
      </div>

      <div className="hidden md:block">
        <div className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3">
          <LabeledInput
            id="filter-q-desktop"
            label="Search"
            placeholder="Search..."
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
          />
          <LabeledSelect id="filter-provider-desktop" label="Provider" value={value.providerId || ''} onChange={handleProvider}>
            <option value="">All Providers</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </LabeledSelect>
          <LabeledSelect id="filter-sort-desktop" label="Sort" value={value.sort || 'new'} onChange={handleSort}>
            <option value="new">Newest</option>
            <option value="old">Oldest</option>
            <option value="alpha">A–Z</option>
          </LabeledSelect>
          <div className="flex-1 min-w-[120px]">
            <div className="text-xs font-medium mb-1">Tags</div>
            <div className="flex flex-wrap gap-2">
              {uniqueTags.length === 0 && (
                <span className="text-xs text-neutral-500">No tags in view</span>
              )}
              {uniqueTags.map(t => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selectedTag === t}
                  onClick={() => toggleTag(t)}
                  className={clsx(
                    'text-xs px-2 py-1 rounded border',
                    selectedTag === t
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                      : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabeledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { id, label, className, ...rest } = props;
  return (
    <label htmlFor={id} className="text-xs font-medium">
      <div className="mb-1">{label}</div>
      <input
        id={id}
        {...rest}
        className={clsx('px-2 py-1 text-sm border rounded w-56', className)}
      />
    </label>
  );
}

function LabeledSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const { id, label, className, children, ...rest } = props;
  return (
    <label htmlFor={id} className="text-xs font-medium">
      <div className="mb-1">{label}</div>
      <select id={id} {...rest} className={clsx('px-2 py-1 text-sm border rounded w-48', className)}>
        {children}
      </select>
    </label>
  );
}
