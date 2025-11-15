import type { CubePosition, Formation } from '../stores/controlCubeStore';

export interface FormationTemplateOptions {
  center?: CubePosition;
  spacing?: number;
  radius?: number;
}

/**
 * Formation Templates
 *
 * Utilities for auto-arranging cubes into common formations
 */

/**
 * Arrange cubes in a horizontal line
 */
export function createLineFormation(
  cubeIds: string[],
  options: FormationTemplateOptions = {}
): Record<string, CubePosition> {
  const {
    center = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    spacing = 150,
  } = options;

  const positions: Record<string, CubePosition> = {};
  const count = cubeIds.length;
  const startX = center.x - ((count - 1) * spacing) / 2;

  cubeIds.forEach((cubeId, index) => {
    positions[cubeId] = {
      x: startX + index * spacing,
      y: center.y,
    };
  });

  return positions;
}

/**
 * Arrange cubes in a circle
 */
export function createCircleFormation(
  cubeIds: string[],
  options: FormationTemplateOptions = {}
): Record<string, CubePosition> {
  const {
    center = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    radius = 200,
  } = options;

  const positions: Record<string, CubePosition> = {};
  const count = cubeIds.length;
  const angleStep = (2 * Math.PI) / count;

  cubeIds.forEach((cubeId, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    positions[cubeId] = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });

  return positions;
}

/**
 * Arrange cubes in a grid
 */
export function createGridFormation(
  cubeIds: string[],
  options: FormationTemplateOptions = {}
): Record<string, CubePosition> {
  const {
    center = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    spacing = 150,
  } = options;

  const positions: Record<string, CubePosition> = {};
  const count = cubeIds.length;

  // Calculate grid dimensions (prefer square-ish grids)
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const gridWidth = (cols - 1) * spacing;
  const gridHeight = (rows - 1) * spacing;
  const startX = center.x - gridWidth / 2;
  const startY = center.y - gridHeight / 2;

  cubeIds.forEach((cubeId, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions[cubeId] = {
      x: startX + col * spacing,
      y: startY + row * spacing,
    };
  });

  return positions;
}

/**
 * Arrange cubes in a star pattern (center + surrounding)
 */
export function createStarFormation(
  cubeIds: string[],
  options: FormationTemplateOptions = {}
): Record<string, CubePosition> {
  const {
    center = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    radius = 200,
  } = options;

  const positions: Record<string, CubePosition> = {};

  if (cubeIds.length === 0) return positions;

  // First cube goes in center
  positions[cubeIds[0]] = { ...center };

  // Rest arranged in circle around center
  const outerCubes = cubeIds.slice(1);
  if (outerCubes.length > 0) {
    const angleStep = (2 * Math.PI) / outerCubes.length;

    outerCubes.forEach((cubeId, index) => {
      const angle = index * angleStep - Math.PI / 2;
      positions[cubeId] = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
    });
  }

  return positions;
}

/**
 * Create formation based on type
 */
export function createFormationTemplate(
  type: Formation['type'],
  cubeIds: string[],
  options: FormationTemplateOptions = {}
): Record<string, CubePosition> {
  switch (type) {
    case 'line':
      return createLineFormation(cubeIds, options);
    case 'circle':
      return createCircleFormation(cubeIds, options);
    case 'grid':
      return createGridFormation(cubeIds, options);
    case 'star':
      return createStarFormation(cubeIds, options);
    default:
      return {};
  }
}
