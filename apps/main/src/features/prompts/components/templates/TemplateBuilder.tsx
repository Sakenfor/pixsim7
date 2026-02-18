/**
 * TemplateBuilder — Full template editor
 *
 * Provides name/description/strategy fields, an ordered list of slot editors
 * with add/remove/reorder, and save functionality.
 */
import clsx from 'clsx';
import { useCallback, useState } from 'react';

import { Icon } from '@lib/icons';

import { OPERATION_TYPES } from '@/types/operations';

import {
  useBlockTemplateStore,
  createEmptySlot,
} from '../../stores/blockTemplateStore';

import { TemplateSlotEditor } from './TemplateSlotEditor';

interface TemplateBuilderProps {
  onSaved?: () => void;
  className?: string;
}

export function TemplateBuilder({ onSaved, className }: TemplateBuilderProps) {
  const activeTemplate = useBlockTemplateStore((s) => s.activeTemplate);
  const draftSlots = useBlockTemplateStore((s) => s.draftSlots);
  const addDraftSlot = useBlockTemplateStore((s) => s.addDraftSlot);
  const updateDraftSlot = useBlockTemplateStore((s) => s.updateDraftSlot);
  const removeDraftSlot = useBlockTemplateStore((s) => s.removeDraftSlot);
  const reorderDraftSlot = useBlockTemplateStore((s) => s.reorderDraftSlot);
  const saveTemplate = useBlockTemplateStore((s) => s.saveTemplate);
  const updateTemplate = useBlockTemplateStore((s) => s.updateTemplate);

  const [name, setName] = useState(activeTemplate?.name ?? '');
  const [slug, setSlug] = useState(activeTemplate?.slug ?? '');
  const [description, setDescription] = useState(activeTemplate?.description ?? '');
  const [strategy, setStrategy] = useState(activeTemplate?.composition_strategy ?? 'sequential');
  const [targetOperation, setTargetOperation] = useState<string>(
    (activeTemplate?.template_metadata?.target_operation as string) ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSlot = useCallback(() => {
    addDraftSlot(createEmptySlot(draftSlots.length));
  }, [addDraftSlot, draftSlots.length]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const meta = targetOperation
        ? { target_operation: targetOperation }
        : {};

      if (activeTemplate) {
        await updateTemplate(activeTemplate.id, {
          name,
          slug,
          description: description || undefined,
          composition_strategy: strategy,
          template_metadata: { ...activeTemplate.template_metadata, ...meta },
        });
      } else {
        await saveTemplate({
          name,
          slug,
          description: description || undefined,
          composition_strategy: strategy,
          template_metadata: meta,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [activeTemplate, description, name, onSaved, saveTemplate, slug, strategy, updateTemplate]);

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      {/* Template meta */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Romantic Park Scene"
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Slug</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="romantic-park-scene"
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
          />
        </label>
      </div>
      <label className="space-y-0.5">
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this template produces..."
          rows={2}
          className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35 resize-y"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Composition strategy</span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="sequential">Sequential</option>
            <option value="layered">Layered</option>
            <option value="merged">Merged</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Target operation</span>
          <select
            value={targetOperation}
            onChange={(e) => setTargetOperation(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none"
          >
            <option value="">Any</option>
            {OPERATION_TYPES.map((op) => (
              <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Slots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Slots ({draftSlots.length})
          </span>
          <button
            type="button"
            onClick={handleAddSlot}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            Add slot
          </button>
        </div>

        {draftSlots.map((slot, i) => (
          <TemplateSlotEditor
            key={i}
            slot={slot}
            index={i}
            onChange={updateDraftSlot}
            onRemove={removeDraftSlot}
            onMoveUp={i > 0 ? () => reorderDraftSlot(i, i - 1) : undefined}
            onMoveDown={i < draftSlots.length - 1 ? () => reorderDraftSlot(i, i + 1) : undefined}
          />
        ))}

        {draftSlots.length === 0 && (
          <div className="text-xs text-neutral-400 dark:text-neutral-500 text-center py-4">
            No slots yet. Add one to define block constraints.
          </div>
        )}
      </div>

      {/* Save */}
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !name.trim() || !slug.trim()}
        className={clsx(
          'px-3 py-1.5 rounded text-sm font-medium transition-colors',
          'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
        )}
      >
        {saving ? 'Saving...' : activeTemplate ? 'Update template' : 'Create template'}
      </button>
    </div>
  );
}
