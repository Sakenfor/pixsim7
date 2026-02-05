/**
 * Icon Sets Plugin Registration
 *
 * Registers optional icon packs using the UI plugin hook context.
 */

import * as PhosphorIcons from '@phosphor-icons/react';

import { iconSetRegistry, normalizeIconName, type IconComponent } from '@lib/icons';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { iconSetsManifest } from './manifest';

type PhosphorIconMap = Record<string, IconComponent>;

const phosphorAliases: Record<string, string> = {
  pin: 'PushPin',
  unpin: 'PushPinSlash',
  close: 'X',
  x: 'X',
  settings: 'Gear',
  wrench: 'Wrench',
  search: 'MagnifyingGlass',
  refresh: 'ArrowClockwise',
  refreshCw: 'ArrowClockwise',
  'refresh-cw': 'ArrowClockwise',
  rotateCcw: 'ArrowCounterClockwise',
  'rotate-ccw': 'ArrowCounterClockwise',
  maximize2: 'ArrowsOut',
  'maximize-2': 'ArrowsOut',
  minimize2: 'ArrowsIn',
  'minimize-2': 'ArrowsIn',
  moreVertical: 'DotsThreeVertical',
  'more-vertical': 'DotsThreeVertical',
  logIn: 'SignIn',
  'log-in': 'SignIn',
  logOut: 'SignOut',
  'log-out': 'SignOut',
  externalLink: 'ArrowSquareOut',
  'external-link': 'ArrowSquareOut',
  eyeOff: 'EyeSlash',
  trash2: 'Trash',
  'trash-2': 'Trash',
  barChart: 'ChartBar',
  'bar-chart': 'ChartBar',
  sparkles: 'Sparkle',
  bot: 'Robot',
  radio: 'Broadcast',
  gamepad: 'GameController',
  clipboardList: 'ClipboardText',
  layoutGrid: 'SquaresFour',
  grid: 'GridFour',
  'grid-3x3': 'GridNine',
  library: 'Books',
  lightbulb: 'Lightbulb',
  folderTree: 'TreeStructure',
  history: 'ClockCounterClockwise',
  'clock-history': 'ClockCounterClockwise',
  warning: 'WarningCircle',
  alertCircle: 'WarningCircle',
  'alert-circle': 'WarningCircle',
  alertTriangle: 'WarningTriangle',
  map: 'MapTrifold',
  box: 'Cube',
  quest: 'Scroll',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
};

const phosphorIcons = PhosphorIcons as unknown as PhosphorIconMap;

function toPascalCase(value: string): string {
  return value
    .replace(/[-_\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function resolvePhosphorIcon(name: string): IconComponent | undefined {
  const normalized = normalizeIconName(name);
  const alias = phosphorAliases[normalized];
  const candidates = [alias, toPascalCase(normalized)].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const icon = phosphorIcons[candidate];
    if (icon) {
      return icon;
    }
  }

  return undefined;
}

export async function registerIconSetsPlugin(): Promise<void> {
  await registerPluginDefinition({
    id: iconSetsManifest.id,
    family: 'ui-plugin',
    origin: 'builtin',
    source: 'source',
    plugin: {
      metadata: iconSetsManifest,
    },
    canDisable: iconSetsManifest.canDisable,
    activationState: iconSetsManifest.activationState,
  });

  if (!iconSetRegistry.has('filled-solid')) {
    iconSetRegistry.register({
      id: 'filled-solid',
      label: 'Filled Solid (Phosphor)',
      description: 'Solid fill icons from the Phosphor set.',
      icon: 'square',
      getIcon: resolvePhosphorIcon,
      getProps: () => ({
        weight: 'fill',
      }),
    });
  }
}
