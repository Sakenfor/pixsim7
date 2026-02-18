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
    exclude_block_ids: null,
  };
}

export const useBlockTemplateStore = create<BlockTemplateState>((set, get) => ({
  templates: [],
  templatesLoading: false,
  activeTemplate: null,
  activeLoading: false,
  draftSlots: [],
  lastRollResult: null,
  rolling: false,

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
      });
    } finally {
      set({ activeLoading: false });
    }
  },

  setActiveTemplate: (template) => {
    set({
      activeTemplate: template,
      draftSlots: template?.slots ?? [],
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

  saveTemplate: async (data) => {
    const { draftSlots } = get();
    const template = await createTemplate({
      ...data,
      slots: draftSlots,
      composition_strategy: data.composition_strategy ?? 'sequential',
    });
    // Refresh list
    void get().fetchTemplates();
    set({ activeTemplate: template });
    return template;
  },

  updateTemplate: async (id, data) => {
    const { draftSlots } = get();
    const template = await apiUpdateTemplate(id, {
      ...data,
      slots: draftSlots,
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

  roll: async (templateId, seed) => {
    set({ rolling: true });
    try {
      const result = await rollTemplate(templateId, { seed });
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
