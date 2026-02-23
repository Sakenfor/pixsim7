/**
 * TemplateBuilderPanel — Panel for block template browsing, pinning, and editing.
 *
 * Consolidates the old TemplatePickerDropdown functionality:
 * - Search/filter templates
 * - Pin/unpin templates (for auto-roll on generation)
 * - Roll mode toggle (Once / Each)
 * - Cast panel for templates with castable roles
 * - Full template editing via TemplateBuilder
 * - Roll & Go to connected prompt boxes
 */
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BlockTemplateSummary, CharacterBindings } from '@lib/api/blockTemplates';
import { getTemplate } from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import {
  CAP_PROMPT_BOX,
  useCapabilityAll,
  type PromptBoxContext,
} from '@features/contextHub';
import { TemplateBuilder } from '@features/prompts/components/templates/TemplateBuilder';
import type { CastableRole } from '@features/prompts/components/templates/TemplateCastPanel';
import { TemplateCastPanel } from '@features/prompts/components/templates/TemplateCastPanel';
import { TemplateRollResult } from '@features/prompts/components/templates/TemplateRollResult';
import { readTemplateControls } from '@features/prompts/lib/templateControls';
import {
  useBlockTemplateStore,
  createEmptySlot,
} from '@features/prompts/stores/blockTemplateStore';

type PanelView = 'list' | 'edit' | 'roll' | 'cast';

