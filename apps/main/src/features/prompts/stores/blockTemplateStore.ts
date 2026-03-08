/**
 * Block Template Store
 *
 * Zustand store for managing block templates, draft slots, and roll results.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from '@pixsim7/shared.auth.core';

import type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  TemplateSlot,
  CharacterBindings,
  TemplatePreset,
  ListTemplatesQuery,
} from '@lib/api/blockTemplates';
import {
  getTemplate,
  createTemplate,
  updateTemplate as apiUpdateTemplate,
  deleteTemplate as apiDeleteTemplate,
  rollTemplate,
} from '@lib/api/blockTemplates';
import { resolveBlockTemplates } from '@lib/resolvers';

interface BlockTemplateState {
  // Template list
  templates: BlockTemplateSummary[];
  templatesLoading: boolean;
  templatesQuery: ListTemplatesQuery | null;

  // Active template (full detail)
  activeTemplate: BlockTemplateDetail | null;
  activeLoading: boolean;

  // Draft editing
  draftSlots: TemplateSlot[];
  draftCharacterBindings: CharacterBindings;

  // Last roll result
  lastRollResult: RollResult | null;
  rolling: boolean;

  // Actions
  fetchTemplates: (query?: ListTemplatesQuery) => Promise<void>;
  fetchTemplate: (id: string) => Promise<void>;
  setActiveTemplate: (template: BlockTemplateDetail | null) => void;

  // Draft slot management
  setDraftSlots: (slots: TemplateSlot[]) => void;
  addDraftSlot: (slot: TemplateSlot) => void;
  updateDraftSlot: (index: number, slot: TemplateSlot) => void;
  removeDraftSlot: (index: number) => void;
  reorderDraftSlot: (fromIndex: number, toIndex: number) => void;

  // Character bindings management
  setDraftCharacterBindings: (bindings: CharacterBindings) => void;
  setDraftCharacterBinding: (role: string, characterId: string) => void;
  removeDraftCharacterBinding: (role: string) => void;

  // Template CRUD
  saveTemplate: (data: {
    name: string;
    slug: string;
    description?: string;
    composition_strategy?: string;
    package_name?: string;
    tags?: string[];
    is_public?: boolean;
    template_metadata?: Record<string, unknown>;
  }) => Promise<BlockTemplateDetail>;
  updateTemplate: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<BlockTemplateDetail | null>;
  deleteTemplate: (id: string) => Promise<boolean>;

  // Presets
  getPresets: () => TemplatePreset[];
  savePreset: (name: string) => Promise<void>;
  loadPreset: (index: number) => void;
  deletePreset: (index: number) => Promise<void>;
  renamePreset: (index: number, name: string) => Promise<void>;

  // Template pinning (for auto-roll on generation)
  pinnedTemplateId: string | null;
  templateRollMode: 'once' | 'each';
  /** Per-operation pinned state — preserved when switching operations (mirrors promptPerOperation pattern) */
  pinnedPerOperation: Partial<Record<string, PinnedOperationState>>;
  /** Tracks which operation the current pinned state belongs to */
  _activeOperation: string | null;
  setPinnedTemplateId: (id: string | null) => void;
  setTemplateRollMode: (mode: 'once' | 'each') => void;
  /** Save current pinned state for the old operation and restore for the new one */
  syncOperation: (operationType: string) => void;

  // Template control overrides (control_id -> value)
  controlValues: Record<string, number | string>;
  setControlValue: (controlId: string, value: number | string) => void;
  resetControlValues: () => void;

  // Rolling
  roll: (templateId: string, seed?: number) => Promise<RollResult | null>;
  clearRollResult: () => void;
}

interface PinnedOperationState {
  templateId: string | null;
  rollMode: 'once' | 'each';
  controlValues: Record<string, number | string>;
}

