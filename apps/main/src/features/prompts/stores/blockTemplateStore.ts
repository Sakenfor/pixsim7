/**
 * Block Template Store
 *
 * Zustand store for managing block templates, draft slots, and roll results.
 */
import { create } from 'zustand';

import type {
  BlockTemplateSummary,
  BlockTemplateDetail,
  RollResult,
  TemplateSlot,
  CharacterBindings,
  TemplatePreset,
} from '@lib/api/blockTemplates';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate as apiUpdateTemplate,
  deleteTemplate as apiDeleteTemplate,
  rollTemplate,
} from '@lib/api/blockTemplates';

interface BlockTemplateState {
  // Template list
  templates: BlockTemplateSummary[];
  templatesLoading: boolean;

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
  fetchTemplates: () => Promise<void>;
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
  setPinnedTemplateId: (id: string | null) => void;
  setTemplateRollMode: (mode: 'once' | 'each') => void;

  // Rolling
  roll: (templateId: string, seed?: number) => Promise<RollResult | null>;
  clearRollResult: () => void;
}

function createEmptySlot(index: number): TemplateSlot {
  return {
    slot_index: index,
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

export const useBlockTemplateStore = create<BlockTemplateState>((set, get) => ({
  templates: [],
  templatesLoading: false,
  activeTemplate: null,
  activeLoading: false,
  draftSlots: [],
  draftCharacterBindings: {},
  lastRollResult: null,
  rolling: false,
  pinnedTemplateId: null,
  templateRollMode: 'once',

  fetchTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const templates = await listTemplates();
      set({ templates });
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

  setPinnedTemplateId: (id) => set({ pinnedTemplateId: id }),
  setTemplateRollMode: (mode) => set({ templateRollMode: mode }),

  roll: async (templateId, seed) => {
    const { draftCharacterBindings, activeTemplate } = get();
    set({ rolling: true });
    try {
      const templateBindings = activeTemplate?.character_bindings ?? {};
      const bindings =
        activeTemplate && areBindingsEqual(draftCharacterBindings, templateBindings)
          ? undefined
          : draftCharacterBindings;
      const result = await rollTemplate(templateId, { seed, character_bindings: bindings });
      set({ lastRollResult: result });
      return result;
    } catch {
      return null;
    } finally {
      set({ rolling: false });
    }
  },

  clearRollResult: () => set({ lastRollResult: null }),
}));

export { createEmptySlot };
