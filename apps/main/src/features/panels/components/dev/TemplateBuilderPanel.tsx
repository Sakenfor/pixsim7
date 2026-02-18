/**
 * TemplateBuilderPanel — Dev panel for block template CRUD and rolling.
 *
 * Lists existing templates, allows creating/editing templates,
 * and rolling prompts directly from the panel.
 */
import { useCallback, useEffect, useState } from 'react';

import type { BlockTemplateSummary } from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import {
  CAP_PROMPT_BOX,
  useCapability,
  type PromptBoxContext,
} from '@features/contextHub';
import { TemplateBuilder } from '@features/prompts/components/templates/TemplateBuilder';
import { TemplateRollResult } from '@features/prompts/components/templates/TemplateRollResult';
import {
  useBlockTemplateStore,
  createEmptySlot,
} from '@features/prompts/stores/blockTemplateStore';

type PanelView = 'list' | 'edit' | 'roll';

export function TemplateBuilderPanel() {
  const templates = useBlockTemplateStore((s) => s.templates);
  const templatesLoading = useBlockTemplateStore((s) => s.templatesLoading);
  const fetchTemplates = useBlockTemplateStore((s) => s.fetchTemplates);
  const fetchTemplate = useBlockTemplateStore((s) => s.fetchTemplate);
  const activeTemplate = useBlockTemplateStore((s) => s.activeTemplate);
  const setActiveTemplate = useBlockTemplateStore((s) => s.setActiveTemplate);
  const setDraftSlots = useBlockTemplateStore((s) => s.setDraftSlots);
  const deleteTemplate = useBlockTemplateStore((s) => s.deleteTemplate);
  const roll = useBlockTemplateStore((s) => s.roll);
  const lastRollResult = useBlockTemplateStore((s) => s.lastRollResult);
  const rolling = useBlockTemplateStore((s) => s.rolling);

  const { value: promptBox } = useCapability<PromptBoxContext>(CAP_PROMPT_BOX);

  const [view, setView] = useState<PanelView>('list');

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleNew = useCallback(() => {
    setActiveTemplate(null);
    setDraftSlots([createEmptySlot(0)]);
    setView('edit');
  }, [setActiveTemplate, setDraftSlots]);

  const handleEdit = useCallback(
    async (t: BlockTemplateSummary) => {
      await fetchTemplate(t.id);
      setView('edit');
    },
    [fetchTemplate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTemplate(id);
    },
    [deleteTemplate],
  );

  const handleRoll = useCallback(
    async (id: string) => {
      await roll(id);
      setView('roll');
    },
    [roll],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        {view !== 'list' && (
          <button
            type="button"
            onClick={() => setView('list')}
            className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            title="Back to list"
          >
            <Icon name="arrowLeft" size={14} />
          </button>
        )}
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {view === 'list' ? 'Block Templates' : view === 'edit' ? (activeTemplate ? 'Edit Template' : 'New Template') : 'Roll Result'}
        </h2>
        {promptBox && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 ml-auto">
            <Icon name="link" size={10} />
            Prompt connected
          </span>
        )}
        {view === 'list' && (
          <button
            type="button"
            onClick={handleNew}
            className={`${promptBox ? '' : 'ml-auto '}text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800`}
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            New
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar p-3">
        {view === 'list' && (
          <div className="space-y-2">
            {templatesLoading && (
              <div className="text-xs text-neutral-500 text-center py-4">Loading...</div>
            )}
            {!templatesLoading && templates.length === 0 && (
              <div className="text-xs text-neutral-400 text-center py-4">
                No templates yet. Create one to get started.
              </div>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    {t.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRoll(t.id)}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
                      title="Roll"
                    >
                      <Icon name="shuffle" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(t)}
                      className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
                      title="Edit"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400"
                      title="Delete"
                    >
                      <Icon name="trash2" size={12} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t.slot_count} slot{t.slot_count === 1 ? '' : 's'}
                  {' \u00B7 '}
                  {t.composition_strategy}
                  {t.roll_count > 0 && ` \u00B7 ${t.roll_count} rolls`}
                </div>
                {t.description && (
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
                    {t.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'edit' && (
          <TemplateBuilder onSaved={() => setView('list')} />
        )}

        {view === 'roll' && lastRollResult && (
          <TemplateRollResult
            result={lastRollResult}
            onUsePrompt={promptBox?.setPrompt}
            maxChars={promptBox?.maxChars}
            onReroll={() => {
              if (lastRollResult.metadata.template_id) {
                void roll(lastRollResult.metadata.template_id);
              }
            }}
            rolling={rolling}
          />
        )}
      </div>
    </div>
  );
}
