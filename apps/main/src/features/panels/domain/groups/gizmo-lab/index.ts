/**
 * Gizmo Lab Panel Group
 *
 * Defines the gizmo lab workflow: two browsers (gizmo + tool) on the left,
 * two playgrounds (gizmo + tool) stacked on the right.
 */

import type { DockviewApi } from 'dockview-core';

import { definePanelGroup } from '@features/panels/lib/definePanelGroup';

export type GizmoLabSlot = 'gizmoBrowser' | 'toolBrowser' | 'gizmoPlayground' | 'toolPlayground';
export type GizmoLabPreset = 'full' | 'gizmosOnly' | 'toolsOnly';

const gizmoLabGroup = definePanelGroup<GizmoLabSlot, GizmoLabPreset>({
  id: 'gizmo-lab',
  title: 'Gizmo Lab',
  description: 'Gizmo and tool testing laboratory with browsers and playgrounds',
  icon: 'wrench',
  category: 'tools',
  tags: ['gizmos', 'tools', 'lab', 'testing'],

  panels: {
    gizmoBrowser: 'gizmo-browser',
    toolBrowser: 'tool-browser',
    gizmoPlayground: 'gizmo-playground',
    toolPlayground: 'tool-playground',
  },

  presets: {
    full: {
      slots: ['gizmoBrowser', 'toolBrowser', 'gizmoPlayground', 'toolPlayground'],
      description: 'All four panels: browsers left, playgrounds right',
    },
    gizmosOnly: {
      slots: ['gizmoBrowser', 'gizmoPlayground'],
      description: 'Gizmo browser and playground only',
    },
    toolsOnly: {
      slots: ['toolBrowser', 'toolPlayground'],
      description: 'Tool browser and playground only',
    },
  },

  panelTitles: {
    gizmoBrowser: 'Gizmo Browser',
    toolBrowser: 'Tool Browser',
    gizmoPlayground: 'Gizmo Playground',
    toolPlayground: 'Tool Playground',
  },

  defaultLayout: {
    create: (api, panelIds, activeSlots) => {
      const hasGizmoBrowser = activeSlots.includes('gizmoBrowser');
      const hasToolBrowser = activeSlots.includes('toolBrowser');
      const hasGizmoPlayground = activeSlots.includes('gizmoPlayground');
      const hasToolPlayground = activeSlots.includes('toolPlayground');

      type AddPanelPosition = Parameters<DockviewApi['addPanel']>[0]['position'];

      const addPanelIfMissing = (
        slotName: GizmoLabSlot,
        title: string,
        position?: AddPanelPosition,
      ) => {
        const panelId = panelIds[slotName];
        if (!panelId || api.getPanel(panelId)) return;
        api.addPanel({ id: panelId, component: panelId, title, position });
      };

      // Browsers on the left, stacked
      if (hasGizmoBrowser) {
        addPanelIfMissing('gizmoBrowser', 'Gizmo Browser');
      }

      if (hasToolBrowser) {
        const ref = hasGizmoBrowser ? panelIds.gizmoBrowser : undefined;
        addPanelIfMissing(
          'toolBrowser',
          'Tool Browser',
          ref ? { direction: 'below', referencePanel: ref } : undefined,
        );
      }

      // Playgrounds on the right, stacked
      if (hasGizmoPlayground) {
        const leftRef = hasGizmoBrowser
          ? panelIds.gizmoBrowser
          : hasToolBrowser
            ? panelIds.toolBrowser
            : undefined;
        addPanelIfMissing(
          'gizmoPlayground',
          'Gizmo Playground',
          leftRef ? { direction: 'right', referencePanel: leftRef } : undefined,
        );
      }

      if (hasToolPlayground) {
        const ref = hasGizmoPlayground ? panelIds.gizmoPlayground : undefined;
        addPanelIfMissing(
          'toolPlayground',
          'Tool Playground',
          ref ? { direction: 'below', referencePanel: ref } : undefined,
        );
      }
    },

    resolvePosition: (slotName, _panelId, api, panelIds) => {
      switch (slotName) {
        case 'toolBrowser':
          if (api.getPanel(panelIds.gizmoBrowser)) {
            return { direction: 'below', referencePanel: panelIds.gizmoBrowser };
          }
          break;
        case 'gizmoPlayground':
          if (api.getPanel(panelIds.gizmoBrowser)) {
            return { direction: 'right', referencePanel: panelIds.gizmoBrowser };
          }
          break;
        case 'toolPlayground':
          if (api.getPanel(panelIds.gizmoPlayground)) {
            return { direction: 'below', referencePanel: panelIds.gizmoPlayground };
          }
          break;
      }
      return undefined;
    },
  },

  minPanelsForTabs: 1,
  enableContextMenu: true,
  persistLayout: true,
});

export default gizmoLabGroup;

export const GIZMO_LAB_PANEL_IDS = gizmoLabGroup.panels;
export const GIZMO_LAB_PRESETS = {
  full: gizmoLabGroup.getPanelIds('full'),
  gizmosOnly: gizmoLabGroup.getPanelIds('gizmosOnly'),
  toolsOnly: gizmoLabGroup.getPanelIds('toolsOnly'),
} as const;
