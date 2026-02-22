/**
 * TemplateBuilder — Full template editor
 *
 * Provides name/description/strategy fields, an ordered list of slot editors
 * with add/remove/reorder, and save functionality.
 */
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { listBlockPackages, reloadContentPacks, type ReloadContentPacksResponse } from '@lib/api/blockTemplates';
import { listCharacters, type CharacterSummary } from '@lib/api/characters';
import { Icon } from '@lib/icons';

import { OPERATION_TYPES } from '@/types/operations';

import {
  readTemplateControls,
  type TemplateControl,
} from '../../lib/templateControls';
import {
  useBlockTemplateStore,
  createEmptySlot,
} from '../../stores/blockTemplateStore';

import { TemplateControlsEditor } from './TemplateControlsEditor';
import { TemplateSlotEditor } from './TemplateSlotEditor';

interface TemplateBuilderProps {
  onSaved?: () => void;
  onRollAndGo?: () => void;
  rollingAndGoing?: boolean;
  className?: string;
}

function summarizeReloadResults(response: ReloadContentPacksResponse): string {
  const packs = Object.entries(response.results ?? {});
  const failed = packs.filter(([, stats]) => Boolean(stats?.error));
  const totals = packs.reduce((acc, [, stats]) => {
    acc.blocks_updated += stats.blocks_updated ?? 0;
    acc.blocks_created += stats.blocks_created ?? 0;
    acc.blocks_pruned += stats.blocks_pruned ?? 0;
    acc.templates_updated += stats.templates_updated ?? 0;
    acc.templates_created += stats.templates_created ?? 0;
    acc.templates_pruned += stats.templates_pruned ?? 0;
    return acc;
  }, {
    blocks_updated: 0,
    blocks_created: 0,
    blocks_pruned: 0,
    templates_updated: 0,
    templates_created: 0,
    templates_pruned: 0,
  });

  const parts = [
    `${response.packs_processed} pack${response.packs_processed === 1 ? '' : 's'}`,
    `blocks +${totals.blocks_created}/${totals.blocks_updated} upd`,
    `templates +${totals.templates_created}/${totals.templates_updated} upd`,
  ];
  if (totals.blocks_pruned || totals.templates_pruned) {
    parts.push(`pruned ${totals.blocks_pruned}b ${totals.templates_pruned}t`);
  }
  if (failed.length) {
    parts.push(`${failed.length} failed`);
  }
  return parts.join(' • ');
}

