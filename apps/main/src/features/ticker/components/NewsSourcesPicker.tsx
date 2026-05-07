/**
 * NewsSourcesPicker — registry-driven checkbox list of all registered
 * ticker sources. Reused by the Control Center dropdown menu AND by the
 * chevron popover next to the ticker's 📢 toggle, so changing the source
 * catalog (or its labels) updates both surfaces in one go.
 *
 * Renders just the checkbox list; the surrounding container (popover
 * frame, padding, divider) is the caller's responsibility.
 */

import { useSyncExternalStore } from 'react';

import {
  listTickerSources,
  subscribeToTickerRegistry,
  type TickerSource,
} from '../lib/sourceRegistry';
import {
  isSourceEnabled,
  useTickerSettingsStore,
} from '../stores/tickerSettingsStore';

interface NewsSourcesPickerProps {
  /**
   * Heading text shown above the list. Pass `null` to suppress (useful
   * when the popover frame already provides a title).
   */
  heading?: string | null;
}

export function NewsSourcesPicker({
  heading = 'News sources',
}: NewsSourcesPickerProps) {
  const sources = useSyncExternalStore(
    subscribeToTickerRegistry,
    listTickerSources,
    listTickerSources,
  );
  const enabledSources = useTickerSettingsStore((s) => s.enabledSources);
  const setSourceEnabled = useTickerSettingsStore((s) => s.setSourceEnabled);

  if (sources.length === 0) return null;

  return (
    <>
      {heading && (
        <div className="px-3 py-1.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          {heading}
        </div>
      )}
      {sources.map((source) => (
        <NewsSourceRow
          key={source.id}
          source={source}
          enabled={isSourceEnabled({ enabledSources }, source)}
          onToggle={(next) => setSourceEnabled(source.id, next)}
        />
      ))}
    </>
  );
}

function NewsSourceRow({
  source,
  enabled,
  onToggle,
}: {
  source: TickerSource;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label
      className="px-3 py-1.5 flex items-start gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700"
      title={source.description}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 rounded border-neutral-300 dark:border-neutral-600 text-accent focus:ring-accent"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-neutral-700 dark:text-neutral-200">
          {source.label}
        </span>
        {source.description && (
          <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
            {source.description}
          </span>
        )}
      </span>
    </label>
  );
}
