import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GraphTemplate, TemplateSource } from './graphTemplates';
import { getGameWorld, saveGameWorldMeta } from '../api/game';
import type { GameWorldDetail } from '@pixsim7/types';
import builtinTemplatesJson from '../../data/graphTemplates.json';

/**
 * Template Store State
 */
interface TemplateStoreState {
  /** User templates (stored in localStorage) */
  userTemplates: GraphTemplate[];

  /** Built-in templates (loaded from JSON) */
  builtinTemplates: GraphTemplate[];

  /** Per-world templates cache */
  worldTemplatesCache: Map<number, GraphTemplate[]>;

  /** Initialize built-in templates */
  initBuiltinTemplates: () => void;

  /** Get all templates for a given world context */
  getTemplates: (worldId?: number | null) => GraphTemplate[];

  /** Get templates by source */
  getTemplatesBySource: (source: TemplateSource, worldId?: number | null) => GraphTemplate[];

  /** Get a single template by ID */
  getTemplate: (id: string) => GraphTemplate | null;

  /** Add a new template */
  addTemplate: (template: GraphTemplate, worldId?: number | null) => Promise<void>;

  /** Update an existing template */
  updateTemplate: (id: string, updates: Partial<GraphTemplate>) => Promise<void>;

  /** Remove a template */
  removeTemplate: (id: string, worldId?: number | null) => Promise<void>;

  /** Load world templates from backend */
  loadWorldTemplates: (worldId: number) => Promise<void>;

  /** Clear user templates */
  clearUserTemplates: () => void;
}

/**
 * Helper to get templates from world meta
 */
function getWorldTemplates(world: GameWorldDetail): GraphTemplate[] {
  const meta = world.meta as any;
  const templates = meta?.graphTemplates || [];
  return templates.map((t: GraphTemplate) => ({
    ...t,
    source: 'world' as TemplateSource,
    worldId: world.id,
  }));
}

/**
 * Helper to set templates in world meta
 */
function setWorldTemplates(world: GameWorldDetail, templates: GraphTemplate[]): Record<string, unknown> {
  return {
    ...(world.meta || {}),
    graphTemplates: templates,
  };
}

/**
 * Graph Template Store with multiple sources
 *
 * This store manages templates from three sources:
 * 1. Built-in templates (shipped with the app, read-only)
 * 2. User templates (localStorage, editable)
 * 3. Per-world templates (world.meta.graphTemplates, editable)
 */
