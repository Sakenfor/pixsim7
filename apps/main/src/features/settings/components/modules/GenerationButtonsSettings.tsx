/**
 * Generation Buttons Settings Module
 *
 * Per-user customization of the media-card generation button group:
 *   - which button-group pills show, and their order
 *   - which "Style variations" dimensions show in the popover, and their order
 *
 * Global to the user — applies wherever media cards render. Pill prefs compose
 * on top of context gating (a hidden pill stays hidden; a shown one only
 * appears where the card's context already supports it).
 */
import { useMemo } from 'react';

import {
  GENERATION_ACTION_CATALOG,
  STYLE_VARIATION_CATEGORIES,
  resolveOrdered,
  useGenerationButtonPrefsStore,
  type Resolved,
} from '@/components/media/generationButtonPrefsStore';

import { settingsRegistry } from '../../lib/core/registry';

function PrefListEditor<T extends { id: string; label: string }>({
  title,
  description,
  rows,
  isDefault,
  lockLastEnabled,
  onToggle,
  onMove,
  onReset,
}: {
  title: string;
  description: string;
  rows: Resolved<T>[];
  isDefault: boolean;
  lockLastEnabled: boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onReset: () => void;
}) {
  const enabledCount = rows.filter((r) => r.enabled).length;
  return (
    <section className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{description}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
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
                // Optionally keep at least one entry enabled (style tabs).
                disabled={lockLastEnabled && row.enabled && enabledCount <= 1}
                onChange={() => onToggle(row.id)}
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
                onClick={() => onMove(row.id, 'up')}
                disabled={index === 0}
                className="px-1.5 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-30"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(row.id, 'down')}
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
    </section>
  );
}

export function GenerationButtonsSettings() {
  const styleHidden = useGenerationButtonPrefsStore((s) => s.styleHidden);
  const styleOrder = useGenerationButtonPrefsStore((s) => s.styleOrder);
  const actionHidden = useGenerationButtonPrefsStore((s) => s.actionHidden);
  const actionOrder = useGenerationButtonPrefsStore((s) => s.actionOrder);
  const toggleStyle = useGenerationButtonPrefsStore((s) => s.toggleStyle);
  const moveStyle = useGenerationButtonPrefsStore((s) => s.moveStyle);
  const resetStyle = useGenerationButtonPrefsStore((s) => s.resetStyle);
  const toggleAction = useGenerationButtonPrefsStore((s) => s.toggleAction);
  const moveAction = useGenerationButtonPrefsStore((s) => s.moveAction);
  const resetAction = useGenerationButtonPrefsStore((s) => s.resetAction);

  const actionRows = useMemo(
    () => resolveOrdered(GENERATION_ACTION_CATALOG, actionHidden, actionOrder),
    [actionHidden, actionOrder],
  );
  const styleRows = useMemo(
    () => resolveOrdered(STYLE_VARIATION_CATEGORIES, styleHidden, styleOrder),
    [styleHidden, styleOrder],
  );

  return (
    <div className="p-4 max-w-xl">
      <PrefListEditor
        title="Button group pills"
        description="Hide or reorder the buttons on media cards. A button still only appears where the card's context supports it (e.g. Extend on videos)."
        rows={actionRows}
        isDefault={actionHidden.length === 0 && actionOrder.length === 0}
        lockLastEnabled={false}
        onToggle={toggleAction}
        onMove={moveAction}
        onReset={resetAction}
      />
      <PrefListEditor
        title="Style variation dimensions"
        description="Choose which dimensions appear in the “Style variations” popover, and their order."
        rows={styleRows}
        isDefault={styleHidden.length === 0 && styleOrder.length === 0}
        lockLastEnabled
        onToggle={toggleStyle}
        onMove={moveStyle}
        onReset={resetStyle}
      />
    </div>
  );
}

settingsRegistry.register({
  id: 'generation-buttons',
  label: 'Generation Buttons',
  icon: '🎛️',
  component: GenerationButtonsSettings,
  order: 61,
});
