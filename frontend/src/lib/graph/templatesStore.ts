import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GraphTemplate } from './graphTemplates';

/**
 * Template Store State
 */
interface TemplateStoreState {
  /** All saved templates */
  templates: GraphTemplate[];

  /** Get all templates */
  getTemplates: () => GraphTemplate[];

  /** Get a single template by ID */
  getTemplate: (id: string) => GraphTemplate | null;

  /** Add a new template */
  addTemplate: (template: GraphTemplate) => void;

  /** Update an existing template */
  updateTemplate: (id: string, updates: Partial<GraphTemplate>) => void;

  /** Remove a template */
  removeTemplate: (id: string) => void;

  /** Clear all templates */
  clearTemplates: () => void;
}

/**
 * Graph Template Store with localStorage persistence
 *
 * This store manages the collection of saved graph templates.
 * Templates are automatically persisted to localStorage.
 */
export const useTemplateStore = create<TemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: [],

      getTemplates: () => {
        return get().templates;
      },

      getTemplate: (id: string) => {
        return get().templates.find((t) => t.id === id) || null;
      },

      addTemplate: (template: GraphTemplate) => {
        set((state) => ({
          templates: [...state.templates, template],
        }));
      },

      updateTemplate: (id: string, updates: Partial<GraphTemplate>) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      removeTemplate: (id: string) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));
      },

      clearTemplates: () => {
        set({ templates: [] });
      },
    }),
    {
      name: 'pixsim7-graph-templates', // localStorage key
      version: 1,
    }
  )
);
