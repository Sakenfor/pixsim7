/**
 * Romance Surface Profile
 *
 * Migrated from the legacy body map gizmo system.
 * Supports romantic/intimate interactions with humanoid characters.
 */

import type { SurfaceProfile, SurfaceRegion, SurfaceInstrument, SurfaceDimension, DimensionContribution } from '@pixsim7/shared.types';
import { registerProfile } from './registry';

// =============================================================================
// Regions (migrated from ANATOMICAL_ZONES)
// =============================================================================

const romanceRegions: SurfaceRegion[] = [
  // ===== Head & Face =====
  {
    id: 'head',
    label: 'Head',
    shape: 'circle',
    coords: { type: 'circle', cx: 50, cy: 8, radius: 7 },
    properties: { sensitivity: 0.5, ticklishness: 0.2 },
    highlightColor: '#A78BFA',
    group: 'head',
  },
  {
    id: 'ears',
    label: 'Ears',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 5 }, { x: 44, y: 3 }, { x: 44, y: 10 }, { x: 42, y: 12 },
      ],
    },
    properties: { sensitivity: 0.75, ticklishness: 0.5, pleasure: 0.6 },
    highlightColor: '#F472B6',
    group: 'head',
  },
  {
    id: 'lips',
    label: 'Lips',
    shape: 'rect',
    coords: { type: 'rect', x: 47, y: 10, width: 6, height: 3 },
    properties: { sensitivity: 0.9, pleasure: 0.85 },
    highlightColor: '#FB7185',
    group: 'head',
  },

  // ===== Neck & Shoulders =====
  {
    id: 'neck',
    label: 'Neck',
    shape: 'rect',
    coords: { type: 'rect', x: 45, y: 16, width: 10, height: 6 },
    properties: { sensitivity: 0.85, ticklishness: 0.5, pleasure: 0.75 },
    highlightColor: '#F9A8D4',
    group: 'neck',
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 32, y: 22 }, { x: 68, y: 22 },
        { x: 65, y: 28 }, { x: 35, y: 28 },
      ],
    },
    properties: { sensitivity: 0.5 },
    highlightColor: '#93C5FD',
    group: 'torso',
  },

  // ===== Torso =====
  {
    id: 'chest',
    label: 'Chest',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 28 }, { x: 65, y: 28 },
        { x: 66, y: 40 }, { x: 34, y: 40 },
      ],
    },
    properties: { sensitivity: 0.7, pleasure: 0.6 },
    highlightColor: '#FDA4AF',
    group: 'torso',
  },
  {
    id: 'nipples',
    label: 'Nipples',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 38, y: 32 }, { x: 62, y: 32 },
        { x: 62, y: 38 }, { x: 38, y: 38 },
      ],
    },
    properties: { sensitivity: 0.95, pleasure: 0.9 },
    highlightColor: '#FB7185',
    group: 'torso',
  },
  {
    id: 'stomach',
    label: 'Stomach',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 36, y: 40 }, { x: 64, y: 40 },
        { x: 62, y: 55 }, { x: 38, y: 55 },
      ],
    },
    properties: { sensitivity: 0.6, ticklishness: 0.8 },
    highlightColor: '#FCD34D',
    group: 'torso',
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    shape: 'rect',
    coords: { type: 'rect', x: 40, y: 48, width: 20, height: 10 },
    properties: { sensitivity: 0.7, pleasure: 0.6 },
    highlightColor: '#C4B5FD',
    group: 'torso',
  },

  // ===== Intimate Areas =====
  {
    id: 'hips',
    label: 'Hips',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 55 }, { x: 65, y: 55 },
        { x: 68, y: 65 }, { x: 32, y: 65 },
      ],
    },
    properties: { sensitivity: 0.8, pleasure: 0.7 },
    highlightColor: '#F9A8D4',
    group: 'intimate',
  },
  {
    id: 'groin',
    label: 'Groin',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 62 }, { x: 58, y: 62 },
        { x: 55, y: 72 }, { x: 45, y: 72 },
      ],
    },
    properties: { sensitivity: 0.95, pleasure: 0.95 },
    highlightColor: '#F43F5E',
    group: 'intimate',
  },
  {
    id: 'buttocks',
    label: 'Buttocks',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 60 }, { x: 65, y: 60 },
        { x: 62, y: 72 }, { x: 38, y: 72 },
      ],
    },
    properties: { sensitivity: 0.85, pleasure: 0.8 },
    highlightColor: '#FB923C',
    group: 'intimate',
  },
  {
    id: 'inner_thighs',
    label: 'Inner Thighs',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 42, y: 72 }, { x: 48, y: 72 },
        { x: 46, y: 88 }, { x: 44, y: 88 },
      ],
    },
    properties: { sensitivity: 0.9, pleasure: 0.85, ticklishness: 0.7 },
    highlightColor: '#F472B6',
    group: 'intimate',
  },

  // ===== Arms & Hands =====
  {
    id: 'upper_arms',
    label: 'Upper Arms',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 25, y: 26 }, { x: 32, y: 26 },
        { x: 30, y: 45 }, { x: 22, y: 45 },
      ],
    },
    properties: { sensitivity: 0.4 },
    highlightColor: '#86EFAC',
    group: 'arms',
  },
  {
    id: 'forearms',
    label: 'Forearms',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 22, y: 45 }, { x: 30, y: 45 },
        { x: 26, y: 62 }, { x: 18, y: 62 },
      ],
    },
    properties: { sensitivity: 0.45, ticklishness: 0.4 },
    highlightColor: '#6EE7B7',
    group: 'arms',
  },
  {
    id: 'wrists',
    label: 'Wrists',
    shape: 'rect',
    coords: { type: 'rect', x: 17, y: 60, width: 10, height: 6 },
    properties: { sensitivity: 0.75, pleasure: 0.5 },
    highlightColor: '#A78BFA',
    group: 'arms',
  },
  {
    id: 'hands',
    label: 'Hands',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 16, y: 66 }, { x: 26, y: 66 },
        { x: 24, y: 76 }, { x: 14, y: 76 },
      ],
    },
    properties: { sensitivity: 0.7, ticklishness: 0.6 },
    highlightColor: '#C4B5FD',
    group: 'arms',
  },

  // ===== Legs & Feet =====
  {
    id: 'thighs',
    label: 'Thighs',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 36, y: 72 }, { x: 44, y: 72 },
        { x: 42, y: 92 }, { x: 34, y: 92 },
      ],
    },
    properties: { sensitivity: 0.55, ticklishness: 0.5 },
    highlightColor: '#7DD3FC',
    group: 'legs',
  },
  {
    id: 'calves',
    label: 'Calves',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 35, y: 92 }, { x: 42, y: 92 },
        { x: 40, y: 108 }, { x: 36, y: 108 },
      ],
    },
    properties: { sensitivity: 0.5, ticklishness: 0.45 },
    highlightColor: '#67E8F9',
    group: 'legs',
  },
  {
    id: 'feet',
    label: 'Feet',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 34, y: 108 }, { x: 44, y: 108 },
        { x: 46, y: 115 }, { x: 32, y: 115 },
      ],
    },
    properties: { sensitivity: 0.8, ticklishness: 0.95, pleasure: 0.4 },
    highlightColor: '#FCD34D',
    instrumentModifiers: { feather: 2.5, touch: 1.2 },
    group: 'legs',
  },
];

