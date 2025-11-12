import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PanelType = 'gallery' | 'scene' | 'graph' | 'player' | 'console';

export type PanelInstance = {
  id: string;
  type: PanelType;
  title?: string;
  props?: Record<string, any>;
};

export type SplitNode =
  | { kind: 'panel'; panelId: string }
  | { kind: 'split'; direction: 'row' | 'col'; sizes: number[]; children: SplitNode[] };

export type LayoutState = {
  panels: Record<string, PanelInstance>;
  root: SplitNode | null;
  activePanelId?: string;
}

export type LayoutActions = {
  setRoot: (root: SplitNode | null) => void;
  addPanel: (panel: PanelInstance) => void;
  removePanel: (panelId: string) => void;
  movePanel: (panelId: string, target: SplitNode) => void;
  setActive: (panelId?: string) => void;
  load: () => void;
  save: () => void;
  reset: () => void;
  applyPreset: (name: 'galleryLeft' | 'galleryRight' | 'fullscreenGallery' | 'sceneBelow') => void;
}

const STORAGE_KEY = 'workspace_layout_v1';

const presets: Record<string, { panels: PanelInstance[]; root: SplitNode }> = {
  galleryLeft: {
    panels: [
      { id: 'p_gallery', type: 'gallery', title: 'Gallery' },
      { id: 'p_scene', type: 'scene', title: 'Scene Builder' },
    ],
    root: {
      kind: 'split', direction: 'row', sizes: [35, 65], children: [
        { kind: 'panel', panelId: 'p_gallery' },
        { kind: 'panel', panelId: 'p_scene' },
      ]
    }
  },
  galleryRight: {
    panels: [
      { id: 'p_scene', type: 'scene', title: 'Scene Builder' },
      { id: 'p_gallery', type: 'gallery', title: 'Gallery' },
    ],
    root: {
      kind: 'split', direction: 'row', sizes: [65, 35], children: [
        { kind: 'panel', panelId: 'p_scene' },
        { kind: 'panel', panelId: 'p_gallery' },
      ]
    }
  },
  fullscreenGallery: {
    panels: [{ id: 'p_gallery', type: 'gallery', title: 'Gallery' }],
    root: { kind: 'panel', panelId: 'p_gallery' }
  },
  sceneBelow: {
    panels: [
      { id: 'p_gallery', type: 'gallery', title: 'Gallery' },
      { id: 'p_scene', type: 'scene', title: 'Scene Builder' },
    ],
    root: {
      kind: 'split', direction: 'col', sizes: [55, 45], children: [
        { kind: 'panel', panelId: 'p_gallery' },
        { kind: 'panel', panelId: 'p_scene' },
      ]
    }
  }
};

export const useLayoutStore = create<LayoutState & LayoutActions>()(
  persist(
  (set) => ({
  panels: {},
  root: null,
  activePanelId: undefined,

  setRoot: (root) => set({ root }),
  addPanel: (panel) => set((s) => ({ panels: { ...s.panels, [panel.id]: panel } })),
  removePanel: (panelId) => set((s) => {
    const panels = { ...s.panels };
    delete panels[panelId];
    // TODO: prune from tree if needed
    return { panels };
  }),
  movePanel: (_panelId, _target) => {
    // TODO: implement moving within tree
  },
  setActive: (panelId) => set({ activePanelId: panelId }),

  // With persist, load/save are effectively no-ops kept for API compatibility
  load: () => {},
  save: () => {},
  reset: () => set({ panels: {}, root: null, activePanelId: undefined }),
  applyPreset: (name) => {
    const p = presets[name];
    if (!p) return;
    const map: Record<string, PanelInstance> = {};
    p.panels.forEach((pn) => { map[pn.id] = pn; });
    set({ panels: map, root: p.root, activePanelId: p.panels[0]?.id });
  },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ panels: s.panels, root: s.root, activePanelId: s.activePanelId }),
      version: 1,
    }
  )
);
