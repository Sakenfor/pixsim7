/**
 * Massage Surface Profile
 *
 * Example profile for spa/massage domain.
 * Focuses on tension release and relaxation.
 */

import type { SurfaceProfile, SurfaceRegion, SurfaceInstrument, SurfaceDimension, DimensionContribution } from '@pixsim7/shared.types';
import { registerProfile } from './registry';

// =============================================================================
// Regions
// =============================================================================

const massageRegions: SurfaceRegion[] = [
  {
    id: 'upper_back',
    label: 'Upper Back',
    shape: 'rect',
    coords: { type: 'rect', x: 30, y: 15, width: 40, height: 20 },
    properties: { tension: 0.7, pressure_tolerance: 0.8, knot_density: 0.6 },
    highlightColor: '#FDA4AF',
    group: 'back',
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    shape: 'rect',
    coords: { type: 'rect', x: 32, y: 35, width: 36, height: 18 },
    properties: { tension: 0.6, pressure_tolerance: 0.7, knot_density: 0.4 },
    highlightColor: '#FBBF24',
    group: 'back',
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 20, y: 10 }, { x: 30, y: 15 },
        { x: 30, y: 25 }, { x: 15, y: 20 },
      ],
    },
    properties: { tension: 0.85, pressure_tolerance: 0.9, knot_density: 0.8 },
    highlightColor: '#F472B6',
    group: 'shoulders',
  },
  {
    id: 'neck',
    label: 'Neck',
    shape: 'rect',
    coords: { type: 'rect', x: 40, y: 5, width: 20, height: 10 },
    properties: { tension: 0.75, pressure_tolerance: 0.5, knot_density: 0.5 },
    highlightColor: '#C084FC',
    group: 'neck',
  },
  {
    id: 'spine',
    label: 'Spine',
    shape: 'rect',
    coords: { type: 'rect', x: 45, y: 15, width: 10, height: 45 },
    properties: { tension: 0.5, pressure_tolerance: 0.4, alignment: 0.6 },
    highlightColor: '#60A5FA',
    group: 'back',
  },
  {
    id: 'glutes',
    label: 'Glutes',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 30, y: 53 }, { x: 70, y: 53 },
        { x: 72, y: 70 }, { x: 28, y: 70 },
      ],
    },
    properties: { tension: 0.55, pressure_tolerance: 0.85, tightness: 0.6 },
    highlightColor: '#FB923C',
    group: 'lower',
  },
  {
    id: 'calves',
    label: 'Calves',
    shape: 'polygon',
    coords: {
      type: 'polygon',
      points: [
        { x: 32, y: 75 }, { x: 45, y: 75 },
        { x: 44, y: 95 }, { x: 34, y: 95 },
      ],
    },
    properties: { tension: 0.4, pressure_tolerance: 0.75, tightness: 0.5 },
    highlightColor: '#4ADE80',
    group: 'legs',
  },
  {
    id: 'feet',
    label: 'Feet',
    shape: 'rect',
    coords: { type: 'rect', x: 32, y: 96, width: 16, height: 8 },
    properties: { tension: 0.35, pressure_tolerance: 0.9, reflexology_zones: 0.8 },
    highlightColor: '#22D3EE',
    group: 'feet',
  },
];

// =============================================================================
// Dimensions
// =============================================================================

