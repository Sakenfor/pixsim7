/**
 * Cubes Capability Registration
 *
 * Registers cubes as a feature in the capabilities system with actions and states.
 */

import { registerCompleteFeature, useCapabilityStore } from '@lib/capabilities';
import { useCubeStore } from '../useCubeStore';
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

// Internal state for visibility (since store doesn't track this)
let cubesVisible = true;
let currentFormation: FormationPattern = 'arc';
const visibilityListeners = new Set<(visible: boolean) => void>();
const formationListeners = new Set<(formation: FormationPattern) => void>();

/**
 * Toggle cubes visibility
 */
export function toggleCubesVisibility(): boolean {
  cubesVisible = !cubesVisible;
  visibilityListeners.forEach((listener) => listener(cubesVisible));
  return cubesVisible;
}

/**
 * Set cubes visibility
 */
export function setCubesVisibility(visible: boolean): void {
  cubesVisible = visible;
  visibilityListeners.forEach((listener) => listener(cubesVisible));
}

/**
 * Get cubes visibility
 */
export function getCubesVisibility(): boolean {
  return cubesVisible;
}

/**
 * Subscribe to visibility changes
 */
export function subscribeToVisibility(callback: (visible: boolean) => void): () => void {
  visibilityListeners.add(callback);
  return () => visibilityListeners.delete(callback);
}

/**
 * Cycle to next formation
 */
export function cycleFormation(): FormationPattern {
  const currentIndex = FORMATIONS.indexOf(currentFormation);
  const nextIndex = (currentIndex + 1) % FORMATIONS.length;
  currentFormation = FORMATIONS[nextIndex];
  formationListeners.forEach((listener) => listener(currentFormation));
  return currentFormation;
}

/**
 * Set formation
 */
export function setFormation(formation: FormationPattern): void {
  currentFormation = formation;
  formationListeners.forEach((listener) => listener(currentFormation));
}

/**
 * Get current formation
 */
export function getFormation(): FormationPattern {
  return currentFormation;
}

/**
 * Subscribe to formation changes
 */
export function subscribeToFormation(callback: (formation: FormationPattern) => void): () => void {
  formationListeners.add(callback);
  return () => formationListeners.delete(callback);
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
        visible: cubesVisible,
        formation: currentFormation,
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
        enabled: () => !cubesVisible,
      },
      {
        id: 'cubes.hide',
        name: 'Hide Cubes',
        description: 'Hide the cube overlay',
        icon: '🙈',
        execute: () => {
          setCubesVisibility(false);
        },
        enabled: () => cubesVisible,
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
        enabled: () => currentFormation !== 'dock',
      },
      {
        id: 'cubes.formation.arc',
        name: 'Arc Formation',
        description: 'Arrange cubes in arc layout',
        icon: '🌈',
        execute: () => setFormation('arc'),
        enabled: () => currentFormation !== 'arc',
      },
      {
        id: 'cubes.formation.circle',
        name: 'Circle Formation',
        description: 'Arrange cubes in circle layout',
        icon: '⭕',
        execute: () => setFormation('circle'),
        enabled: () => currentFormation !== 'circle',
      },
      {
        id: 'cubes.formation.grid',
        name: 'Grid Formation',
        description: 'Arrange cubes in grid layout',
        icon: '📊',
        execute: () => setFormation('grid'),
        enabled: () => currentFormation !== 'grid',
      },
      {
        id: 'cubes.formation.constellation',
        name: 'Constellation Formation',
        description: 'Arrange cubes in constellation layout',
        icon: '✨',
        execute: () => setFormation('constellation'),
        enabled: () => currentFormation !== 'constellation',
      },
      {
        id: 'cubes.formation.scattered',
        name: 'Scattered Formation',
        description: 'Arrange cubes in scattered layout',
        icon: '🎯',
        execute: () => setFormation('scattered'),
        enabled: () => currentFormation !== 'scattered',
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
        getValue: () => cubesVisible,
        subscribe: subscribeToVisibility,
        readonly: true,
      },
      {
        id: 'cubes.formation',
        name: 'Current Formation',
        getValue: () => currentFormation,
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
  const store = useCapabilityStore.getState();

  // Unregister feature
  store.unregisterFeature('cubes');

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
  actionIds.forEach((id) => store.unregisterAction(id));

  // Unregister states
  const stateIds = ['cubes.visible', 'cubes.formation', 'cubes.count', 'cubes.store'];
  stateIds.forEach((id) => store.unregisterState(id));
}
