/**
 * Botanical Surface Profile
 *
 * Example profile for plant care domain.
 * Focuses on plant health, hydration, and growth.
 */

import type { SurfaceProfile, SurfaceRegion, SurfaceInstrument, SurfaceDimension, DimensionContribution } from '@pixsim7/shared.types';
import { registerProfile } from './registry';

// =============================================================================
// Regions
// =============================================================================

const botanicalRegions: SurfaceRegion[] = [
  {
    id: 'leaves_upper',
    label: 'Upper Leaves',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 5 }, { x: 65, y: 5 },
        { x: 70, y: 25 }, { x: 30, y: 25 },
      ],
    },
    properties: { hydration: 0.4, dust: 0.6, chlorophyll: 0.8, sun_exposure: 0.9 },
    highlightColor: '#4ADE80',
    group: 'foliage',
  },
  {
    id: 'leaves_lower',
    label: 'Lower Leaves',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 25, y: 25 }, { x: 75, y: 25 },
        { x: 80, y: 50 }, { x: 20, y: 50 },
      ],
    },
    properties: { hydration: 0.5, dust: 0.4, chlorophyll: 0.7, sun_exposure: 0.5 },
    highlightColor: '#22C55E',
    group: 'foliage',
  },
  {
    id: 'stem',
    label: 'Stem',
    shape: 'rect',
    coords: { type: 'rect', x: 45, y: 50, width: 10, height: 25 },
    properties: { hydration: 0.6, strength: 0.7, nutrients: 0.5 },
    highlightColor: '#84CC16',
    group: 'structure',
  },
  {
    id: 'soil_surface',
    label: 'Soil Surface',
    shape: 'rect',
    coords: { type: 'rect', x: 20, y: 75, width: 60, height: 10 },
    properties: { moisture: 0.3, nutrients: 0.5, aeration: 0.6, compaction: 0.3 },
    highlightColor: '#92400E',
    group: 'soil',
  },
  {
    id: 'soil_deep',
    label: 'Root Zone',
    shape: 'rect',
    coords: { type: 'rect', x: 22, y: 85, width: 56, height: 12 },
    properties: { moisture: 0.2, nutrients: 0.4, root_density: 0.7 },
    highlightColor: '#78350F',
    group: 'soil',
  },
  {
    id: 'flowers',
    label: 'Flowers',
    shape: 'circle',
    coords: { type: 'circle', cx: 50, cy: 12, radius: 8 },
    properties: { bloom_stage: 0.5, pollen: 0.6, fragrance: 0.4, hydration: 0.5 },
    highlightColor: '#F472B6',
    group: 'foliage',
  },
  {
    id: 'pot',
    label: 'Pot',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 15, y: 75 }, { x: 85, y: 75 },
        { x: 80, y: 100 }, { x: 20, y: 100 },
      ],
    },
    properties: { drainage: 0.7, size: 0.6 },
    highlightColor: '#D97706',
    group: 'container',
  },
];

// =============================================================================
// Dimensions
// =============================================================================