// =============================================================================
// Dimensions (migrated from DEFAULT_STAT_CONFIGS)
// =============================================================================

const romanceDimensions: SurfaceDimension[] = [
  {
    id: 'pleasure',
    name: 'Pleasure',
    description: 'General pleasure and enjoyment',
    color: '#FF69B4',
    icon: '💕',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.05,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'tickle',
    name: 'Tickle',
    description: 'Ticklish sensations',
    color: '#FFD43B',
    icon: '🪶',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.15,
    thresholds: { low: 0.2, medium: 0.4, high: 0.7, peak: 0.9 },
    visible: true,
  },
  {
    id: 'arousal',
    name: 'Arousal',
    description: 'Physical arousal level',
    color: '#FF6B6B',
    icon: '🔥',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.03,
    thresholds: { low: 0.25, medium: 0.5, high: 0.75, peak: 0.95 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'intimacy',
    name: 'Intimacy',
    description: 'Emotional closeness',
    color: '#E599F7',
    icon: '💜',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.02,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'surprise',
    name: 'Surprise',
    description: 'Unexpected sensations',
    color: '#74C0FC',
    icon: '⚡',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.25,
    thresholds: { low: 0.15, medium: 0.35, high: 0.6, peak: 0.85 },
    visible: true,
  },
  {
    id: 'relaxation',
    name: 'Relaxation',
    description: 'Calm and relaxed state',
    color: '#69DB7C',
    icon: '🌿',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.04,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
  },
  {
    id: 'excitement',
    name: 'Excitement',
    description: 'Heightened excitement',
    color: '#FFA94D',
    icon: '✨',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.08,
    thresholds: { low: 0.2, medium: 0.45, high: 0.7, peak: 0.9 },
    visible: true,
  },
  {
    id: 'tension',
    name: 'Tension',
    description: 'Building tension/anticipation',
    color: '#845EF7',
    icon: '💫',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.06,
    thresholds: { low: 0.2, medium: 0.5, high: 0.75, peak: 0.9 },
    visible: true,
  },
  {
    id: 'comfort',
    name: 'Comfort',
    description: 'Physical comfort level',
    color: '#63E6BE',
    icon: '☁️',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.03,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
  },
];

// =============================================================================
// Instruments (migrated from tools)
// =============================================================================

const romanceInstruments: SurfaceInstrument[] = [
  {
    id: 'touch',
    category: 'manual',
    label: 'Touch',
    description: 'Gentle hand touch',
    visual: {
      model: 'hand',
      baseColor: '#FFE4E6',
      activeColor: '#FDA4AF',
      glow: false,
      trail: true,
      icon: '🖐️',
    },
    physics: {
      pressure: 0.5,
      speed: 0.5,
    },
    feedback: {
      reaction: 'pleasure',
    },
  },
  {
    id: 'feather',
    category: 'sensation',
    label: 'Feather',
    description: 'Soft feather for tickling',
    visual: {
      model: 'feather',
      baseColor: '#FEF3C7',
      activeColor: '#FDE68A',
      glow: true,
      trail: true,
      icon: '🪶',
    },
    physics: {
      pressure: 0.2,
      speed: 0.7,
    },
    feedback: {
      reaction: 'giggle',
    },
  },
  {
    id: 'temperature',
    category: 'temperature',
    label: 'Temperature',
    description: 'Ice or heat',
    visual: {
      model: 'ice',
      baseColor: '#A5F3FC',
      activeColor: '#22D3EE',
      glow: true,
      distortion: true,
      icon: '🧊',
    },
    physics: {
      pressure: 0.4,
      speed: 0.3,
      temperature: 0.1,
    },
    feedback: {
      reaction: 'gasp',
    },
  },
  {
    id: 'energy',
    category: 'energy',
    label: 'Energy',
    description: 'Vibrating/electric sensation',
    visual: {
      model: 'electric',
      baseColor: '#C4B5FD',
      activeColor: '#A78BFA',
      glow: true,
      particles: { type: 'energy', density: 0.6 },
      icon: '⚡',
    },
    physics: {
      pressure: 0.6,
      speed: 0.8,
      vibration: 0.7,
    },
    feedback: {
      reaction: 'surprise',
    },
  },
  {
    id: 'silk',
    category: 'sensation',
    label: 'Silk',
    description: 'Soft silk fabric',
    visual: {
      model: 'silk',
      baseColor: '#FDF4FF',
      activeColor: '#F5D0FE',
      glow: false,
      trail: true,
      icon: '🧣',
    },
    physics: {
      pressure: 0.3,
      speed: 0.4,
    },
    feedback: {
      reaction: 'sigh',
    },
  },
  {
    id: 'water',
    category: 'liquid',
    label: 'Water',
    description: 'Water droplets',
    visual: {
      model: 'water',
      baseColor: '#BAE6FD',
      activeColor: '#38BDF8',
      distortion: true,
      particles: { type: 'droplets', density: 0.4 },
      icon: '💧',
    },
    physics: {
      pressure: 0.5,
      speed: 0.6,
      viscosity: 0.2,
    },
    feedback: {
      impact: { type: 'splash', intensity: 0.4, ripples: true },
      reaction: 'refreshed',
    },
  },
  {
    id: 'banana',
    category: 'object',
    label: 'Banana',
    description: 'A playful banana',
    visual: {
      model: 'banana',
      baseColor: '#FEF08A',
      activeColor: '#FACC15',
      glow: false,
      icon: '🍌',
    },
    physics: {
      pressure: 0.7,
      speed: 0.5,
      elasticity: 0.6,
      bendFactor: 0.3,
    },
    feedback: {
      impact: { type: 'squish', intensity: 0.5 },
      reaction: 'amused',
    },
  },
];

// =============================================================================
// Contributions (migrated from DEFAULT_TOOL_STATS)
// =============================================================================

const romanceContributions: Record<string, DimensionContribution[]> = {
  touch: [
    { dimension: 'pleasure', baseAmount: 0.02, pressureScale: 0.8, regionPropertyScale: { sensitivity: 1.5, pleasure: 1.2 } },
    { dimension: 'intimacy', baseAmount: 0.015, pressureScale: 0.5, regionPropertyScale: { sensitivity: 1.2 } },
    { dimension: 'comfort', baseAmount: 0.01, pressureScale: 0.3, regionPropertyScale: { sensitivity: 1.0 } },
  ],
  feather: [
    { dimension: 'tickle', baseAmount: 0.04, speedScale: 0.9, regionPropertyScale: { ticklishness: 2.0, sensitivity: 1.3 } },
    { dimension: 'surprise', baseAmount: 0.02, speedScale: 0.5, regionPropertyScale: { sensitivity: 1.1 } },
    { dimension: 'excitement', baseAmount: 0.015, speedScale: 0.6, regionPropertyScale: { sensitivity: 1.0 } },
  ],
  temperature: [
    { dimension: 'surprise', baseAmount: 0.03, pressureScale: 0.6, regionPropertyScale: { sensitivity: 1.4 } },
    { dimension: 'arousal', baseAmount: 0.025, pressureScale: 0.7, regionPropertyScale: { sensitivity: 1.3, pleasure: 1.1 } },
    { dimension: 'excitement', baseAmount: 0.02, pressureScale: 0.5, regionPropertyScale: { sensitivity: 1.0 } },
  ],
  energy: [
    { dimension: 'excitement', baseAmount: 0.035, pressureScale: 0.8, speedScale: 0.5, regionPropertyScale: { sensitivity: 1.5 } },
    { dimension: 'arousal', baseAmount: 0.03, pressureScale: 0.7, regionPropertyScale: { sensitivity: 1.3, pleasure: 1.2 } },
    { dimension: 'tension', baseAmount: 0.025, pressureScale: 0.6, regionPropertyScale: { sensitivity: 1.2 } },
  ],
  silk: [
    { dimension: 'relaxation', baseAmount: 0.03, speedScale: 0.4, regionPropertyScale: { sensitivity: 1.2 } },
    { dimension: 'comfort', baseAmount: 0.025, pressureScale: 0.3, regionPropertyScale: { sensitivity: 1.0 } },
    { dimension: 'pleasure', baseAmount: 0.02, pressureScale: 0.5, regionPropertyScale: { sensitivity: 1.1, pleasure: 1.3 } },
  ],
  water: [
    { dimension: 'relaxation', baseAmount: 0.025, regionPropertyScale: { sensitivity: 1.1 } },
    { dimension: 'surprise', baseAmount: 0.02, pressureScale: 0.7, regionPropertyScale: { sensitivity: 1.3 } },
    { dimension: 'arousal', baseAmount: 0.015, pressureScale: 0.5, regionPropertyScale: { sensitivity: 1.2, pleasure: 1.0 } },
  ],
  banana: [
    { dimension: 'pleasure', baseAmount: 0.03, pressureScale: 0.9, regionPropertyScale: { sensitivity: 1.4, pleasure: 1.5 } },
    { dimension: 'arousal', baseAmount: 0.035, pressureScale: 0.8, regionPropertyScale: { sensitivity: 1.3, pleasure: 1.4 } },
    { dimension: 'excitement', baseAmount: 0.02, pressureScale: 0.6, regionPropertyScale: { sensitivity: 1.1 } },
  ],
};

// =============================================================================
// Profile Definition
// =============================================================================

export const romanceProfile: SurfaceProfile = {
  id: 'humanoid-romance',
  name: 'Romantic Touch',
  description: 'Romantic and intimate interactions with humanoid characters',
  domain: 'romance',
  regions: romanceRegions,
  instruments: romanceInstruments,
  dimensions: romanceDimensions,
  contributions: romanceContributions,
  visualConfig: {
    viewBox: [100, 120],
    backgroundColor: 'transparent',
    showRegionLabels: false,
    showDimensionBars: true,
    animations: {
      hoverScale: 1.05,
      transitionDuration: 200,
      particleIntensity: 0.7,
    },
  },
  completionCriteria: {
    anyOf: [
      { type: 'dimension_threshold', dimensionId: 'pleasure', minValue: 0.9, label: 'Maximum Pleasure' },
      { type: 'dimension_threshold', dimensionId: 'arousal', minValue: 0.9, label: 'Peak Arousal' },
      { type: 'dimension_threshold', dimensionId: 'intimacy', minValue: 0.85, label: 'Deep Intimacy' },
    ],
    allowManualCompletion: true,
    minDuration: 30,
  },
  outcomeMapping: {
    dimensionToStat: {
      pleasure: { statPackage: 'core.relationships', axis: 'affinity', scale: 0.1 },
      intimacy: { statPackage: 'core.relationships', axis: 'intimacy', scale: 0.15 },
      arousal: { statPackage: 'core.relationships', axis: 'attraction', scale: 0.08 },
    },
    completionOutcomes: {
      success: 'outcome:romance_success',
      timeout: 'outcome:romance_timeout',
      manual: 'outcome:romance_ended',
      cancelled: 'outcome:romance_cancelled',
    },
  },
  tags: ['romance', 'sensual', 'interactive', 'humanoid'],
  version: 1,
};

// Auto-register on import
registerProfile(romanceProfile);
