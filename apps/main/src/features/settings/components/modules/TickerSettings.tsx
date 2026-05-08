/**
 * Ticker Settings Module — main Settings panel home for the news ticker.
 *
 * Lists every registered `TickerSource`. Each row exposes:
 * - "Enabled" toggle → writes `enabledSources[source.id]`
 * - Source description
 * - If the source declared `settingsSchema`, inline fields for each entry
 *   → writes `sourceSettings[source.id][field.id]`
 *
 * The chevron-popover on the `<Ticker />` itself still shows the lighter
 * `<NewsSourcesPicker />` (just the on/off list). This module is the
 * canonical home for the same state plus the per-source schema fields
 * the popover doesn't surface.
 *
 * Custom-component pattern (not DynamicSettingsPanel-driven) on purpose:
 * the source list is registry-derived and grows/shrinks at runtime, which
 * doesn't fit the static-schema shape `settingsSchemaRegistry` expects.
 */

import { useSyncExternalStore } from 'react';

import {
  getSourceSettings,
  isSourceEnabled,
  listTickerSources,
  subscribeToTickerRegistry,
  useTickerSettingsStore,
  type TickerSettingField,
  type TickerSource,
} from '@features/ticker';

import { settingsRegistry } from '../../lib/core/registry';

export function TickerSettings() {
  const sources = useSyncExternalStore(
    subscribeToTickerRegistry,
    listTickerSources,
    listTickerSources,
  );
  const enabledSources = useTickerSettingsStore((s) => s.enabledSources);
  const sourceSettings = useTickerSettingsStore((s) => s.sourceSettings);
  const setSourceEnabled = useTickerSettingsStore((s) => s.setSourceEnabled);
  const setSourceSettings = useTickerSettingsStore((s) => s.setSourceSettings);

  if (sources.length === 0) {
    return (
      <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400">
        No ticker sources are registered yet.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header>
        <h2 className="text-base font-semibold mb-1">News Ticker</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Pick which streams feed the scrolling marquee at the top of the
          Control Center, and tune what each one announces.
        </p>
      </header>

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
        {sources.map((source) => {
          const enabled = isSourceEnabled({ enabledSources }, source);
          const hasSchema =
            !!source.settingsSchema &&
            source.settingsSchema.length > 0 &&
            !!source.defaultSettings;
          const settings = hasSchema
            ? getSourceSettings(
                { sourceSettings },
                source.id,
                source.defaultSettings as Record<string, unknown>,
              )
            : undefined;

          return (
            <li key={source.id} className="bg-white dark:bg-neutral-800">
              <SourceCard
                source={source}
                enabled={enabled}
                settings={settings}
                onToggleEnabled={(next) => setSourceEnabled(source.id, next)}
                onSettingChange={(fieldId, value) => {
                  const current =
                    (sourceSettings[source.id] as
                      | Record<string, unknown>
                      | undefined) ?? {};
                  setSourceSettings(source.id, { ...current, [fieldId]: value });
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface SourceCardProps {
  source: TickerSource;
  enabled: boolean;
  settings: Record<string, unknown> | undefined;
  onToggleEnabled: (next: boolean) => void;
  onSettingChange: (fieldId: string, value: unknown) => void;
}

function SourceCard({
  source,
  enabled,
  settings,
  onToggleEnabled,
  onSettingChange,
}: SourceCardProps) {
  return (
    <div className="p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
          className="mt-1 rounded border-neutral-300 dark:border-neutral-600 text-accent focus:ring-accent"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {source.label}
          </div>
          {source.description && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {source.description}
            </div>
          )}
        </div>
      </label>

      {/* Hide schema fields when the source itself is disabled — there's
          nothing to tune about a stream you're not listening to. */}
      {enabled && source.settingsSchema && settings && (
        <div className="mt-4 pl-7 space-y-3 border-l-2 border-neutral-200 dark:border-neutral-700">
          {source.settingsSchema.map((field) => (
            <FieldRenderer
              key={field.id}
              field={field}
              value={settings[field.id]}
              onChange={(next) => onSettingChange(field.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: TickerSettingField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (field.type === 'toggle') {
    const v = typeof value === 'boolean' ? value : field.defaultValue;
    return (
      <label className="flex items-start gap-2 pl-3 cursor-pointer">
        <input
          type="checkbox"
          checked={v}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 rounded border-neutral-300 dark:border-neutral-600 text-accent focus:ring-accent"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-neutral-700 dark:text-neutral-200">
            {field.label}
          </span>
          {field.description && (
            <span className="block text-[10px] text-neutral-500 dark:text-neutral-400">
              {field.description}
            </span>
          )}
        </span>
      </label>
    );
  }

  if (field.type === 'number') {
    const v = typeof value === 'number' ? value : field.defaultValue;
    return (
      <div className="flex items-start gap-2 pl-3">
        <input
          type="number"
          value={v}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="w-24 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-xs"
        />
        {field.suffix && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1.5">
            {field.suffix}
          </span>
        )}
        <span className="flex-1 min-w-0 mt-0.5">
          <span className="block text-xs text-neutral-700 dark:text-neutral-200">
            {field.label}
          </span>
          {field.description && (
            <span className="block text-[10px] text-neutral-500 dark:text-neutral-400">
              {field.description}
            </span>
          )}
        </span>
      </div>
    );
  }

  if (field.type === 'select') {
    const v = typeof value === 'string' ? value : field.defaultValue;
    return (
      <div className="flex items-start gap-2 pl-3">
        <select
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-xs"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="flex-1 min-w-0 mt-0.5">
          <span className="block text-xs text-neutral-700 dark:text-neutral-200">
            {field.label}
          </span>
          {field.description && (
            <span className="block text-[10px] text-neutral-500 dark:text-neutral-400">
              {field.description}
            </span>
          )}
        </span>
      </div>
    );
  }

  return null;
}

settingsRegistry.register({
  id: 'ticker',
  label: 'Ticker',
  icon: '📢',
  component: TickerSettings,
  order: 35,
});
