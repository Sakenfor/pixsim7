/**
 * Cube Formation Calculations
 *
 * Mathematical functions for arranging cubes in various patterns.
 */

import type { CubePosition, FormationPattern, FormationOptions } from '../types';

export interface FormationConfig extends FormationOptions {
  columns?: number;
}

/**
 * Calculate cube positions for a dock formation (horizontal line at bottom)
 */
export function calculateDockFormation(
  cubeCount: number,
  spacing: number = 120,
  bottomOffset: number = 100
): CubePosition[] {
  const positions: CubePosition[] = [];
  const totalWidth = (cubeCount - 1) * spacing;
  const startX = (window.innerWidth - totalWidth) / 2;
  const y = window.innerHeight - bottomOffset;

  for (let i = 0; i < cubeCount; i++) {
    positions.push({
      x: startX + i * spacing,
      y,
    });
  }

  return positions;
}

/**
 * Calculate cube positions for a grid formation
 */
export function calculateGridFormation(
  cubeCount: number,
  columns: number = 3,
  spacing: number = 140,
  centerX?: number,
  centerY?: number
): CubePosition[] {
  const positions: CubePosition[] = [];
  const rows = Math.ceil(cubeCount / columns);

  const cx = centerX ?? window.innerWidth / 2;
  const cy = centerY ?? window.innerHeight / 2;

  const totalWidth = (columns - 1) * spacing;
  const totalHeight = (rows - 1) * spacing;
  const startX = cx - totalWidth / 2;
  const startY = cy - totalHeight / 2;

  for (let i = 0; i < cubeCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    positions.push({
      x: startX + col * spacing,
      y: startY + row * spacing,
    });
  }

  return positions;
}

/**
 * Calculate cube positions for a circle formation
 */
export function calculateCircleFormation(
  cubeCount: number,
  radius: number = 200,
  centerX?: number,
  centerY?: number,
  startAngle: number = 0
): CubePosition[] {
  const positions: CubePosition[] = [];
  const cx = centerX ?? window.innerWidth / 2;
  const cy = centerY ?? window.innerHeight / 2;
  const angleStep = (2 * Math.PI) / cubeCount;

  for (let i = 0; i < cubeCount; i++) {
    const angle = startAngle + i * angleStep;
    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return positions;
}

/**
 * Calculate cube positions for an arc formation (bottom arc)
 */
export function calculateArcFormation(
  cubeCount: number,
  radius: number = 300,
  arcAngle: number = Math.PI, // 180 degrees
  bottomOffset: number = 150
): CubePosition[] {
  const positions: CubePosition[] = [];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight - bottomOffset + radius;

  const startAngle = Math.PI / 2 - arcAngle / 2; // Center the arc
  const angleStep = arcAngle / (cubeCount - 1 || 1);

  for (let i = 0; i < cubeCount; i++) {
    const angle = startAngle + i * angleStep;
    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return positions;
}

/**
 * Calculate cube positions for a constellation formation (scattered with purpose)
 */
export function calculateConstellationFormation(
  cubeCount: number,
  centerX?: number,
  centerY?: number,
  spread: number = 250
): CubePosition[] {
  const positions: CubePosition[] = [];
  const cx = centerX ?? window.innerWidth / 2;
  const cy = centerY ?? window.innerHeight / 2;

  // Golden angle for nice distribution
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < cubeCount; i++) {
    const angle = i * goldenAngle;
    const radius = spread * Math.sqrt((i + 1) / cubeCount);

    positions.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return positions;
}

/**
 * Calculate cube positions for a scattered formation (seeded random)
 */
export function calculateScatteredFormation(
  cubeCount: number,
  seed: number = Date.now()
): CubePosition[] {
  const positions: CubePosition[] = [];
  const margin = 100;
  const width = window.innerWidth - 2 * margin;
  const height = window.innerHeight - 2 * margin;

  // Seeded random for consistency
  let random = seed;
  const seededRandom = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280;
  };

  for (let i = 0; i < cubeCount; i++) {
    positions.push({
      x: margin + seededRandom() * width,
      y: margin + seededRandom() * height,
    });
  }

  return positions;
}

/**
 * Main formation calculator - dispatches to specific pattern functions
 */
export function calculateFormation(config: FormationConfig): CubePosition[] {
  const {
    pattern,
    cubeCount,
    centerX,
    centerY,
    radius = 200,
    spacing = 120,
    columns = 3,
  } = config;

  switch (pattern) {
    case 'dock':
      return calculateDockFormation(cubeCount, spacing);

    case 'grid':
      return calculateGridFormation(cubeCount, columns, spacing, centerX, centerY);

    case 'circle':
      return calculateCircleFormation(cubeCount, radius, centerX, centerY);

    case 'arc':
      return calculateArcFormation(cubeCount, radius);

    case 'constellation':
      return calculateConstellationFormation(cubeCount, centerX, centerY, radius);

    case 'scattered':
      return calculateScatteredFormation(cubeCount);

    default:
      return calculateDockFormation(cubeCount, spacing);
  }
}

/**
 * Interpolate between two positions for smooth transitions
 */
export function interpolatePosition(
  from: CubePosition,
  to: CubePosition,
  progress: number
): CubePosition {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

/**
 * Easing function for smooth animations
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Easing function - ease out
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Easing function - ease in
 */
export function easeInCubic(t: number): number {
  return t * t * t;
}
