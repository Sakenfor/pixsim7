/**
 * Icon Sets Plugin Registration
 *
 * Registers optional icon packs using the UI plugin hook context.
 * The shared `phosphorAliases` map translates Lucide icon names to Phosphor
 * component names.  All registered Phosphor variants (fill, duotone, bold, …)
 * reuse the same resolver — only `weight` differs.
 */

import {
  iconSetRegistry,
  normalizeIconName,
  type IconComponent,
  type IconSetDefinition,
} from '@lib/icons';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { iconSetsManifest } from './manifest';

type PhosphorIconMap = Record<string, IconComponent>;

let phosphorIcons: PhosphorIconMap | null = null;
let phosphorIconsPromise: Promise<PhosphorIconMap> | null = null;
let hasLoggedPhosphorLoadError = false;

// ─────────────────────────────────────────────────────────────────────────────
// Lucide → Phosphor name mapping
//
// The PascalCase auto-converter handles many names automatically (e.g.
// "camera" → "Camera").  This map covers cases where the names diverge.
// ─────────────────────────────────────────────────────────────────────────────

const phosphorAliases: Record<string, string> = {
  // ── Actions ──────────────────────────────────────────────────────
  pin: 'PushPin',
  unpin: 'PushPinSlash',
  close: 'X',
  x: 'X',
  edit: 'PencilSimple',
  save: 'FloppyDisk',
  send: 'PaperPlaneTilt',
  cut: 'Scissors',
  undo: 'ArrowCounterClockwise',
  undo2: 'ArrowCounterClockwise',
  'undo-2': 'ArrowCounterClockwise',
  redo: 'ArrowClockwise',
  redo2: 'ArrowClockwise',
  'redo-2': 'ArrowClockwise',
  refresh: 'ArrowClockwise',
  refreshCw: 'ArrowClockwise',
  'refresh-cw': 'ArrowClockwise',
  rotateCcw: 'ArrowCounterClockwise',
  'rotate-ccw': 'ArrowCounterClockwise',
  zoomIn: 'MagnifyingGlassPlus',
  'zoom-in': 'MagnifyingGlassPlus',

  // ── Navigation / layout ──────────────────────────────────────────
  home: 'House',
  search: 'MagnifyingGlass',
  settings: 'Gear',
  wrench: 'Wrench',
  filter: 'FunnelSimple',
  listFilter: 'FunnelSimple',
  'list-filter': 'FunnelSimple',
  maximize2: 'ArrowsOut',
  'maximize-2': 'ArrowsOut',
  minimize2: 'ArrowsIn',
  'minimize-2': 'ArrowsIn',
  moreVertical: 'DotsThreeVertical',
  'more-vertical': 'DotsThreeVertical',
  moreHorizontal: 'DotsThree',
  'more-horizontal': 'DotsThree',
  layout: 'Layout',
  layoutGrid: 'SquaresFour',
  grid: 'GridFour',
  'grid-3x3': 'GridNine',
  columns: 'Rows',       // Phosphor's Rows matches Lucide's Columns visual
  rows: 'Columns',       // and vice-versa

  // ── Arrows / directions ──────────────────────────────────────────
  arrowRightLeft: 'ArrowsLeftRight',
  'arrow-right-left': 'ArrowsLeftRight',
  arrowUpDown: 'ArrowsDownUp',
  'arrow-up-down': 'ArrowsDownUp',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',

  // ── Auth / identity ──────────────────────────────────────────────
  logIn: 'SignIn',
  'log-in': 'SignIn',
  logOut: 'SignOut',
  'log-out': 'SignOut',
  key: 'Key',

  // ── Files / content ──────────────────────────────────────────────
  fileText: 'FileText',
  fileCode: 'FileCode',
  fileQuestion: 'FileQuestion',
  'file-question': 'FileQuestion',
  folderTree: 'TreeStructure',
  clipboard: 'Clipboard',
  clipboardList: 'ClipboardText',
  clipboardPaste: 'ClipboardText',
  'clipboard-paste': 'ClipboardText',

  // ── Status / feedback ────────────────────────────────────────────
  warning: 'WarningCircle',
  alertCircle: 'WarningCircle',
  'alert-circle': 'WarningCircle',
  alertTriangle: 'Warning',
  'alert-triangle': 'Warning',
  checkCircle: 'CheckCircle',
  'check-circle': 'CheckCircle',
  success: 'CheckCircle',
  xCircle: 'XCircle',
  'x-circle': 'XCircle',
  error: 'XCircle',
  loader: 'CircleNotch',
  loading: 'CircleNotch',

  // ── Visibility ───────────────────────────────────────────────────
  eyeOff: 'EyeSlash',
  'eye-off': 'EyeSlash',
  externalLink: 'ArrowSquareOut',
  'external-link': 'ArrowSquareOut',
  link: 'LinkSimple',

  // ── Media / creative ─────────────────────────────────────────────
  sparkles: 'Sparkle',
  wand: 'MagicWand',
  wand2: 'MagicWand',
  'wand-2': 'MagicWand',
  penTool: 'PenNib',
  'pen-tool': 'PenNib',
  paintbrush: 'PaintBrush',
  drama: 'MaskHappy',
  clapperboard: 'FilmSlate',

  // ── Communication ────────────────────────────────────────────────
  messageSquare: 'ChatCircle',
  'message-square': 'ChatCircle',
  prompt: 'ChatCircle',
  prompts: 'ChatCircle',

  // ── Data / charts ────────────────────────────────────────────────
  barChart: 'ChartBar',
  'bar-chart': 'ChartBar',
  analysis: 'MagnifyingGlassPlus',
  gauge: 'Gauge',

  // ── Objects / concepts ───────────────────────────────────────────
  trash2: 'Trash',
  'trash-2': 'Trash',
  bot: 'Robot',
  radio: 'Broadcast',
  gamepad: 'GameController',
  library: 'Books',
  lightbulb: 'Lightbulb',
  map: 'MapTrifold',
  box: 'Cube',
  quest: 'Scroll',
  flask: 'Flask',
  beaker: 'Flask',
  blocks: 'SquaresFour',
  history: 'ClockCounterClockwise',
  'clock-history': 'ClockCounterClockwise',
  plusSquare: 'PlusSquare',
  'plus-square': 'PlusSquare',
  checkSquare: 'CheckSquare',
  'check-square': 'CheckSquare',

  // ── Pointers / cursors ───────────────────────────────────────────
  mousePointer: 'Cursor',
  'mouse-pointer': 'Cursor',
  cursorClick: 'CursorClick',
  'cursor-click': 'CursorClick',

  // ── Graph / network ──────────────────────────────────────────────
  graph: 'Graph',
  gitBranch: 'GitBranch',
  'git-branch': 'GitBranch',
  activity: 'Activity',
};