export const useTemplateStore = create<TemplateStoreState>()(
  persist(
    (set, get) => ({
      userTemplates: [],
      builtinTemplates: [],
      worldTemplatesCache: new Map(),

      initBuiltinTemplates: () => {
        // Load built-in templates from JSON
        const builtins = (builtinTemplatesJson as GraphTemplate[]).map((t) => ({
          ...t,
          source: 'builtin' as TemplateSource,
        }));
        set({ builtinTemplates: builtins });
      },

      getTemplates: (worldId?: number | null) => {
        const state = get();
        const templates: GraphTemplate[] = [
          ...state.builtinTemplates,
          ...state.userTemplates,
        ];

        // Add world templates if world context is set
        if (worldId !== null && worldId !== undefined) {
          const worldTemplates = state.worldTemplatesCache.get(worldId) || [];
          templates.push(...worldTemplates);
        }

        return templates;
      },

      getTemplatesBySource: (source: TemplateSource, worldId?: number | null) => {
        return get().getTemplates(worldId).filter((t) => t.source === source);
      },

      getTemplate: (id: string) => {
        const state = get();
        const allTemplates = [
          ...state.builtinTemplates,
          ...state.userTemplates,
          ...Array.from(state.worldTemplatesCache.values()).flat(),
        ];
        return allTemplates.find((t) => t.id === id) || null;
      },

      addTemplate: async (template: GraphTemplate, worldId?: number | null) => {
        const source = template.source || 'user';

        if (source === 'builtin') {
          throw new Error('Cannot add built-in templates');
        }

        if (source === 'world') {
          if (!worldId) {
            throw new Error('World ID required for world templates');
          }

          // Load current world data
          const world = await getGameWorld(worldId);
          const worldTemplates = getWorldTemplates(world);

          // Add new template
          const updatedTemplates = [...worldTemplates, { ...template, source: 'world', worldId }];

          // Save to backend
          const newMeta = setWorldTemplates(world, updatedTemplates);
          await saveGameWorldMeta(worldId, newMeta);

          // Update cache
          set((state) => {
            const newCache = new Map(state.worldTemplatesCache);
            newCache.set(worldId, updatedTemplates);
            return { worldTemplatesCache: newCache };
          });
        } else {
          // User template - save to localStorage
          set((state) => ({
            userTemplates: [...state.userTemplates, { ...template, source: 'user' }],
          }));
        }
      },

      updateTemplate: async (id: string, updates: Partial<GraphTemplate>) => {
        const template = get().getTemplate(id);
        if (!template) {
          throw new Error('Template not found');
        }

        if (template.source === 'builtin') {
          throw new Error('Cannot edit built-in templates');
        }

        if (template.source === 'world' && template.worldId) {
          // Load current world data
          const world = await getGameWorld(template.worldId);
          const worldTemplates = getWorldTemplates(world);

          // Update template
          const updatedTemplates = worldTemplates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          );

          // Save to backend
          const newMeta = setWorldTemplates(world, updatedTemplates);
          await saveGameWorldMeta(template.worldId, newMeta);

          // Update cache
          set((state) => {
            const newCache = new Map(state.worldTemplatesCache);
            newCache.set(template.worldId!, updatedTemplates);
            return { worldTemplatesCache: newCache };
          });
        } else {
          // User template
          set((state) => ({
            userTemplates: state.userTemplates.map((t) =>
              t.id === id ? { ...t, ...updates } : t
            ),
          }));
        }
      },

      removeTemplate: async (id: string, worldId?: number | null) => {
        const template = get().getTemplate(id);
        if (!template) {
          throw new Error('Template not found');
        }

        if (template.source === 'builtin') {
          throw new Error('Cannot delete built-in templates');
        }

        if (template.source === 'world' && template.worldId) {
          // Load current world data
          const world = await getGameWorld(template.worldId);
          const worldTemplates = getWorldTemplates(world);

          // Remove template
          const updatedTemplates = worldTemplates.filter((t) => t.id !== id);

          // Save to backend
          const newMeta = setWorldTemplates(world, updatedTemplates);
          await saveGameWorldMeta(template.worldId, newMeta);

          // Update cache
          set((state) => {
            const newCache = new Map(state.worldTemplatesCache);
            newCache.set(template.worldId!, updatedTemplates);
            return { worldTemplatesCache: newCache };
          });
        } else {
          // User template
          set((state) => ({
            userTemplates: state.userTemplates.filter((t) => t.id !== id),
          }));
        }
      },

      loadWorldTemplates: async (worldId: number) => {
        try {
          const world = await getGameWorld(worldId);
          const worldTemplates = getWorldTemplates(world);

          set((state) => {
            const newCache = new Map(state.worldTemplatesCache);
            newCache.set(worldId, worldTemplates);
            return { worldTemplatesCache: newCache };
          });
        } catch (error) {
          console.error(`Failed to load world templates for world ${worldId}:`, error);
          // Set empty array on error
          set((state) => {
            const newCache = new Map(state.worldTemplatesCache);
            newCache.set(worldId, []);
            return { worldTemplatesCache: newCache };
          });
        }
      },

      clearUserTemplates: () => {
        set({ userTemplates: [] });
      },
    }),
    {
      name: 'pixsim7-graph-templates', // localStorage key
      version: 2, // Bumped version for new structure
      partialize: (state) => ({
        // Only persist user templates
        userTemplates: state.userTemplates,
      }),
    }
  )
);

// Initialize built-in templates on module load
useTemplateStore.getState().initBuiltinTemplates();
