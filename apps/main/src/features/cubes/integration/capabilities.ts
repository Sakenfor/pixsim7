/**
 * Cubes Capability Registration
 *
 * Registers cubes as a feature in the capabilities system with actions and states.
 */

import {
  registerCompleteFeature,
  unregisterAction,
  unregisterFeature,
  unregisterState,
} from '@lib/capabilities';
import { useCubeStore } from '../useCubeStore';
import { useCubeSettingsStore } from '../stores/cubeSettingsStore';
import type { FormationPattern } from '@pixsim7/pixcubes';

// Formation cycle order
const FORMATIONS: FormationPattern[] = [
  'dock',
  'arc',
  'circle',
  'grid',
  'constellation',
  'scattered',
];

/**
 * Toggle cubes visibility
 */
export function toggleCubesVisibility(): boolean {
  return useCubeSettingsStore.getState().toggleVisible();
}

/**
 * Set cubes visibility
 */
export function setCubesVisibility(visible: boolean): void {
  useCubeSettingsStore.getState().setVisible(visible);
}

/**
 * Get cubes visibility
 */
export function getCubesVisibility(): boolean {
  return useCubeSettingsStore.getState().visible;
}

/**
 * Subscribe to visibility changes
 */
export function subscribeToVisibility(callback: (visible: boolean) => void): () => void {
  let last = useCubeSettingsStore.getState().visible;
  return useCubeSettingsStore.subscribe((state) => {
    if (state.visible === last) return;
    last = state.visible;
    callback(state.visible);
  });
}

/**
 * Cycle to next formation
 */
export function cycleFormation(): FormationPattern {
  const settings = useCubeSettingsStore.getState();
  const currentIndex = FORMATIONS.indexOf(settings.formation);
  const nextIndex = (currentIndex + 1) % FORMATIONS.length;
  const nextFormation = FORMATIONS[nextIndex];
  settings.setFormation(nextFormation);
  return nextFormation;
}

/**
 * Set formation
 */
export function setFormation(formation: FormationPattern): void {
  useCubeSettingsStore.getState().setFormation(formation);
}

/**
 * Get current formation
 */
export function getFormation(): FormationPattern {
  return useCubeSettingsStore.getState().formation;
}

/**
 * Subscribe to formation changes
 */
export function subscribeToFormation(callback: (formation: FormationPattern) => void): () => void {
  let last = useCubeSettingsStore.getState().formation;
  return useCubeSettingsStore.subscribe((state) => {
    if (state.formation === last) return;
    last = state.formation;
    callback(state.formation);
  });
}

/**
 * Register cubes capabilities
 */
export function registerCubesCapabilities(): void {
  registerCompleteFeature({
    feature: {
      id: 'cubes',
      name: 'Cube Formation',
      description: '3D cube widget overlay with formation patterns',
      icon: '🎲',
      category: 'utility',
      priority: 50,
      getState: () => ({
        visible: useCubeSettingsStore.getState().visible,
        formation: useCubeSettingsStore.getState().formation,
        cubeCount: Object.keys(useCubeStore.getState().cubes).length,
      }),
      enabled: () => true,
    },
    actions: [
      {
        id: 'cubes.toggle',
        name: 'Toggle Cubes',
        description: 'Show or hide the cube overlay',
        icon: '👁️',
        shortcut: 'Ctrl+Shift+C',
        execute: () => {
          toggleCubesVisibility();
        },
      },
      {
        id: 'cubes.show',
        name: 'Show Cubes',
        description: 'Show the cube overlay',
        icon: '👁️',
        execute: () => {
          setCubesVisibility(true);
        },
        enabled: () => !useCubeSettingsStore.getState().visible,
      },
      {
        id: 'cubes.hide',
        name: 'Hide Cubes',
        description: 'Hide the cube overlay',
        icon: '🙈',
        execute: () => {
          setCubesVisibility(false);
        },
        enabled: () => useCubeSettingsStore.getState().visible,
      },
      {
        id: 'cubes.cycleFormation',
        name: 'Cycle Formation',
        description: 'Switch to next formation pattern',
        icon: '🔄',
        shortcut: 'Ctrl+Shift+F',
        execute: () => {
          cycleFormation();
        },
      },
      {
        id: 'cubes.formation.dock',
        name: 'Dock Formation',
        description: 'Arrange cubes in dock layout',
        icon: '📥',
        execute: () => setFormation('dock'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'dock',
      },
      {
        id: 'cubes.formation.arc',
        name: 'Arc Formation',
        description: 'Arrange cubes in arc layout',
        icon: '🌈',
        execute: () => setFormation('arc'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'arc',
      },
      {
        id: 'cubes.formation.circle',
        name: 'Circle Formation',
        description: 'Arrange cubes in circle layout',
        icon: '⭕',
        execute: () => setFormation('circle'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'circle',
      },
      {
        id: 'cubes.formation.grid',
        name: 'Grid Formation',
        description: 'Arrange cubes in grid layout',
        icon: '📊',
        execute: () => setFormation('grid'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'grid',
      },
      {
        id: 'cubes.formation.constellation',
        name: 'Constellation Formation',
        description: 'Arrange cubes in constellation layout',
        icon: '✨',
        execute: () => setFormation('constellation'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'constellation',
      },
      {
        id: 'cubes.formation.scattered',
        name: 'Scattered Formation',
        description: 'Arrange cubes in scattered layout',
        icon: '🎯',
        execute: () => setFormation('scattered'),
        enabled: () => useCubeSettingsStore.getState().formation !== 'scattered',
      },
      {
        id: 'cubes.clearAll',
        name: 'Clear All Cubes',
        description: 'Remove all cubes from the overlay',
        icon: '🗑️',
        execute: () => {
          useCubeStore.getState().clearCubes();
        },
        enabled: () => Object.keys(useCubeStore.getState().cubes).length > 0,
      },
    ],
    states: [
      {
        id: 'cubes.visible',
        name: 'Cubes Visible',
        getValue: () => useCubeSettingsStore.getState().visible,
        subscribe: subscribeToVisibility,
        readonly: true,
      },
      {
        id: 'cubes.formation',
        name: 'Current Formation',
        getValue: () => useCubeSettingsStore.getState().formation,
        subscribe: subscribeToFormation,
        readonly: true,
      },
      {
        id: 'cubes.count',
        name: 'Cube Count',
        getValue: () => Object.keys(useCubeStore.getState().cubes).length,
        subscribe: (callback) => useCubeStore.subscribe((state) => callback(Object.keys(state.cubes).length)),
        readonly: true,
      },
      {
        id: 'cubes.store',
        name: 'Cube Store',
        getValue: () => useCubeStore.getState(),
        subscribe: (callback) => useCubeStore.subscribe(callback),
        readonly: false,
      },
    ],
  });

  console.log('[cubes] Registered cubes capabilities');
}

/**
 * Unregister cubes capabilities
 */
export function unregisterCubesCapabilities(): void {
  // Unregister feature
  unregisterFeature('cubes');

  // Unregister actions
  const actionIds = [
    'cubes.toggle',
    'cubes.show',
    'cubes.hide',
    'cubes.cycleFormation',
    'cubes.formation.dock',
    'cubes.formation.arc',
    'cubes.formation.circle',
    'cubes.formation.grid',
    'cubes.formation.constellation',
    'cubes.formation.scattered',
    'cubes.clearAll',
  ];
  actionIds.forEach((id) => unregisterAction(id));

  // Unregister states
  const stateIds = ['cubes.visible', 'cubes.formation', 'cubes.count', 'cubes.store'];
  stateIds.forEach((id) => unregisterState(id));
}