export function TemplateBuilder({ onSaved, onRollAndGo, rollingAndGoing, className }: TemplateBuilderProps) {
  const activeTemplate = useBlockTemplateStore((s) => s.activeTemplate);
  const draftSlots = useBlockTemplateStore((s) => s.draftSlots);
  const addDraftSlot = useBlockTemplateStore((s) => s.addDraftSlot);
  const updateDraftSlot = useBlockTemplateStore((s) => s.updateDraftSlot);
  const removeDraftSlot = useBlockTemplateStore((s) => s.removeDraftSlot);
  const reorderDraftSlot = useBlockTemplateStore((s) => s.reorderDraftSlot);
  const setDraftSlots = useBlockTemplateStore((s) => s.setDraftSlots);
  const saveTemplate = useBlockTemplateStore((s) => s.saveTemplate);
  const updateTemplate = useBlockTemplateStore((s) => s.updateTemplate);
  const fetchTemplates = useBlockTemplateStore((s) => s.fetchTemplates);
  const fetchTemplate = useBlockTemplateStore((s) => s.fetchTemplate);
  const draftCharacterBindings = useBlockTemplateStore((s) => s.draftCharacterBindings);
  const removeDraftCharacterBinding = useBlockTemplateStore((s) => s.removeDraftCharacterBinding);
  const setDraftCharacterBindings = useBlockTemplateStore((s) => s.setDraftCharacterBindings);
  const getPresets = useBlockTemplateStore((s) => s.getPresets);
  const savePreset = useBlockTemplateStore((s) => s.savePreset);
  const loadPreset = useBlockTemplateStore((s) => s.loadPreset);
  const deletePreset = useBlockTemplateStore((s) => s.deletePreset);
  const renamePreset = useBlockTemplateStore((s) => s.renamePreset);

  const [name, setName] = useState(activeTemplate?.name ?? '');
  const [slug, setSlug] = useState(activeTemplate?.slug ?? '');
  const [description, setDescription] = useState(activeTemplate?.description ?? '');
  const [strategy, setStrategy] = useState(activeTemplate?.composition_strategy ?? 'sequential');
  const [targetOperation, setTargetOperation] = useState<string>(
    (activeTemplate?.template_metadata?.target_operation as string) ?? '',
  );
  const [templateControls, setTemplateControls] = useState<TemplateControl[]>(
    readTemplateControls(activeTemplate?.template_metadata),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [packageNames, setPackageNames] = useState<string[]>([]);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [yamlReloading, setYamlReloading] = useState(false);
  const [yamlReloadMessage, setYamlReloadMessage] = useState<string | null>(null);
  const [yamlReloadError, setYamlReloadError] = useState<string | null>(null);
  const [serverTemplateReloading, setServerTemplateReloading] = useState(false);
  const [serverTemplateReloadMessage, setServerTemplateReloadMessage] = useState<string | null>(null);
  const [serverTemplateReloadError, setServerTemplateReloadError] = useState<string | null>(null);

  const syncLocalTemplateFields = useCallback((template: NonNullable<typeof activeTemplate>) => {
    setName(template.name ?? '');
    setSlug(template.slug ?? '');
    setDescription(template.description ?? '');
    setStrategy(template.composition_strategy ?? 'sequential');
    setTargetOperation((template.template_metadata?.target_operation as string) ?? '');
    setTemplateControls(readTemplateControls(template.template_metadata));
  }, []);

  // Re-sync local state when active template changes (e.g. switching pinned template)
  useEffect(() => {
    if (!activeTemplate) {
      setName('');
      setSlug('');
      setDescription('');
      setStrategy('sequential');
      setTargetOperation('');
      setTemplateControls([]);
      return;
    }
    syncLocalTemplateFields(activeTemplate);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only on id/updated_at change, not every reference swap
  }, [activeTemplate?.id, activeTemplate?.updated_at, syncLocalTemplateFields]);

  useEffect(() => {
    void listBlockPackages().then(setPackageNames).catch(() => {});
    void listCharacters({ limit: 200 })
      .then(setCharacters)
      .catch((err) => console.warn('[TemplateBuilder] Failed to load characters:', err));
  }, []);

  const handleReloadYaml = useCallback(async () => {
    setYamlReloading(true);
    setYamlReloadError(null);
    setYamlReloadMessage(null);
    try {
      const result = await reloadContentPacks({
        force: true,
        prune: true,
      });
      setYamlReloadMessage(summarizeReloadResults(result));
      void fetchTemplates();
      void listBlockPackages().then(setPackageNames).catch(() => {});
    } catch (err) {
      setYamlReloadError(err instanceof Error ? err.message : 'YAML reload failed');
    } finally {
      setYamlReloading(false);
    }
  }, [fetchTemplates]);

  const handleReloadActiveTemplateFromServer = useCallback(async () => {
    if (!activeTemplate?.id) return;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(
        'Reload the active template from server?\n\nThis will replace current draft slots and local edits in the builder.',
      );
    if (!confirmed) return;

    setServerTemplateReloading(true);
    setServerTemplateReloadError(null);
    setServerTemplateReloadMessage(null);
    try {
      await fetchTemplate(activeTemplate.id);
      const refreshed = useBlockTemplateStore.getState().activeTemplate;
      if (refreshed && refreshed.id === activeTemplate.id) {
        syncLocalTemplateFields(refreshed);
      }
      setServerTemplateReloadMessage('Active template reloaded from server. Draft slots were replaced.');
    } catch (err) {
      setServerTemplateReloadError(err instanceof Error ? err.message : 'Failed to reload active template');
    } finally {
      setServerTemplateReloading(false);
    }
  }, [activeTemplate?.id, fetchTemplate, syncLocalTemplateFields]);

  const handleAddSlot = useCallback(() => {
    addDraftSlot(createEmptySlot(draftSlots.length));
  }, [addDraftSlot, draftSlots.length]);

  const handleApplyControlDefaultsToSlots = useCallback(() => {
    if (templateControls.length === 0 || draftSlots.length === 0) return;

    let changed = false;
    const nextSlots = draftSlots.map((slot) => {
      let nextSlot = slot;
      for (const control of templateControls) {
        if (control.type !== 'slider') continue;
        for (const effect of control.effects) {
          if (effect.kind !== 'slot_intensity') continue;
          if (!slot.label || slot.label !== effect.slotLabel) continue;
          if ((nextSlot.inherit_intensity ?? false) || nextSlot.intensity !== control.defaultValue) {
            nextSlot = {
              ...nextSlot,
              inherit_intensity: false,
              intensity: control.defaultValue,
            };
            changed = true;
          }
        }
      }
      return nextSlot;
    });

    if (changed) {
      setDraftSlots(nextSlots);
    }
  }, [draftSlots, setDraftSlots, templateControls]);

  const availableSlotLabels = useMemo(
    () => Array.from(new Set(
      draftSlots
        .map((slot) => (typeof slot.label === 'string' ? slot.label.trim() : ''))
        .filter(Boolean),
    )),
    [draftSlots],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const meta: Record<string, unknown> = { ...(activeTemplate?.template_metadata ?? {}) };
      if (targetOperation) {
        meta.target_operation = targetOperation;
      } else {
        delete meta.target_operation;
      }
      if (templateControls.length > 0) {
        meta.controls = templateControls;
      } else {
        delete meta.controls;
      }

      if (activeTemplate) {
        await updateTemplate(activeTemplate.id, {
          name,
          slug,
          description: description || undefined,
          composition_strategy: strategy,
          template_metadata: meta,
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
  }, [activeTemplate, description, name, onSaved, saveTemplate, slug, strategy, targetOperation, templateControls, updateTemplate]);

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      {/* Template meta */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Icon name="edit" size={9} /> Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Romantic Park Scene"
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Icon name="link" size={9} /> Slug
          </span>
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
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
          <Icon name="fileText" size={9} /> Description
        </span>
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
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Icon name="layers" size={9} /> Composition strategy
          </span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none"
          >
            <option value="sequential">Sequential</option>
            <option value="layered">Layered</option>
            <option value="merged">Merged</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
            <Icon name="zap" size={9} /> Target operation
          </span>
          <select
            value={targetOperation}
            onChange={(e) => setTargetOperation(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none"
          >
            <option value="">Any</option>
            {OPERATION_TYPES.map((op) => (
              <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Declarative template controls */}
      <div className="space-y-2">
        <TemplateControlsEditor
          controls={templateControls}
          onChange={setTemplateControls}
          availableSlotLabels={availableSlotLabels}
          disabled={saving}
        />
        {templateControls.some((c) => c.type === 'slider' && c.effects.length > 0) && (
          <div className="flex items-center justify-between gap-2 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40 px-2 py-1.5">
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              Apply current control defaults to linked slot intensities for authoring preview.
            </div>
            <button
              type="button"
              onClick={handleApplyControlDefaultsToSlots}
              disabled={saving}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              <Icon name="sliders" size={10} className="inline mr-1" />
              Apply to slots
            </button>
          </div>
        )}
      </div>

      {/* Character Bindings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
            <Icon name="user" size={12} /> Character Bindings ({Object.keys(draftCharacterBindings).length})
          </span>
          <button
            type="button"
            onClick={() => {
              const role = `role_${Object.keys(draftCharacterBindings).length}`;
              setDraftCharacterBindings({
                ...draftCharacterBindings,
                [role]: { character_id: '', cast: { label: '' } },
              });
            }}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            Add binding
          </button>
        </div>
        {Object.entries(draftCharacterBindings).map(([role, binding]) => {
          const updateBinding = (patch: Partial<typeof binding>) => {
            setDraftCharacterBindings({
              ...draftCharacterBindings,
              [role]: { ...binding, ...patch },
            });
          };
          const updateCast = (patch: Partial<NonNullable<typeof binding.cast>>) => {
            updateBinding({ cast: { ...binding.cast, label: binding.cast?.label ?? '', ...patch } });
          };
          // Filter characters by cast spec when available
          const filteredCharacters = characters.filter((c) => {
            if (binding.cast?.filter_species && c.species) {
              return c.species === `species:${binding.cast.filter_species}` || c.species === binding.cast.filter_species;
            }
            if (binding.cast?.filter_category && c.species) {
              // category-based filtering: match humanoid/mammal/etc from species prefix
              return c.species?.includes(binding.cast.filter_category);
            }
            return true;
          });

          return (
            <div key={role} className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 p-2 space-y-1.5">
              {/* Row 1: role name + character dropdown + remove */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={role}
                  placeholder="role name"
                  onChange={(e) => {
                    const newRole = e.target.value;
                    if (newRole && newRole !== role) {
                      const next = { ...draftCharacterBindings };
                      delete next[role];
                      next[newRole] = binding;
                      setDraftCharacterBindings(next);
                    }
                  }}
                  className="w-28 shrink-0 text-sm px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35 font-mono"
                />
                <select
                  value={filteredCharacters.some((c) => c.character_id === binding.character_id) ? binding.character_id : ''}
                  onChange={(e) => updateBinding({ character_id: e.target.value })}
                  className="flex-1 text-sm px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none"
                >
                  <option value="">{characters.length === 0 ? 'No characters loaded' : 'Select character...'}</option>
                  {filteredCharacters.map((c) => (
                    <option key={c.character_id} value={c.character_id}>
                      {c.display_name || c.name || c.character_id}
                      {c.species ? ` (${c.species.replace('species:', '')})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={binding.character_id}
                  placeholder="character_id"
                  onChange={(e) => updateBinding({ character_id: e.target.value })}
                  className="w-32 shrink-0 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35 font-mono"
                  title="Direct character_id (overrides dropdown)"
                />
                <button
                  type="button"
                  onClick={() => removeDraftCharacterBinding(role)}
                  className="text-neutral-400 hover:text-red-500"
                  title="Remove binding"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              {/* Row 2: fallback_name + cast label */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={binding.fallback_name ?? ''}
                  placeholder="Fallback name"
                  onChange={(e) => updateBinding({ fallback_name: e.target.value || undefined })}
                  title="Display name used when no character is bound"
                  className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
                />
                <input
                  type="text"
                  value={binding.cast?.label ?? ''}
                  placeholder="Cast label"
                  onChange={(e) => updateCast({ label: e.target.value })}
                  title="Label shown in cast picker (e.g. 'Animal', 'Authority figure')"
                  className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
                />
              </div>
              {/* Row 3: cast filters */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={binding.cast?.filter_species ?? ''}
                  placeholder="filter_species"
                  onChange={(e) => updateCast({ filter_species: e.target.value || undefined })}
                  title="Species filter (e.g. canine_large, equine)"
                  className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35 font-mono"
                />
                <input
                  type="text"
                  value={binding.cast?.filter_category ?? ''}
                  placeholder="filter_category"
                  onChange={(e) => updateCast({ filter_category: e.target.value || undefined })}
                  title="Category filter (e.g. human, mammal)"
                  className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35 font-mono"
                />
              </div>
            </div>
          );
        })}
        {Object.keys(draftCharacterBindings).length === 0 && (
          <div className="text-xs text-neutral-400 dark:text-neutral-500 text-center py-2">
            {'No bindings. Use {{role}} and {{role.attr}} in blocks to reference characters.'}
          </div>
        )}
      </div>

      {/* Presets */}
      {activeTemplate && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
              <Icon name="bookmark" size={12} /> Presets ({getPresets().length})
            </span>
          </div>
          {getPresets().map((preset, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
              {renamingIndex === i ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim() && renameValue.trim() !== preset.name) {
                      void renamePreset(i, renameValue.trim());
                    }
                    setRenamingIndex(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameValue.trim() && renameValue.trim() !== preset.name) {
                        void renamePreset(i, renameValue.trim());
                      }
                      setRenamingIndex(null);
                    } else if (e.key === 'Escape') {
                      setRenamingIndex(null);
                    }
                  }}
                  autoFocus
                  className="flex-1 text-sm px-1 py-0.5 rounded border border-blue-400 bg-transparent outline-none"
                />
              ) : (
                <span
                  className="flex-1 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer truncate"
                  onDoubleClick={() => {
                    setRenamingIndex(i);
                    setRenameValue(preset.name);
                  }}
                  title="Double-click to rename"
                >
                  {preset.name}
                </span>
              )}
              <span className="text-[10px] text-neutral-400 tabular-nums shrink-0" title={`${preset.slots.length} slots, ${Object.keys(preset.character_bindings).length} bindings, ${preset.composition_strategy}`}>
                {preset.slots.length}s {Object.keys(preset.character_bindings).length}b
              </span>
              <button
                type="button"
                onClick={() => {
                  loadPreset(i);
                  setStrategy(preset.composition_strategy);
                  setTargetOperation(preset.target_operation ?? '');
                }}
                className="text-xs px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                title="Load this preset (slots, bindings, strategy)"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => void deletePreset(i)}
                className="text-neutral-400 hover:text-red-500 transition-colors"
                title="Delete preset"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          {getPresets().length === 0 && (
            <div className="text-xs text-neutral-400 dark:text-neutral-500 text-center py-2">
              No presets. Save the current template state as a named variant below.
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPresetName.trim()) {
                  void savePreset(newPresetName.trim());
                  setNewPresetName('');
                }
              }}
              placeholder="Preset name..."
              className="flex-1 text-sm px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-transparent outline-none focus:ring-2 focus:ring-blue-500/35"
            />
            <button
              type="button"
              onClick={() => {
                if (newPresetName.trim()) {
                  void savePreset(newPresetName.trim());
                  setNewPresetName('');
                }
              }}
              disabled={!newPresetName.trim()}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              <Icon name="save" size={10} className="inline mr-1" />
              Save as preset
            </button>
          </div>
        </div>
      )}

      {/* Slots */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
            <Icon name="layers" size={12} /> Slots ({draftSlots.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleReloadYaml()}
              disabled={yamlReloading}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              title="Reload content-pack YAML from disk (force + prune). Does not overwrite your current draft slots."
            >
              <Icon name="refresh" size={10} className={clsx('inline mr-1', yamlReloading && 'animate-spin')} />
              {yamlReloading ? 'Reloading YAML...' : 'Reload YAML'}
            </button>
            <button
              type="button"
              onClick={handleAddSlot}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Icon name="plus" size={10} className="inline mr-1" />
              Add slot
            </button>
          </div>
        </div>

        {(yamlReloadMessage || yamlReloadError || serverTemplateReloadMessage || serverTemplateReloadError) && (
          <div
            className={clsx(
              'text-[11px] px-2 py-1 rounded border',
              (yamlReloadError || serverTemplateReloadError)
                ? 'border-red-200 text-red-700 bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:bg-red-900/15'
                : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:bg-emerald-900/15',
            )}
          >
            {serverTemplateReloadError ?? yamlReloadError ?? serverTemplateReloadMessage ?? yamlReloadMessage}
            {!(yamlReloadError || serverTemplateReloadError) && yamlReloadMessage && !serverTemplateReloadMessage && (
              <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                Draft slots were kept as-is.
              </span>
            )}
          </div>
        )}

        {draftSlots.map((slot, i) => (
          <TemplateSlotEditor
            key={i}
            slot={slot}
            index={i}
            onChange={updateDraftSlot}
            onRemove={removeDraftSlot}
            onMoveUp={i > 0 ? () => reorderDraftSlot(i, i - 1) : undefined}
            onMoveDown={i < draftSlots.length - 1 ? () => reorderDraftSlot(i, i + 1) : undefined}
            packageNames={packageNames}
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

      <div className="flex items-center gap-2">
        {activeTemplate && (
          <button
            type="button"
            onClick={() => void handleReloadActiveTemplateFromServer()}
            disabled={serverTemplateReloading || saving}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            title="Replace current draft with the latest template from the server"
          >
            <Icon name="refresh" size={12} className={clsx('inline mr-1', serverTemplateReloading && 'animate-spin')} />
            {serverTemplateReloading ? 'Reloading template...' : 'Reload Active Template'}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim() || !slug.trim()}
          className={clsx(
            'px-3 py-1.5 rounded text-sm font-medium transition-colors',
            'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
          )}
        >
          <Icon name={saving ? 'refresh' : 'save'} size={12} className={clsx('inline mr-1', saving && 'animate-spin')} />
          {saving ? 'Saving...' : activeTemplate ? 'Update template' : 'Create template'}
        </button>
        {onRollAndGo && activeTemplate && (
          <button
            type="button"
            onClick={onRollAndGo}
            disabled={rollingAndGoing}
            className={clsx(
              'px-3 py-1.5 rounded text-sm font-medium transition-colors',
              'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50',
            )}
          >
            <Icon name={rollingAndGoing ? 'refresh' : 'zap'} size={12} className={clsx('inline mr-1', rollingAndGoing && 'animate-spin')} />
            {rollingAndGoing ? 'Rolling...' : 'Roll & Go'}
          </button>
        )}
      </div>
    </div>
  );
}