const botanicalDimensions: SurfaceDimension[] = [
  {
    id: 'hydration',
    name: 'Hydration',
    description: 'Plant water levels',
    color: '#74C0FC',
    icon: '💧',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.01, // Slow natural drying
    initialValue: 0.3,
    thresholds: { low: 0.2, medium: 0.4, high: 0.7, peak: 0.9 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'health',
    name: 'Health',
    description: 'Overall plant health',
    color: '#69DB7C',
    icon: '🌱',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.005,
    initialValue: 0.5,
    thresholds: { low: 0.3, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'cleanliness',
    name: 'Cleanliness',
    description: 'Leaf cleanliness (dust-free)',
    color: '#A78BFA',
    icon: '✨',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.008, // Dust accumulates
    initialValue: 0.4,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
  },
  {
    id: 'nutrients',
    name: 'Nutrients',
    description: 'Soil nutrient levels',
    color: '#FBBF24',
    icon: '🧪',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.003, // Very slow depletion
    initialValue: 0.4,
    thresholds: { low: 0.2, medium: 0.4, high: 0.7, peak: 0.9 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'happiness',
    name: 'Happiness',
    description: 'Plant happiness and vigor',
    color: '#F472B6',
    icon: '😊',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.01,
    initialValue: 0.5,
    thresholds: { low: 0.25, medium: 0.5, high: 0.75, peak: 0.9 },
    visible: true,
  },
  {
    id: 'overwatering',
    name: 'Overwatering Risk',
    description: 'Risk of root rot (lower is better)',
    color: '#FCA5A5',
    icon: '⚠️',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.02, // Drains over time
    initialValue: 0,
    thresholds: { low: 0.1, medium: 0.3, high: 0.5, peak: 0.7 },
    visible: true,
  },
];

// =============================================================================
// Instruments
// =============================================================================

const botanicalInstruments: SurfaceInstrument[] = [
  {
    id: 'watering_can',
    category: 'liquid',
    label: 'Watering Can',
    description: 'Water the soil gently',
    visual: {
      model: 'watering_can',
      baseColor: '#93C5FD',
      activeColor: '#3B82F6',
      particles: { type: 'droplets', density: 0.6 },
      icon: '🚿',
    },
    physics: {
      pressure: 0.4,
      speed: 0.5,
      viscosity: 0.1,
    },
    feedback: {
      impact: { type: 'splash', intensity: 0.3, ripples: true },
    },
    constraints: {
      allowedRegions: ['soil_surface', 'soil_deep', 'pot'],
    },
  },
  {
    id: 'spray_bottle',
    category: 'mist',
    label: 'Misting Spray',
    description: 'Mist the leaves with water',
    visual: {
      model: 'spray',
      baseColor: '#BAE6FD',
      activeColor: '#38BDF8',
      particles: { type: 'mist', density: 0.8 },
      icon: '💨',
    },
    physics: {
      pressure: 0.2,
      speed: 0.7,
    },
    feedback: {
      reaction: 'refreshed',
    },
    constraints: {
      allowedRegions: ['leaves_upper', 'leaves_lower', 'flowers', 'stem'],
    },
  },
  {
    id: 'cloth',
    category: 'cleaning',
    label: 'Soft Cloth',
    description: 'Wipe dust from leaves',
    visual: {
      model: 'cloth',
      baseColor: '#FDF4FF',
      activeColor: '#F5D0FE',
      trail: true,
      icon: '🧽',
    },
    physics: {
      pressure: 0.3,
      speed: 0.4,
    },
    feedback: {
      reaction: 'clean',
    },
    constraints: {
      allowedRegions: ['leaves_upper', 'leaves_lower'],
    },
  },
  {
    id: 'fertilizer',
    category: 'nutrient',
    label: 'Fertilizer',
    description: 'Add nutrients to soil',
    visual: {
      model: 'fertilizer',
      baseColor: '#FDE68A',
      activeColor: '#FBBF24',
      particles: { type: 'granules', density: 0.4 },
      icon: '🧴',
    },
    physics: {
      pressure: 0.5,
      speed: 0.3,
    },
    constraints: {
      allowedRegions: ['soil_surface', 'soil_deep'],
      cooldown: 5000, // Can only apply every 5 seconds
    },
  },
  {
    id: 'pruning_shears',
    category: 'tool',
    label: 'Pruning Shears',
    description: 'Trim dead leaves and stems',
    visual: {
      model: 'shears',
      baseColor: '#9CA3AF',
      activeColor: '#4B5563',
      icon: '✂️',
    },
    physics: {
      pressure: 0.7,
      speed: 0.6,
    },
    feedback: {
      audio: 'snip',
    },
    constraints: {
      allowedRegions: ['leaves_upper', 'leaves_lower', 'stem', 'flowers'],
    },
  },
  {
    id: 'soil_aerator',
    category: 'tool',
    label: 'Soil Aerator',
    description: 'Loosen compacted soil',
    visual: {
      model: 'aerator',
      baseColor: '#78716C',
      activeColor: '#57534E',
      icon: '🍴',
    },
    physics: {
      pressure: 0.6,
      speed: 0.3,
      pattern: 'poke',
    },
    constraints: {
      allowedRegions: ['soil_surface'],
    },
  },
];

// =============================================================================
// Contributions
// =============================================================================

const botanicalContributions: Record<string, DimensionContribution[]> = {
  watering_can: [
    { dimension: 'hydration', baseAmount: 0.05, pressureScale: 0.8, regionPropertyScale: { moisture: 1.5 } },
    { dimension: 'health', baseAmount: 0.015, regionPropertyScale: { moisture: 1.2, nutrients: 1.1 } },
    { dimension: 'overwatering', baseAmount: 0.02, pressureScale: 1.0, regionPropertyScale: { drainage: -0.5 } }, // Risk increases
    { dimension: 'happiness', baseAmount: 0.01, regionPropertyScale: { moisture: 1.1 } },
  ],
  spray_bottle: [
    { dimension: 'hydration', baseAmount: 0.02, speedScale: 0.6, regionPropertyScale: { hydration: 1.3 } },
    { dimension: 'cleanliness', baseAmount: 0.015, speedScale: 0.5, regionPropertyScale: { dust: -1.0 } },
    { dimension: 'health', baseAmount: 0.01, regionPropertyScale: { chlorophyll: 1.2 } },
    { dimension: 'happiness', baseAmount: 0.015, regionPropertyScale: { sun_exposure: 1.1 } },
  ],
  cloth: [
    { dimension: 'cleanliness', baseAmount: 0.04, speedScale: 0.7, regionPropertyScale: { dust: -1.5 } },
    { dimension: 'health', baseAmount: 0.01, regionPropertyScale: { chlorophyll: 1.3 } },
    { dimension: 'happiness', baseAmount: 0.02, regionPropertyScale: { dust: -1.0 } },
  ],
  fertilizer: [
    { dimension: 'nutrients', baseAmount: 0.06, pressureScale: 0.6, regionPropertyScale: { nutrients: 1.4 } },
    { dimension: 'health', baseAmount: 0.02, regionPropertyScale: { nutrients: 1.5 } },
    { dimension: 'happiness', baseAmount: 0.015, regionPropertyScale: { nutrients: 1.2 } },
  ],
  pruning_shears: [
    { dimension: 'health', baseAmount: 0.03, pressureScale: 0.5, regionPropertyScale: { chlorophyll: -0.5 } }, // Removes unhealthy parts
    { dimension: 'happiness', baseAmount: 0.02, regionPropertyScale: { bloom_stage: 1.2 } },
    { dimension: 'cleanliness', baseAmount: 0.01 },
  ],
  soil_aerator: [
    { dimension: 'health', baseAmount: 0.02, pressureScale: 0.7, regionPropertyScale: { aeration: 1.5, compaction: -1.2 } },
    { dimension: 'nutrients', baseAmount: 0.015, regionPropertyScale: { aeration: 1.3 } },
    { dimension: 'overwatering', baseAmount: -0.015, regionPropertyScale: { drainage: 1.2 } }, // Reduces risk
    { dimension: 'happiness', baseAmount: 0.01, regionPropertyScale: { aeration: 1.1 } },
  ],
};

// =============================================================================
// Profile Definition
// =============================================================================

export const botanicalProfile: SurfaceProfile = {
  id: 'plant-care',
  name: 'Plant Care',
  description: 'Care for and nurture your houseplant',
  domain: 'botanical',
  regions: botanicalRegions,
  instruments: botanicalInstruments,
  dimensions: botanicalDimensions,
  contributions: botanicalContributions,
  visualConfig: {
    viewBox: [100, 105],
    backgroundColor: '#F0FDF4',
    showRegionLabels: true,
    showDimensionBars: true,
    animations: {
      hoverScale: 1.03,
      transitionDuration: 250,
      particleIntensity: 0.6,
    },
  },
  completionCriteria: {
    allOf: [
      { type: 'dimension_threshold', dimensionId: 'hydration', minValue: 0.6, label: 'Well Watered' },
      { type: 'dimension_threshold', dimensionId: 'health', minValue: 0.7, label: 'Healthy Plant' },
    ],
    anyOf: [
      { type: 'dimension_threshold', dimensionId: 'nutrients', minValue: 0.5, label: 'Fertilized' },
      { type: 'dimension_threshold', dimensionId: 'cleanliness', minValue: 0.7, label: 'Clean Leaves' },
    ],
    allowManualCompletion: true,
    minDuration: 20,
  },
  outcomeMapping: {
    dimensionToStat: {
      health: { statPackage: 'core.garden', axis: 'plant_health', scale: 0.2 },
      happiness: { statPackage: 'core.garden', axis: 'growth_rate', scale: 0.15 },
      nutrients: { statPackage: 'core.garden', axis: 'soil_quality', scale: 0.1 },
    },
    completionOutcomes: {
      success: 'outcome:plant_cared',
      timeout: 'outcome:plant_care_timeout',
      manual: 'outcome:plant_care_ended',
      cancelled: 'outcome:plant_care_cancelled',
    },
  },
  tags: ['botanical', 'gardening', 'nature', 'care'],
  version: 1,
};

// Auto-register on import
registerProfile(botanicalProfile);