const massageDimensions: SurfaceDimension[] = [
  {
    id: 'relaxation',
    name: 'Relaxation',
    description: 'Overall relaxation level',
    color: '#69DB7C',
    icon: '🌿',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.02,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'tension_release',
    name: 'Tension Release',
    description: 'Muscle tension released',
    color: '#74C0FC',
    icon: '💆',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.03,
    thresholds: { low: 0.2, medium: 0.45, high: 0.75, peak: 0.9 },
    visible: true,
    affectsCompletion: true,
  },
  {
    id: 'circulation',
    name: 'Circulation',
    description: 'Blood flow improvement',
    color: '#F472B6',
    icon: '❤️',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.05,
    thresholds: { low: 0.15, medium: 0.4, high: 0.7, peak: 0.85 },
    visible: true,
  },
  {
    id: 'comfort',
    name: 'Comfort',
    description: 'Physical comfort',
    color: '#63E6BE',
    icon: '☁️',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.025,
    thresholds: { low: 0.2, medium: 0.5, high: 0.8, peak: 0.95 },
    visible: true,
  },
  {
    id: 'soreness',
    name: 'Soreness',
    description: 'Post-massage soreness (inverted - lower is better)',
    color: '#FCA5A5',
    icon: '⚠️',
    minValue: 0,
    maxValue: 1,
    decayRate: 0.08,
    initialValue: 0,
    thresholds: { low: 0.1, medium: 0.3, high: 0.5, peak: 0.7 },
    visible: true,
  },
];

// =============================================================================
// Instruments
// =============================================================================

const massageInstruments: SurfaceInstrument[] = [
  {
    id: 'hands',
    category: 'manual',
    label: 'Massage Hands',
    description: 'Professional massage technique',
    visual: {
      model: 'hands',
      baseColor: '#FDF2F8',
      activeColor: '#FBCFE8',
      trail: true,
      icon: '🙌',
    },
    physics: {
      pressure: 0.6,
      speed: 0.4,
      pattern: 'circular',
    },
    feedback: {
      reaction: 'satisfaction',
    },
  },
  {
    id: 'hot_stones',
    category: 'thermal',
    label: 'Hot Stones',
    description: 'Heated basalt stones',
    visual: {
      model: 'stones',
      baseColor: '#78716C',
      activeColor: '#F97316',
      glow: true,
      distortion: true,
      icon: '🪨',
    },
    physics: {
      pressure: 0.7,
      speed: 0.2,
      temperature: 0.8,
    },
    feedback: {
      reaction: 'sigh',
    },
  },
  {
    id: 'oil',
    category: 'liquid',
    label: 'Massage Oil',
    description: 'Aromatic massage oil',
    visual: {
      model: 'oil',
      baseColor: '#FEF3C7',
      activeColor: '#FDE68A',
      glow: false,
      particles: { type: 'droplets', density: 0.3 },
      icon: '🫗',
    },
    physics: {
      pressure: 0.3,
      speed: 0.5,
      viscosity: 0.6,
    },
    feedback: {
      impact: { type: 'splash', intensity: 0.2 },
    },
  },
  {
    id: 'roller',
    category: 'tool',
    label: 'Foam Roller',
    description: 'Deep tissue foam roller',
    visual: {
      model: 'roller',
      baseColor: '#1E293B',
      activeColor: '#475569',
      icon: '🛢️',
    },
    physics: {
      pressure: 0.85,
      speed: 0.3,
      pattern: 'linear',
    },
    feedback: {
      reaction: 'intensity',
    },
  },
  {
    id: 'cupping',
    category: 'suction',
    label: 'Cupping',
    description: 'Suction cup therapy',
    visual: {
      model: 'cup',
      baseColor: '#DBEAFE',
      activeColor: '#93C5FD',
      glow: true,
      icon: '🥛',
    },
    physics: {
      pressure: 0.5,
      speed: 0.1,
    },
    feedback: {
      reaction: 'release',
    },
  },
];

// =============================================================================
// Contributions
// =============================================================================

