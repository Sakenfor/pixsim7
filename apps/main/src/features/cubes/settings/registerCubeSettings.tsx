/**
 * Cubes Settings Registration
 *
 * Registers cube settings schema + settings panel entry.
 */

import type { FormationPattern } from '@pixsim7/pixcubes';

import {
  settingsSchemaRegistry,
  type SettingStoreAdapter,
  type SettingTab,
} from '@features/settings';

import { useCubeSettingsStore, type CubeFaceMode } from '../stores/cubeSettingsStore';

const cubesTab: SettingTab = {
  id: 'cubes',
  label: 'Cube Overlay',
  groups: [
    {
      id: 'cubes-visibility',
      title: 'Visibility',
      description: 'Toggle the cube overlay on or off.',
      fields: [
        {
          id: 'visible',
          type: 'toggle',
          label: 'Show Cube Overlay',
          defaultValue: true,
        },
      ],
    },
    {
      id: 'cubes-formation',
      title: 'Formation',
      description: 'Default cube layout pattern.',
      fields: [
        {
          id: 'formation',
          type: 'select',
          label: 'Formation Pattern',
          options: [
            { value: 'dock', label: 'Dock' },
            { value: 'arc', label: 'Arc' },
            { value: 'circle', label: 'Circle' },
            { value: 'grid', label: 'Grid' },
            { value: 'constellation', label: 'Constellation' },
            { value: 'scattered', label: 'Scattered' },
          ],
          defaultValue: 'arc',
        },
      ],
    },
    {
      id: 'cubes-default-face',
      title: 'Default Face',
      description: 'Which face the cube starts on.',
      fields: [
        {
          id: 'activeFace',
          type: 'select',
          label: 'Default Face',
          options: [
            { value: 'panels', label: 'Minimized Panels' },
            { value: 'launcher', label: 'Quick Launcher' },
            { value: 'pinned', label: 'Pinned (soon)' },
            { value: 'recent', label: 'Recent (soon)' },
          ],
          defaultValue: 'panels',
        },
      ],
    },
  ],
};

function useCubeSettingsAdapter(): SettingStoreAdapter {
  const visible = useCubeSettingsStore((s) => s.visible);
  const formation = useCubeSettingsStore((s) => s.formation);
  const activeFace = useCubeSettingsStore((s) => s.activeFace);
  const setVisible = useCubeSettingsStore((s) => s.setVisible);
  const setFormation = useCubeSettingsStore((s) => s.setFormation);
  const setActiveFace = useCubeSettingsStore((s) => s.setActiveFace);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'visible') return visible;
      if (fieldId === 'formation') return formation;
      if (fieldId === 'activeFace') return activeFace;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'visible') setVisible(Boolean(value));
      if (fieldId === 'formation') setFormation(value as FormationPattern);
      if (fieldId === 'activeFace') setActiveFace(value as CubeFaceMode);
    },
    getAll: () => ({ visible, formation, activeFace }),
  };
}

export function registerCubeSettings(): () => void {
  const unregisterSchema = settingsSchemaRegistry.register({
    categoryId: 'workspace',
    tab: cubesTab,
    useStore: useCubeSettingsAdapter,
  });

  return () => {
    unregisterSchema();
  };
}
