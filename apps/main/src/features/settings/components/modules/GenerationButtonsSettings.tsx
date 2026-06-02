/**
 * Generation Buttons Settings Module
 *
 * Per-user customization of the media-card generation button group. Today it
 * exposes the "Style variations" dimensions (which appear in the popover and
 * their order); the same store is the natural home for future per-action
 * show/hide/reorder. Global to the user — applies wherever media cards render.
 */
import { useMemo } from 'react';

import {
  STYLE_VARIATION_CATEGORIES,
  resolveOrderedStyleCategories,
  useStyleVariationPrefsStore,
} from '@/components/media/styleVariationPrefsStore';

import { settingsRegistry } from '../../lib/core/registry';

function StyleVariationDimensions() {
  const disabled = useStyleVariationPrefsStore((s) => s.disabled);
  const order = useStyleVariationPrefsStore((s) => s.order);
  const toggle = useStyleVariationPrefsStore((s) => s.toggle);
  const move = useStyleVariationPrefsStore((s) => s.move);
  const reset = useStyleVariationPrefsStore((s) => s.reset);

  const rows = useMemo(
    () => resolveOrderedStyleCategories(STYLE_VARIATION_CATEGORIES, { disabled, order }),
    [disabled, order],
  );
  const enabledCount = rows.filter((r) => r.enabled).length;
  const isDefault = disabled.length === 0 && order.length === 0;

  return (
    <div className="p-4 max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Style variation dimensions</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Choose which dimensions appear in the media-card “Style variations” popover, and their
            order. Applies everywhere media cards render.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={isDefault}
          className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Reset
        </button>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-800">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2">
            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              <input
                type="checkbox"
                checked={row.enabled}
                // Keep at least one dimension enabled — an empty popover is useless.
                disabled={row.enabled && enabledCount <= 1}
                onChange={() => toggle(row.id)}
              />
              <span
                className={`text-sm truncate ${
                  row.enabled ? '' : 'text-neutral-400 dark:text-neutral-500 line-through'
                }`}
              >
                {row.label}
              </span>
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => move(row.id, 'up')}
                disabled={index === 0}
                className="px-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(row.id, 'down')}
                disabled={index === rows.length - 1}
                className="px-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
                title="Move down"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GenerationButtonsSettings() {
  return <StyleVariationDimensions />;
}

settingsRegistry.register({
  id: 'generation-buttons',
  label: 'Generation Buttons',
  icon: '🎛️',
  component: GenerationButtonsSettings,
  order: 61,
});