export function TemplateBuilderPanel() {
  const templates = useBlockTemplateStore((s) => s.templates);
  const templatesLoading = useBlockTemplateStore((s) => s.templatesLoading);
  const fetchTemplates = useBlockTemplateStore((s) => s.fetchTemplates);
  const fetchTemplate = useBlockTemplateStore((s) => s.fetchTemplate);
  const activeTemplate = useBlockTemplateStore((s) => s.activeTemplate);
  const setActiveTemplate = useBlockTemplateStore((s) => s.setActiveTemplate);
  const setDraftSlots = useBlockTemplateStore((s) => s.setDraftSlots);
  const setDraftCharacterBindings = useBlockTemplateStore((s) => s.setDraftCharacterBindings);
  const deleteTemplate = useBlockTemplateStore((s) => s.deleteTemplate);
  const roll = useBlockTemplateStore((s) => s.roll);
  const lastRollResult = useBlockTemplateStore((s) => s.lastRollResult);
  const rolling = useBlockTemplateStore((s) => s.rolling);

  // Pinning state from store
  const pinnedTemplateId = useBlockTemplateStore((s) => s.pinnedTemplateId);
  const setPinnedTemplateId = useBlockTemplateStore((s) => s.setPinnedTemplateId);
  const templateRollMode = useBlockTemplateStore((s) => s.templateRollMode);
  const setTemplateRollMode = useBlockTemplateStore((s) => s.setTemplateRollMode);
  const controlValues = useBlockTemplateStore((s) => s.controlValues);
  const setControlValue = useBlockTemplateStore((s) => s.setControlValue);

  // All prompt boxes across all dockview groups
  const allPromptBoxes = useCapabilityAll<PromptBoxContext>(CAP_PROMPT_BOX);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Auto-select first provider, clear if selected is gone
  useEffect(() => {
    if (allPromptBoxes.length === 0) {
      setSelectedProviderId(null);
    } else if (!selectedProviderId || !allPromptBoxes.some((p) => p.provider.id === selectedProviderId)) {
      setSelectedProviderId(allPromptBoxes[0].provider.id ?? null);
    }
  }, [allPromptBoxes, selectedProviderId]);

  const selectedEntry = allPromptBoxes.find((p) => p.provider.id === selectedProviderId) ?? null;
  const selectedBox = selectedEntry?.value ?? null;

  const [view, setView] = useState<PanelView>('list');
  const [search, setSearch] = useState('');

  // Cast state
  const [castTemplateId, setCastTemplateId] = useState<string | null>(null);
  const [castRoles, setCastRoles] = useState<CastableRole[]>([]);
  const [castLoading, setCastLoading] = useState(false);
  const [updatedTemplateIds, setUpdatedTemplateIds] = useState<Set<string>>(() => new Set());
  const templateUpdatedAtByIdRef = useRef<Map<string, string>>(new Map());
  const hasTemplateListBaselineRef = useRef(false);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    const previous = templateUpdatedAtByIdRef.current;
    const next = new Map<string, string>();
    const changedYamlBackedIds: string[] = [];
    const liveIds = new Set<string>();

    for (const template of templates) {
      liveIds.add(template.id);
      const stamp = template.updated_at ?? template.created_at ?? '';
      next.set(template.id, stamp);
      if (!hasTemplateListBaselineRef.current) continue;
      if (!template.package_name) continue;
      const prevStamp = previous.get(template.id);
      if (prevStamp && stamp && prevStamp !== stamp) {
        changedYamlBackedIds.push(template.id);
      }
    }

    setUpdatedTemplateIds((prev) => {
      let changed = false;
      const merged = new Set<string>();
      for (const id of prev) {
        if (liveIds.has(id)) {
          merged.add(id);
        } else {
          changed = true;
        }
      }
      for (const id of changedYamlBackedIds) {
        if (!merged.has(id)) {
          merged.add(id);
          changed = true;
        }
      }
      return changed ? merged : prev;
    });

    templateUpdatedAtByIdRef.current = next;
    hasTemplateListBaselineRef.current = true;
  }, [templates]);

  // Fetch template detail when pinned (for presets + character_bindings)
  useEffect(() => {
    if (pinnedTemplateId) {
      void fetchTemplate(pinnedTemplateId);
    }
  }, [pinnedTemplateId, fetchTemplate]);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const pinnedTemplateName = useMemo(
    () => pinnedTemplateId ? templates.find((t) => t.id === pinnedTemplateId)?.name ?? null : null,
    [templates, pinnedTemplateId],
  );

  const pinnedControls = useMemo(
    () => readTemplateControls(activeTemplate?.template_metadata),
    [activeTemplate?.template_metadata],
  );

  const handleNew = useCallback(() => {
    setActiveTemplate(null);
    setDraftSlots([createEmptySlot(0)]);
    setView('edit');
  }, [setActiveTemplate, setDraftSlots]);

  const handleEdit = useCallback(
    async (t: BlockTemplateSummary) => {
      setUpdatedTemplateIds((prev) => {
        if (!prev.has(t.id)) return prev;
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
      await fetchTemplate(t.id);
      setView('edit');
    },
    [fetchTemplate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTemplate(id);
      if (pinnedTemplateId === id) {
        setPinnedTemplateId(null);
      }
    },
    [deleteTemplate, pinnedTemplateId, setPinnedTemplateId],
  );

  /** Click on template row → pin it */
  const handleRowClick = useCallback(
    (t: BlockTemplateSummary) => {
      setPinnedTemplateId(pinnedTemplateId === t.id ? null : t.id);
    },
    [pinnedTemplateId, setPinnedTemplateId],
  );

  /** Click shuffle on a template row → check for castable roles, then roll */
  const handleSelectForRoll = useCallback(
    async (templateId: string) => {
      setCastLoading(true);
      try {
        const detail = await getTemplate(templateId);
        const castable: CastableRole[] = [];
        if (detail.character_bindings) {
          for (const [role, binding] of Object.entries(detail.character_bindings)) {
            if (binding.cast) {
              castable.push({
                role,
                cast: binding.cast,
                defaultCharacterId: binding.character_id,
              });
            }
          }
        }

        if (castable.length > 0) {
          setCastTemplateId(templateId);
          setCastRoles(castable);
          setCastLoading(false);
          setView('cast');
          return;
        }
      } catch {
        // Fall through to direct roll
      }
      setCastLoading(false);
      await roll(templateId);
      setView('roll');
    },
    [roll],
  );

  const handleCastRoll = useCallback(
    async (bindings: CharacterBindings) => {
      if (!castTemplateId) return;
      setDraftCharacterBindings(bindings);
      const result = await roll(castTemplateId);
      setCastTemplateId(null);
      setCastRoles([]);
      if (result) {
        setView('roll');
      } else {
        setView('list');
      }
    },
    [castTemplateId, roll, setDraftCharacterBindings],
  );

  const [rollingAndGoing, setRollingAndGoing] = useState(false);

  const handleRollAndGo = useCallback(
    async (templateId?: string) => {
      const id = templateId ?? activeTemplate?.id;
      if (!id || !selectedBox?.setPrompt) return;
      setRollingAndGoing(true);
      try {
        const result = await roll(id);
        if (result?.assembled_prompt) {
          selectedBox.setPrompt(result.assembled_prompt);
        }
      } finally {
        setRollingAndGoing(false);
      }
    },
    [activeTemplate?.id, selectedBox, roll],
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
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 shrink-0">
          {view === 'list' ? 'Block Templates' : view === 'edit' ? (activeTemplate ? 'Edit Template' : 'New Template') : view === 'cast' ? 'Cast' : 'Roll Result'}
        </h2>

        {/* Prompt box target selector */}
        <div className="flex items-center gap-1 ml-auto">
          {allPromptBoxes.length > 0 ? (
            <>
              <Icon name="link" size={10} className="text-emerald-500 shrink-0" />
              {allPromptBoxes.length === 1 ? (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate max-w-[120px]">
                  {allPromptBoxes[0].provider.label || 'Connected'}
                </span>
              ) : (
                <select
                  value={selectedProviderId ?? ''}
                  onChange={(e) => setSelectedProviderId(e.target.value)}
                  className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 outline-none max-w-[130px]"
                >
                  {allPromptBoxes.map((entry) => (
                    <option key={entry.provider.id} value={entry.provider.id ?? ''}>
                      {entry.provider.label}{entry.value?.operationType ? ` (${entry.value.operationType.replace(/_/g, ' ')})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              No prompt box
            </span>
          )}
        </div>

        {view === 'list' && (
          <button
            type="button"
            onClick={handleNew}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            New
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {view === 'list' && (
          <div className="flex flex-col min-h-0">
            {/* Pinned template header */}
            {pinnedTemplateId && (
              <div className="px-3 py-2 bg-accent/10 border-b border-accent/20 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Icon name="pin" size={11} className="text-accent shrink-0" />
                  <span className="text-[11px] text-accent font-medium truncate flex-1">
                    {pinnedTemplateName ?? pinnedTemplateId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPinnedTemplateId(null)}
                    className="p-0.5 rounded hover:bg-accent/30 text-accent hover:text-accent-hover transition-colors shrink-0"
                    title="Unpin template"
                  >
                    <Icon name="x" size={10} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-accent/70">Roll mode:</span>
                  <div className="flex rounded-md overflow-hidden border border-accent/30">
                    <button
                      type="button"
                      onClick={() => setTemplateRollMode('once')}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] font-medium transition-colors',
                        templateRollMode === 'once'
                          ? 'bg-accent text-accent-text'
                          : 'text-accent hover:bg-accent/20',
                      )}
                      title="Roll once, reuse for all burst/each items"
                    >
                      Once
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateRollMode('each')}
                      className={clsx(
                        'px-2 py-0.5 text-[10px] font-medium transition-colors',
                        templateRollMode === 'each'
                          ? 'bg-accent text-accent-text'
                          : 'text-accent hover:bg-accent/20',
                      )}
                      title="Re-roll per burst/each item for variety"
                    >
                      Each
                    </button>
                  </div>
                </div>
                {pinnedControls.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {pinnedControls.map((control) => {
                      if (control.type !== 'slider') return null;
                      const value = controlValues[control.id] ?? control.defaultValue;
                      return (
                        <div key={control.id} className="flex items-center gap-2">
                          <span className="text-[10px] text-accent/70 shrink-0 w-16 truncate" title={control.label}>
                            {control.label}
                          </span>
                          <input
                            type="range"
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            value={value}
                            onChange={(e) => setControlValue(control.id, Number(e.target.value))}
                            className="flex-1 h-1 accent-[var(--color-accent)]"
                          />
                          <span className="text-[10px] font-mono text-accent/70 w-5 text-right">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Search input */}
            <div className="px-3 py-1.5 shrink-0">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <Icon name="search" size={12} className="text-neutral-400 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="flex-1 bg-transparent text-[11px] text-neutral-700 dark:text-neutral-200 outline-none placeholder-neutral-400"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    <Icon name="x" size={10} />
                  </button>
                )}
              </div>
            </div>

            {/* Template list */}
            <div className="px-2 pb-2 space-y-0.5 overflow-y-auto thin-scrollbar">
              {templatesLoading && (
                <div className="text-xs text-neutral-500 text-center py-4">Loading...</div>
              )}
              {!templatesLoading && filteredTemplates.length === 0 && (
                <div className="text-xs text-neutral-400 text-center py-4">
                  {search ? 'No matches' : 'No templates yet. Create one to get started.'}
                </div>
              )}
              {filteredTemplates.map((t) => {
                const isPinned = pinnedTemplateId === t.id;
                const hasUpdateNotice = updatedTemplateIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => handleRowClick(t)}
                    className={clsx(
                      'rounded-lg border p-2.5 cursor-pointer transition-colors',
                      isPinned
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={clsx(
                          'text-sm font-medium truncate',
                          isPinned ? 'text-accent' : 'text-neutral-700 dark:text-neutral-200',
                        )}>
                          {t.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {selectedBox && (
                          <button
                            type="button"
                            onClick={() => handleRollAndGo(t.id)}
                            disabled={rollingAndGoing}
                            className="p-1 rounded text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50"
                            title="Roll & send to prompt"
                          >
                            <Icon name="zap" size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSelectForRoll(t.id)}
                          className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
                          title="Roll (preview)"
                        >
                          <Icon name="shuffle" size={14} />
                        </button>
                        {hasUpdateNotice && (
                          <span
                            className="p-1 rounded text-amber-600 dark:text-amber-400"
                            title="Template was updated on the server (likely from YAML reload). Open it to review or reload."
                          >
                            <Icon name="refresh" size={14} />
                          </span>
                        )}
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
                          onClick={() => setPinnedTemplateId(isPinned ? null : t.id)}
                          title={isPinned ? 'Unpin template' : 'Pin for auto-roll'}
                          className={clsx(
                            'p-1 rounded transition-colors',
                            isPinned
                              ? 'text-accent hover:text-accent-hover hover:bg-accent/20'
                              : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600',
                          )}
                        >
                          <Icon name="pin" size={12} />
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
                );
              })}
            </div>
          </div>
        )}

        {view === 'edit' && (
          <div className="p-3">
            <TemplateBuilder
              onSaved={() => setView('list')}
              onRollAndGo={selectedBox ? () => handleRollAndGo() : undefined}
              rollingAndGoing={rollingAndGoing}
            />
          </div>
        )}

        {view === 'cast' && (
          <div className="p-3">
            {castLoading ? (
              <div className="text-[11px] text-neutral-500 py-2">Loading...</div>
            ) : (
              <TemplateCastPanel
                roles={castRoles}
                onRoll={handleCastRoll}
                rolling={rolling}
              />
            )}
          </div>
        )}

        {view === 'roll' && lastRollResult && (
          <div className="p-3">
            <TemplateRollResult
              result={lastRollResult}
              onUsePrompt={selectedBox?.setPrompt}
              maxChars={selectedBox?.maxChars}
              onReroll={() => {
                if (lastRollResult.metadata.template_id) {
                  void roll(lastRollResult.metadata.template_id);
                }
              }}
              rolling={rolling}
            />
          </div>
        )}
      </div>
    </div>
  );
}