function toPascalCase(value: string): string {
  return value
    .replace(/[-_\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function loadPhosphorIcons(): Promise<PhosphorIconMap> {
  if (phosphorIcons) {
    return Promise.resolve(phosphorIcons);
  }

  phosphorIconsPromise ??= import('@phosphor-icons/react')
    .then((module) => {
      phosphorIcons = module as unknown as PhosphorIconMap;
      refreshPhosphorIconSets();
      return phosphorIcons;
    })
    .catch((error) => {
      phosphorIconsPromise = null;
      if (!hasLoggedPhosphorLoadError) {
        hasLoggedPhosphorLoadError = true;
        console.warn('[IconSets] Failed to load Phosphor icons:', error);
      }
      throw error;
    });

  return phosphorIconsPromise;
}

function resolvePhosphorIcon(name: string): IconComponent | undefined {
  if (!phosphorIcons) {
    void loadPhosphorIcons().catch(() => undefined);
    return undefined;
  }

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

function getPhosphorProps(weight: string) {
  return phosphorIcons ? { weight } : {};
}

const phosphorIconSets: IconSetDefinition[] = [
  {
    id: 'filled-solid',
    label: 'Filled Solid (Phosphor)',
    description: 'Solid fill icons from the Phosphor set.',
    icon: 'square',
    getIcon: resolvePhosphorIcon,
    getProps: () => getPhosphorProps('fill'),
  },
  {
    id: 'phosphor-duotone',
    label: 'Duotone (Phosphor)',
    description: 'Two-tone icons with a secondary fill layer.',
    icon: 'layers',
    getIcon: resolvePhosphorIcon,
    getProps: () => getPhosphorProps('duotone'),
  },
  {
    id: 'phosphor-bold',
    label: 'Bold (Phosphor)',
    description: 'Bold outline icons with thicker strokes.',
    icon: 'edit',
    getIcon: resolvePhosphorIcon,
    getProps: () => getPhosphorProps('bold'),
  },
  {
    id: 'phosphor-light',
    label: 'Light (Phosphor)',
    description: 'Thin, elegant outline icons.',
    icon: 'edit',
    getIcon: resolvePhosphorIcon,
    getProps: () => getPhosphorProps('light'),
  },
];

function refreshPhosphorIconSets(): void {
  for (const iconSet of phosphorIconSets) {
    iconSetRegistry.forceRegister(iconSet);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

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

  for (const iconSet of phosphorIconSets) {
    if (!iconSetRegistry.has(iconSet.id)) {
      iconSetRegistry.register(iconSet);
    }
  }
}
