import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { SceneCollection, SceneCollectionType } from '@domain/sceneCollection';
import { createTemporalStore, sceneCollectionStorePartialize } from '../_shared/temporal';

interface SceneCollectionState {
  /** All scene collections by ID */
  collections: Record<string, SceneCollection>;

  /** Currently active collection ID (per-world in UI context) */
  currentCollectionId: string | null;

  // CRUD operations
  createCollection: (title: string, type: SceneCollectionType) => string;
  getCollection: (id: string) => SceneCollection | null;
  updateCollection: (id: string, patch: Partial<SceneCollection>) => void;
  deleteCollection: (id: string) => void;

  // Scene management
  addSceneToCollection: (collectionId: string, sceneId: string, order?: number) => void;
  removeSceneFromCollection: (collectionId: string, sceneId: string) => void;
  reorderScenes: (collectionId: string, sceneIds: string[]) => void;

  // Selection
  setCurrentCollection: (id: string | null) => void;
  getCurrentCollection: () => SceneCollection | null;

  // Query helpers
  getCollectionsForArc: (arcGraphId: string) => SceneCollection[];
  getCollectionsForCampaign: (campaignId: string) => SceneCollection[];
  getCollectionForScene: (sceneId: string) => SceneCollection | null;

  // Import/Export
  exportCollection: (id: string) => string | null;
  importCollection: (json: string) => string | null;
}

export const useSceneCollectionStore = create<SceneCollectionState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({
        collections: {},
        currentCollectionId: null,

      createCollection: (title, type) => {
        const id = crypto.randomUUID();
        const collection: SceneCollection = {
          id,
          title,
          type,
          scenes: [],
          metadata: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          collections: {
            ...state.collections,
            [id]: collection,
          },
        }), false, 'createCollection');

        return id;
      },

      getCollection: (id) => {
        return get().collections[id] || null;
      },

      updateCollection: (id, patch) => {
        set((state) => ({
          collections: {
            ...state.collections,
            [id]: {
              ...state.collections[id],
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'updateCollection');
      },

      deleteCollection: (id) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.collections;
          return {
            collections: rest,
            currentCollectionId: state.currentCollectionId === id ? null : state.currentCollectionId,
          };
        }, false, 'deleteCollection');
      },

      addSceneToCollection: (collectionId, sceneId, order) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        const maxOrder = Math.max(0, ...collection.scenes.map(s => s.order));
        const newOrder = order !== undefined ? order : maxOrder + 1;

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: [
                ...collection.scenes,
                { sceneId, order: newOrder },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'addSceneToCollection');
      },

      removeSceneFromCollection: (collectionId, sceneId) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: collection.scenes.filter(s => s.sceneId !== sceneId),
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'removeSceneFromCollection');
      },

      reorderScenes: (collectionId, sceneIds) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        const reordered = sceneIds.map((sceneId, index) => {
          const existing = collection.scenes.find(s => s.sceneId === sceneId);
          return {
            sceneId,
            order: index,
            optional: existing?.optional,
            unlockConditions: existing?.unlockConditions,
          };
        });

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: reordered,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'reorderScenes');
      },

      setCurrentCollection: (id) => {
        set({ currentCollectionId: id }, false, 'setCurrentCollection');
      },

      getCurrentCollection: () => {
        const { currentCollectionId, collections } = get();
        return currentCollectionId ? collections[currentCollectionId] || null : null;
      },

      getCollectionsForArc: (arcGraphId) => {
        const { collections } = get();
        return Object.values(collections).filter(c => c.arcGraphId === arcGraphId);
      },

      getCollectionsForCampaign: (campaignId) => {
        const { collections } = get();
        return Object.values(collections).filter(c => c.campaignId === campaignId);
      },

      getCollectionForScene: (sceneId) => {
        const { collections } = get();
        return Object.values(collections).find(c =>
          c.scenes.some(s => s.sceneId === sceneId)
        ) || null;
      },

      exportCollection: (id) => {
        const collection = get().collections[id];
        return collection ? JSON.stringify(collection, null, 2) : null;
      },

      importCollection: (json) => {
        try {
          const collection = JSON.parse(json) as SceneCollection;
          set((state) => ({
            collections: {
              ...state.collections,
              [collection.id]: collection,
            },
          }), false, 'importCollection');
          return collection.id;
        } catch (error) {
          console.error('Failed to import collection:', error);
          return null;
        }
      },
      }),
      {
        limit: 50,
        partialize: sceneCollectionStorePartialize,
      }
    ),
    { name: 'SceneCollectionStore' }
  )
);

// Export temporal actions for undo/redo
export const useSceneCollectionStoreUndo = () => useSceneCollectionStore.temporal.undo;
export const useSceneCollectionStoreRedo = () => useSceneCollectionStore.temporal.redo;
export const useSceneCollectionStoreCanUndo = () => useSceneCollectionStore.temporal.getState().pastStates.length > 0;
export const useSceneCollectionStoreCanRedo = () => useSceneCollectionStore.temporal.getState().futureStates.length > 0;