const massageContributions: Record<string, DimensionContribution[]> = {
  hands: [
    { dimension: 'relaxation', baseAmount: 0.025, pressureScale: 0.6, regionPropertyScale: { tension: 1.3 } },
    { dimension: 'tension_release', baseAmount: 0.03, pressureScale: 0.8, regionPropertyScale: { tension: 1.5, knot_density: 1.3 } },
    { dimension: 'circulation', baseAmount: 0.02, speedScale: 0.5, regionPropertyScale: { pressure_tolerance: 1.1 } },
    { dimension: 'comfort', baseAmount: 0.015, pressureScale: 0.4, regionPropertyScale: { pressure_tolerance: 1.2 } },
  ],
  hot_stones: [
    { dimension: 'relaxation', baseAmount: 0.04, regionPropertyScale: { tension: 1.4 } },
    { dimension: 'tension_release', baseAmount: 0.035, pressureScale: 0.5, regionPropertyScale: { tension: 1.6, knot_density: 1.2 } },
    { dimension: 'circulation', baseAmount: 0.03, regionPropertyScale: { pressure_tolerance: 1.0 } },
    { dimension: 'comfort', baseAmount: 0.025, regionPropertyScale: { pressure_tolerance: 1.1 } },
  ],
  oil: [
    { dimension: 'relaxation', baseAmount: 0.02, speedScale: 0.4 },
    { dimension: 'comfort', baseAmount: 0.03, regionPropertyScale: { pressure_tolerance: 1.2 } },
    { dimension: 'circulation', baseAmount: 0.015, speedScale: 0.6 },
  ],
  roller: [
    { dimension: 'tension_release', baseAmount: 0.045, pressureScale: 0.9, regionPropertyScale: { tension: 1.8, knot_density: 1.5 } },
    { dimension: 'circulation', baseAmount: 0.025, pressureScale: 0.7, regionPropertyScale: { tightness: 1.3 } },
    { dimension: 'soreness', baseAmount: 0.02, pressureScale: 1.0, regionPropertyScale: { knot_density: 0.8 } }, // Can cause soreness
    { dimension: 'relaxation', baseAmount: 0.015, regionPropertyScale: { tension: 1.1 } },
  ],
  cupping: [
    { dimension: 'tension_release', baseAmount: 0.04, regionPropertyScale: { tension: 1.5, knot_density: 1.4 } },
    { dimension: 'circulation', baseAmount: 0.035, regionPropertyScale: { pressure_tolerance: 1.0 } },
    { dimension: 'soreness', baseAmount: 0.015, regionPropertyScale: { knot_density: 0.6 } },
    { dimension: 'relaxation', baseAmount: 0.02, regionPropertyScale: { tension: 1.2 } },
  ],
};

// =============================================================================
// Profile Definition
// =============================================================================

export const massageProfile: SurfaceProfile = {
  id: 'back-massage',
  name: 'Back Massage',
  description: 'Professional back massage session for tension relief and relaxation',
  domain: 'massage',
  regions: massageRegions,
  instruments: massageInstruments,
  dimensions: massageDimensions,
  contributions: massageContributions,
  visualConfig: {
    viewBox: [100, 110],
    backgroundColor: '#FDF4FF',
    showRegionLabels: true,
    showDimensionBars: true,
    animations: {
      hoverScale: 1.02,
      transitionDuration: 300,
      particleIntensity: 0.5,
    },
  },
  completionCriteria: {
    allOf: [
      { type: 'dimension_threshold', dimensionId: 'relaxation', minValue: 0.7, label: 'Relaxed' },
      { type: 'dimension_threshold', dimensionId: 'tension_release', minValue: 0.6, label: 'Tension Released' },
    ],
    allowManualCompletion: true,
    minDuration: 60,
    timeLimit: 600, // 10 minute session max
  },
  outcomeMapping: {
    dimensionToStat: {
      relaxation: { statPackage: 'core.wellness', axis: 'relaxation', scale: 0.2 },
      tension_release: { statPackage: 'core.wellness', axis: 'physical_health', scale: 0.15 },
      comfort: { statPackage: 'core.relationships', axis: 'trust', scale: 0.05 },
    },
    completionOutcomes: {
      success: 'outcome:massage_complete',
      timeout: 'outcome:massage_timeout',
      manual: 'outcome:massage_ended',
      cancelled: 'outcome:massage_cancelled',
    },
  },
  tags: ['massage', 'wellness', 'spa', 'relaxation'],
  version: 1,
};

// Auto-register on import
registerProfile(massageProfile);