function createEmptySlot(index: number): TemplateSlot {
  return {
    slot_index: index,
    // Stable key so control effects can target slots without depending on label text.
    key: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `slot_${Date.now()}_${index}`,
    label: '',
    role: null,
    category: null,
    kind: null,
    intent: null,
    complexity_min: null,
    complexity_max: null,
    package_name: null,
    tag_constraints: null,
    min_rating: null,
    selection_strategy: 'uniform',
    weight: 1.0,
    optional: false,
    fallback_text: null,
    reinforcement_text: null,
    intensity: null,
    inherit_intensity: false,
    exclude_block_ids: null,
  };
}

function areBindingsEqual(a: CharacterBindings, b: CharacterBindings): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    const key = aKeys[i];
    if ((a[key]?.character_id ?? '') !== (b[key]?.character_id ?? '')) return false;
  }
  return true;
}

export const useBlockTemplateStore = create<BlockTemplateState>()(persist((set, get) => ({
  templates: [],
  templatesLoading: false,
  templatesQuery: null,
  activeTemplate: null,
  activeLoading: false,
  draftSlots: [],
  draftCharacterBindings: {},
  lastRollResult: null,
  rolling: false,
  pinnedTemplateId: null,
  templateRollMode: 'once',
  pinnedPerOperation: {},
  _activeOperation: null,
  controlValues: {},

  fetchTemplates: async (query) => {
    set({ templatesLoading: true });
    try {
      const currentUserId = useAuthStore.getState().user?.id;
      const rememberedQuery = get().templatesQuery;
      const autoQuery: ListTemplatesQuery = currentUserId
        ? { limit: 200, mine: true, include_public: true }
        : { limit: 200, is_public: true };
      const requestedQuery = { ...(query ?? rememberedQuery ?? autoQuery) };
      if ((requestedQuery.limit ?? null) == null) {
        requestedQuery.limit = 200;
      }

      const effectiveQuery: ListTemplatesQuery =
        requestedQuery.mine && !currentUserId
          ? { limit: requestedQuery.limit, is_public: true }
          : requestedQuery;

      const templates = await resolveBlockTemplates(
        effectiveQuery,
        {
          consumerId: 'blockTemplateStore.fetchTemplates',
          bypassCache: true,
        },
      );
      set({ templates, templatesQuery: effectiveQuery });
    } finally {
      set({ templatesLoading: false });
    }
  },

  fetchTemplate: async (id: string) => {
    set({ activeLoading: true });
    try {
      const template = await getTemplate(id);
      set({
        activeTemplate: template,
        draftSlots: template.slots ?? [],
        draftCharacterBindings: template.character_bindings ?? {},
      });
    } finally {
      set({ activeLoading: false });
    }
  },

  setActiveTemplate: (template) => {
    set({
      activeTemplate: template,
      draftSlots: template?.slots ?? [],
      draftCharacterBindings: template?.character_bindings ?? {},
    });
  },

  setDraftSlots: (slots) => set({ draftSlots: slots }),

  addDraftSlot: (slot) => {
    const { draftSlots } = get();
    set({ draftSlots: [...draftSlots, { ...slot, slot_index: draftSlots.length }] });
  },

  updateDraftSlot: (index, slot) => {
    const { draftSlots } = get();
    const next = [...draftSlots];
    next[index] = slot;
    set({ draftSlots: next });
  },

  removeDraftSlot: (index) => {
    const { draftSlots } = get();
    const next = draftSlots.filter((_, i) => i !== index);
    // Re-index
    next.forEach((s, i) => { s.slot_index = i; });
    set({ draftSlots: next });
  },

  reorderDraftSlot: (fromIndex, toIndex) => {
    const { draftSlots } = get();
    if (toIndex < 0 || toIndex >= draftSlots.length) return;
    const next = [...draftSlots];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    next.forEach((s, i) => { s.slot_index = i; });
    set({ draftSlots: next });
  },

  setDraftCharacterBindings: (bindings) => set({ draftCharacterBindings: bindings }),

  setDraftCharacterBinding: (role, characterId) => {
    const { draftCharacterBindings } = get();
    const existing = draftCharacterBindings[role];
    set({
      draftCharacterBindings: {
        ...draftCharacterBindings,
        [role]: { ...existing, character_id: characterId },
      },
    });
  },

  removeDraftCharacterBinding: (role) => {
    const { draftCharacterBindings } = get();
    const next = { ...draftCharacterBindings };
    delete next[role];
    set({ draftCharacterBindings: next });
  },

  saveTemplate: async (data) => {
    const { draftSlots, draftCharacterBindings } = get();
    const template = await createTemplate({
      ...data,
      slots: draftSlots,
      composition_strategy: data.composition_strategy ?? 'sequential',
      character_bindings: draftCharacterBindings,
    });
    // Refresh list
    void get().fetchTemplates();
    set({ activeTemplate: template });
    return template;
  },

  updateTemplate: async (id, data) => {
    const { draftSlots, draftCharacterBindings } = get();
    const template = await apiUpdateTemplate(id, {
      ...data,
      slots: draftSlots,
      character_bindings: draftCharacterBindings,
    });
    if (template) {
      set({ activeTemplate: template });
      void get().fetchTemplates();
    }
    return template;
  },

  deleteTemplate: async (id) => {
    try {
      await apiDeleteTemplate(id);
      set({ activeTemplate: null, draftSlots: [] });
      void get().fetchTemplates();
      return true;
    } catch {
      return false;
    }
  },

  getPresets: () => {
    const { activeTemplate } = get();
    return (activeTemplate?.template_metadata?.presets as TemplatePreset[] | undefined) ?? [];
  },

  savePreset: async (name) => {
    const { activeTemplate, draftSlots, draftCharacterBindings } = get();
    if (!activeTemplate) return;
    const presets = [...((activeTemplate.template_metadata?.presets as TemplatePreset[] | undefined) ?? [])];
    presets.push({
      name,
      slots: draftSlots.map((s) => ({ ...s })),
      character_bindings: { ...draftCharacterBindings },
      composition_strategy: activeTemplate.composition_strategy,
      target_operation: (activeTemplate.template_metadata?.target_operation as string) || undefined,
    });
    const meta = { ...activeTemplate.template_metadata, presets };
    const updated = await apiUpdateTemplate(activeTemplate.id, {
      template_metadata: meta,
    });
    if (updated) {
      set({ activeTemplate: updated });
    }
  },

  loadPreset: (index) => {
    const presets = get().getPresets();
    const preset = presets[index];
    if (preset) {
      set({
        draftSlots: preset.slots.map((s) => ({ ...s })),
        draftCharacterBindings: { ...preset.character_bindings },
      });
    }
  },

  deletePreset: async (index) => {
    const { activeTemplate } = get();
    if (!activeTemplate) return;
    const presets = [...((activeTemplate.template_metadata?.presets as TemplatePreset[] | undefined) ?? [])];
    presets.splice(index, 1);
    const meta = { ...activeTemplate.template_metadata, presets };
    const updated = await apiUpdateTemplate(activeTemplate.id, {
      template_metadata: meta,
    });
    if (updated) {
      set({ activeTemplate: updated });
    }
  },

  renamePreset: async (index, name) => {
    const { activeTemplate } = get();
    if (!activeTemplate) return;
    const presets = [...((activeTemplate.template_metadata?.presets as TemplatePreset[] | undefined) ?? [])];
    if (!presets[index]) return;
    presets[index] = { ...presets[index], name };
    const meta = { ...activeTemplate.template_metadata, presets };
    const updated = await apiUpdateTemplate(activeTemplate.id, {
      template_metadata: meta,
    });
    if (updated) {
      set({ activeTemplate: updated });
    }
  },

  setPinnedTemplateId: (id) => {
    const { _activeOperation, pinnedPerOperation, templateRollMode } = get();
    const updated: Record<string, any> = { pinnedTemplateId: id, controlValues: {} };
    // Also save to per-operation dictionary (mirrors setPrompt → promptPerOperation)
    if (_activeOperation) {
      updated.pinnedPerOperation = {
        ...pinnedPerOperation,
        [_activeOperation]: { templateId: id, rollMode: templateRollMode, controlValues: {} },
      };
    }
    set(updated);
  },
  setTemplateRollMode: (mode) => {
    const { _activeOperation, pinnedPerOperation, pinnedTemplateId, controlValues } = get();
    const updated: Record<string, any> = { templateRollMode: mode };
    if (_activeOperation) {
      updated.pinnedPerOperation = {
        ...pinnedPerOperation,
        [_activeOperation]: { templateId: pinnedTemplateId, rollMode: mode, controlValues },
      };
    }
    set(updated);
  },

  syncOperation: (operationType) => {
    const { _activeOperation, pinnedTemplateId, templateRollMode, controlValues, pinnedPerOperation } = get();
    if (_activeOperation === operationType) return;

    // Save current pinned state to the old operation (if we had one)
    const updatedPerOp = _activeOperation
      ? {
        ...pinnedPerOperation,
        [_activeOperation]: { templateId: pinnedTemplateId, rollMode: templateRollMode, controlValues },
      }
      : pinnedPerOperation;

    // Load pinned state for the new operation (or defaults)
    const saved = updatedPerOp[operationType];

    set({
      _activeOperation: operationType,
      pinnedPerOperation: updatedPerOp,
      pinnedTemplateId: saved?.templateId ?? null,
      templateRollMode: saved?.rollMode ?? 'once',
      controlValues: saved?.controlValues ?? {},
    });
  },

  setControlValue: (controlId, value) => {
    const { controlValues, _activeOperation, pinnedPerOperation, pinnedTemplateId, templateRollMode } = get();
    const newControlValues = { ...controlValues, [controlId]: value };
    const updated: Record<string, any> = { controlValues: newControlValues };
    if (_activeOperation) {
      updated.pinnedPerOperation = {
        ...pinnedPerOperation,
        [_activeOperation]: { templateId: pinnedTemplateId, rollMode: templateRollMode, controlValues: newControlValues },
      };
    }
    set(updated);
  },
  resetControlValues: () => {
    const { _activeOperation, pinnedPerOperation, pinnedTemplateId, templateRollMode } = get();
    const updated: Record<string, any> = { controlValues: {} };
    if (_activeOperation) {
      updated.pinnedPerOperation = {
        ...pinnedPerOperation,
        [_activeOperation]: { templateId: pinnedTemplateId, rollMode: templateRollMode, controlValues: {} },
      };
    }
    set(updated);
  },

  roll: async (templateId, seed) => {
    const { draftCharacterBindings, activeTemplate, controlValues } = get();
    set({ rolling: true });
    try {
      const templateBindings = activeTemplate?.character_bindings ?? {};
      const bindings =
        activeTemplate && areBindingsEqual(draftCharacterBindings, templateBindings)
          ? undefined
          : draftCharacterBindings;
      const hasControlOverrides = Object.keys(controlValues).length > 0;
      const result = await rollTemplate(templateId, {
        seed,
        character_bindings: bindings,
        control_values: hasControlOverrides ? controlValues : undefined,
      });
      set({ lastRollResult: result });
      return result;
    } catch {
      return null;
    } finally {
      set({ rolling: false });
    }
  },

  clearRollResult: () => set({ lastRollResult: null }),
}), {
  name: 'block-template-pin',
  version: 2,
  partialize: (state) => ({
    pinnedTemplateId: state.pinnedTemplateId,
    templateRollMode: state.templateRollMode,
    controlValues: state.controlValues,
    pinnedPerOperation: state.pinnedPerOperation,
    _activeOperation: state._activeOperation,
  }),
  migrate: (persisted: any, version: number) => {
    if (version < 2) {
      // v1 had flat pinning — seed into pinnedPerOperation for the active operation
      const op = persisted._activeOperation;
      if (op && persisted.pinnedTemplateId) {
        persisted.pinnedPerOperation = {
          ...(persisted.pinnedPerOperation ?? {}),
          [op]: {
            templateId: persisted.pinnedTemplateId,
            rollMode: persisted.templateRollMode ?? 'once',
            controlValues: persisted.controlValues ?? {},
          },
        };
      }
    }
    return persisted;
  },
}));

export { createEmptySlot };
