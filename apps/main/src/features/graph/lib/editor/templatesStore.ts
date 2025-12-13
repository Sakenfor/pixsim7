import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GraphTemplate, TemplateSource, TemplatePack } from './graphTemplates';
import { getGameWorld, saveGameWorldMeta } from '@lib/api/game';
import type { GameWorldDetail } from '@/lib/registries';
import builtinTemplatesJson from '@/data/graphTemplates.json';

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

  /** Phase 9: Template packs */
  packs: TemplatePack[];

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

  /** Toggle favorite status */
  toggleFavorite: (id: string) => Promise<void>;

  /** Load world templates from backend */
  loadWorldTemplates: (worldId: number) => Promise<void>;

  /** Clear user templates */
  clearUserTemplates: () => void;

  /** Phase 9: Pack management */
  getPacks: () => TemplatePack[];
  getPack: (id: string) => TemplatePack | null;
  createPack: (pack: Omit<TemplatePack, 'id' | 'createdAt'>) => TemplatePack;
  updatePack: (id: string, updates: Partial<TemplatePack>) => void;
  deletePack: (id: string) => void;
  getTemplatesByPack: (packId: string) => GraphTemplate[];
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
      packs: [],

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
          const updatedTemplates = [...worldTemplates, { ...template, source: 'world' as const, worldId }];

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
            userTemplates: [...state.userTemplates, { ...template, source: 'user' as const }],
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

      toggleFavorite: async (id: string) => {
        const template = get().getTemplate(id);
        if (!template) {
          throw new Error('Template not found');
        }

        const newFavoriteStatus = !template.isFavorite;

        // Update the template
        await get().updateTemplate(id, {
          isFavorite: newFavoriteStatus,
          updatedAt: Date.now(),
        });
      },

      clearUserTemplates: () => {
        set({ userTemplates: [] });
      },

      // Phase 9: Pack management
      getPacks: () => {
        return get().packs;
      },

      getPack: (id: string) => {
        return get().packs.find((p) => p.id === id) || null;
      },

      createPack: (pack) => {
        const newPack: TemplatePack = {
          ...pack,
          id: `pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          packs: [...state.packs, newPack],
        }));

        return newPack;
      },

      updatePack: (id, updates) => {
        set((state) => ({
          packs: state.packs.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        }));
      },

      deletePack: (id) => {
        // Remove pack
        set((state) => ({
          packs: state.packs.filter((p) => p.id !== id),
        }));

        // Remove pack ID from templates
        set((state) => ({
          userTemplates: state.userTemplates.map((t) =>
            t.packId === id ? { ...t, packId: undefined } : t
          ),
        }));
      },

      getTemplatesByPack: (packId) => {
        return get().getTemplates().filter((t) => t.packId === packId);
      },
    }),
    {
      name: 'pixsim7-graph-templates', // localStorage key
      version: 3, // Bumped version for pack support
      partialize: (state) => ({
        // Persist user templates and packs
        userTemplates: state.userTemplates,
        packs: state.packs,
      }),
    }
  )
);

// Initialize built-in templates on module load
useTemplateStore.getState().initBuiltinTemplates();
