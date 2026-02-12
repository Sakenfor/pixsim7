/* eslint-disable react-refresh/only-export-components */
/**
 * Centralized Icon System
 *
 * Single source of truth for all icons used throughout the application.
 * Uses lucide-react components to avoid encoding issues with raw Unicode/emoji.
 * Theme-aware and Codex-safe (no raw glyphs to corrupt).
 */

import {
  Image,
  Palette,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  MoveLeft,
  MoveRight,
  Columns,
  Rows,
  Download,
  Video,
  Camera,
  Headphones,
  Pin,
  Check,
  CheckSquare,
  X,
  Settings,
  Wrench,
  Save,
  Folder,
  FolderOpen,
  Search,
  Plus,
  PlusSquare,
  Minus,
  Upload,
  Play,
  Pause,
  Square,
  Shuffle,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Loader,
  Trash,
  Trash2,
  Edit,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Cpu,
  Database,
  Hash,
  Heart,
  Brain,
  Network,
  Zap,
  BarChart3,
  Sliders,
  FileText,
  FileCode,
  Sparkles,
  Target,
  Scissors,
  Clipboard,
  Link2,
  ExternalLink,
  Gamepad2,
  Clapperboard,
  Bot,
  Globe,
  Radio,
  Cloud,
  Plug,
  Star,
  Drama,
  ClipboardList,
  Layout,
  LayoutGrid,
  Grid3x3,
  Library,
  LightbulbIcon,
  KeyRound,
  Lock,
  Unlock,
  Map,
  User,
  Users,
  Clock,
  Code,
  ListPlus,
  FolderTree,
  Maximize2,
  Minimize2,
  Archive,
  Package,
  Layers,
  Box,
  Tag,
  Shield,
  LogIn,
  LogOut,
  GitBranch,
  FlaskConical,
  MoreVertical,
  Scroll,
  History,
  Paintbrush,
  MessageSquare,
  Blocks,
  ScanSearch,
  Activity,
  Undo2,
  Redo2,
  Wand2,
  Pencil,
  MoreHorizontal,
  ClipboardPaste,
  ArrowRightLeft,
  ArrowUpDown,
  ZoomIn,
  Gauge,
  Film,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';


import { BaseRegistry, type Identifiable } from '@lib/core';

import { useIconSettingsStore, type IconTheme } from '@features/icons';

/**
 * Icon component props
 */
export interface IconProps {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
  color?: string;
  weight?: string;
}

/**
 * Semantic icon names mapped to lucide-react components
 */
export const Icons = {
  // Media types
  image: Image,
  video: Video,
  audio: Headphones,
  camera: Camera,
  clapperboard: Clapperboard,

  // Cube faces (directional)
  cubeFront: Image,          // Frame/picture for front face
  cubeBack: Palette,         // Palette for back face
  cubeLeft: ChevronLeft,     // Left arrow
  cubeRight: ChevronRight,   // Right arrow
  cubeTop: ChevronUp,        // Up arrow
  cubeBottom: Download,      // Download/inbox for bottom

  // Actions
  pin: Pin,
  unpin: Pin,
  check: Check,
  close: X,
  x: X,
  add: Plus,
  plus: Plus,      // Alias for add
  plusSquare: PlusSquare,
  'plus-square': PlusSquare,  // Kebab-case alias
  remove: Minus,
  minus: Minus,    // Alias for remove
  checkSquare: CheckSquare,
  'check-square': CheckSquare,
  delete: Trash,
  trash: Trash,
  trash2: Trash2,
  'trash-2': Trash2,  // Kebab-case alias
  archive: Archive,
  edit: Edit,
  copy: Copy,
  save: Save,
  upload: Upload,
  download: Download,
  refresh: RefreshCw,
  refreshCw: RefreshCw,  // Alias for consistency
  rotateCcw: RotateCcw,
  'rotate-ccw': RotateCcw,  // Kebab-case alias
  cut: Scissors,
  clipboard: Clipboard,
  link: Link2,
  externalLink: ExternalLink,
  'external-link': ExternalLink, // Kebab-case alias
  listPlus: ListPlus,
  lock: Lock,
  unlock: Unlock,
  logIn: LogIn,
  logOut: LogOut,
  'log-in': LogIn,
  'log-out': LogOut,

  // Playback
  play: Play,
  pause: Pause,
  stop: Square,
  shuffle: Shuffle,

  // UI elements
  settings: Settings,
  wrench: Wrench,
  search: Search,
  folder: Folder,
  folderOpen: FolderOpen,
  'folder-open': FolderOpen,  // Kebab-case alias
  eye: Eye,
  eyeOff: EyeOff,
  sliders: Sliders,
  fileText: FileText,
  fileCode: FileCode,
  'file-code': FileCode,
  clock: Clock,
  code: Code,
  maximize2: Maximize2,
  'maximize-2': Maximize2,  // Kebab-case alias
  minimize2: Minimize2,
  'minimize-2': Minimize2,  // Kebab-case alias
  layers: Layers,
  moreVertical: MoreVertical,
  'more-vertical': MoreVertical,
  hash: Hash,
  cpu: Cpu,
  database: Database,
  tag: Tag,
  shield: Shield,
  flask: FlaskConical,
  'git-branch': GitBranch,

  // Panels & Features
  heart: Heart,
  graph: Network,
  palette: Palette,
  gamepad: Gamepad2,
  zap: Zap,
  barChart: BarChart3,
  'bar-chart': BarChart3,
  sparkles: Sparkles,
  '✨': Sparkles,  // Emoji alias
  target: Target,
  brain: Brain,
  bot: Bot,
  globe: Globe,
  radio: Radio,
  cloud: Cloud,
  'google-drive': Cloud,
  plug: Plug,
  star: Star,
  drama: Drama,
  clipboardList: ClipboardList,
  layout: Layout,
  layoutGrid: LayoutGrid,
  columns: Columns,
  rows: Rows,
  grid: Grid3x3,
  'grid-3x3': Grid3x3,  // Kebab-case alias
  library: Library,
  lightbulb: LightbulbIcon,
  key: KeyRound,
  map: Map,
  user: User,
  users: Users,

  // Status indicators
  loading: Loader,
  loader: Loader,
  success: CheckCircle,
  checkCircle: CheckCircle,
  'check-circle': CheckCircle,
  error: XCircle,
  xCircle: XCircle,
  'x-circle': XCircle,  // Kebab-case alias
  warning: AlertCircle,
  alertCircle: AlertCircle,
  'alert-circle': AlertCircle,
  alertTriangle: AlertTriangle,
  info: Info,
  history: History,
  'clock-history': History,
  'ℹ️': Info,  // Emoji alias

  // Directional
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowDown: ArrowDown,
  arrowUp: ArrowUp,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  arrowRightLeft: ArrowRightLeft,
  'arrow-right-left': ArrowRightLeft,
  arrowUpDown: ArrowUpDown,
  'arrow-up-down': ArrowUpDown,
  moveLeft: MoveLeft,
  moveRight: MoveRight,
  move: MoveRight, // Generic move alias
  'move-left': MoveLeft,
  'move-right': MoveRight,

  // Misc
  folderTree: FolderTree,
  cursorClick: Target,
  package: Package,
  box: Box,
  square: Square,
  quest: Scroll,
  '📦': Package,  // Emoji alias

  // Prompts & Analysis
  prompt: MessageSquare,
  prompts: MessageSquare,
  analysis: ScanSearch,
  blocks: Blocks,
  paintbrush: Paintbrush,

  // Additional
  activity: Activity,
  undo2: Undo2,
  'undo-2': Undo2,
  undo: Undo2,
  redo2: Redo2,
  'redo-2': Redo2,
  redo: Redo2,
  wand2: Wand2,
  'wand-2': Wand2,
  wand: Wand2,
  pencil: Pencil,
  moreHorizontal: MoreHorizontal,
  'more-horizontal': MoreHorizontal,
  clipboardPaste: ClipboardPaste,
  'clipboard-paste': ClipboardPaste,
  zoomIn: ZoomIn,
  'zoom-in': ZoomIn,
  gauge: Gauge,
  film: Film,
} as const;

export type IconName = keyof typeof Icons;

/**
 * Icon sizes (standardized)
 */
export const IconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

/** Icon color variants */
export const iconVariants = {
  default: 'text-current',
  muted: 'text-neutral-500 dark:text-neutral-400',
  subtle: 'text-neutral-400 dark:text-neutral-500',
  primary: 'text-blue-500 dark:text-blue-400',
  secondary: 'text-purple-500 dark:text-purple-400',
  success: 'text-green-500 dark:text-green-400',
  warning: 'text-amber-500 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
  info: 'text-cyan-500 dark:text-cyan-400',
} as const;

export type IconVariant = keyof typeof iconVariants;

export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number;
    weight?: string;
    color?: string;
  }
>;

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number;
  weight?: string;
  color?: string;
};

export interface IconSetDefinition extends Identifiable {
  label: string;
  description?: string;
  icon?: string;
  getIcon?: (name: string) => IconComponent | undefined;
  normalizeName?: (name: string) => string;
  defaultVariant?: IconVariant;
  getProps?: (name: string) => IconSvgProps;
}

class IconSetRegistry extends BaseRegistry<IconSetDefinition> {
  getDefault(): IconSetDefinition | undefined {
    return this.get('outline') ?? this.get('default') ?? this.getAll()[0];
  }
}

export const iconSetRegistry = new IconSetRegistry();

function registerDefaultIconSets() {
  if (iconSetRegistry.getAll().length > 0) {
    return;
  }

  iconSetRegistry.register({
    id: 'outline',
    label: 'Outline',
    description: 'Default Lucide outline icons.',
    icon: 'layoutGrid',
  });

  iconSetRegistry.register({
    id: 'muted',
    label: 'Muted Outline',
    description: 'Outline icons with muted default color.',
    icon: 'sliders',
    defaultVariant: 'muted',
  });

  iconSetRegistry.register({
    id: 'accent',
    label: 'Accent Outline',
    description: 'Outline icons with accent default color.',
    icon: 'sparkles',
    defaultVariant: 'primary',
  });

  iconSetRegistry.register({
    id: 'filled',
    label: 'Filled',
    description: 'Filled icons with optional stroke for clarity.',
    icon: 'square',
    getProps: () => ({
      fill: 'currentColor',
      stroke: 'currentColor',
      strokeWidth: 1.25,
    }),
  });
}

registerDefaultIconSets();

const iconThemeVariants: Record<IconTheme, IconVariant> = {
  inherit: 'default',
  muted: 'muted',
  accent: 'primary',
};

/**
 * Normalize common icon name formats (kebab/snake/space/camel).
 */
export function normalizeIconName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (Icons[trimmed as IconName]) {
    return trimmed;
  }

  const camel = trimmed.replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''));
  if (Icons[camel as IconName]) {
    return camel;
  }

  const kebab = trimmed.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (Icons[kebab as IconName]) {
    return kebab;
  }

  return trimmed;
}

/**
 * Get an icon component by name
 */
export function getBaseIcon(name: IconName | string): IconComponent | undefined {
  if (typeof name === 'string') {
    const normalized = normalizeIconName(name);
    return Icons[normalized as IconName];
  }
  return Icons[name];
}

/**
 * Get an icon component by name (base icon map)
 */
export function getIcon(name: IconName | string): IconComponent | undefined {
  return getBaseIcon(name);
}

/**
 * Render an icon by name with props
 */
export function Icon({
  name,
  size = 16,
  className = '',
  strokeWidth = 2,
  ...props
}: IconProps & { name: IconName | string }) {
  // Hooks must be called unconditionally at the top
  const iconTheme = useIconSettingsStore((state) => state.iconTheme);
  const iconSetId = useIconSettingsStore((state) => state.iconSetId);

  if (typeof name === 'string' && name.trim().length === 0) {
    return null;
  }
  const iconSet = iconSetRegistry.get(iconSetId) ?? iconSetRegistry.getDefault();
  const resolvedName =
    typeof name === 'string'
      ? iconSet?.normalizeName?.(name) ?? normalizeIconName(name)
      : String(name);
  const IconComponent =
    iconSet?.getIcon?.(resolvedName) ?? getBaseIcon(resolvedName);
  const setProps = iconSet?.getProps?.(resolvedName) ?? {};
  // Destructure to exclude className from setSvgProps (we use the passed className prop)
  const { strokeWidth: setStrokeWidth, className: _, ...setSvgProps } = setProps;
  void _; // Explicitly mark as intentionally unused

  if (!IconComponent) {
    if (typeof name === 'string') {
      const fontSize = typeof size === 'number' ? `${size}px` : size;
      return (
        <span
          className={className}
          style={{ fontSize, lineHeight: 1 }}
          aria-hidden="true"
        >
          {name}
        </span>
      );
    }
    return null;
  }

  const shouldUseTheme =
    typeof className !== 'string' || className.trim().length === 0;
  const variant = iconSet?.defaultVariant ?? iconThemeVariants[iconTheme] ?? 'default';
  const resolvedClassName = shouldUseTheme
    ? (variant === 'default' ? '' : iconVariants[variant] ?? iconVariants.default)
    : className;

  const resolvedStrokeWidth = setStrokeWidth ?? (setSvgProps.weight ? undefined : strokeWidth);

  return (
    <IconComponent
      size={size}
      className={resolvedClassName}
      strokeWidth={resolvedStrokeWidth}
      {...setSvgProps}
      {...props}
    />
  );
}

/**
 * Theme-aware icon wrapper
 * Automatically adjusts opacity/colors based on theme
 */
export function ThemedIcon({
  name,
  size = 16,
  variant = 'default',
  className = '',
  spinning = false,
  ...props
}: IconProps & {
  name: IconName;
  variant?: IconVariant;
  spinning?: boolean;
}) {
  return (
    <Icon
      name={name}
      size={size}
      className={`${iconVariants[variant]} ${spinning ? 'animate-spin' : ''} ${className}`}
      {...props}
    />
  );
}

/**
 * Clickable icon button with hover states
 */
export function IconButton({
  name,
  size = 16,
  variant = 'default',
  onClick,
  disabled = false,
  title,
  className = '',
  ...props
}: IconProps & {
  name: IconName;
  variant?: IconVariant;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const baseClasses = 'p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const enabledClasses = 'hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-neutral-300 dark:active:bg-neutral-600 cursor-pointer';
  const disabledClasses = 'opacity-40 cursor-not-allowed';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${disabled ? disabledClasses : enabledClasses} ${className}`}
    >
      <Icon name={name} size={size} className={iconVariants[variant]} {...props} />
    </button>
  );
}

/**
 * Icon with circular background badge
 */
export function IconBadge({
  name,
  size = 16,
  variant = 'primary',
  className = '',
  ...props
}: IconProps & {
  name: IconName;
  variant?: IconVariant;
}) {
  const badgeVariants = {
    default: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
    muted: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400',
    subtle: 'bg-neutral-50 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-500',
    primary: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    secondary: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    info: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
  };

  // Calculate padding based on icon size
  const padding = typeof size === 'number' ? Math.round(size * 0.4) : 6;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${badgeVariants[variant]} ${className}`}
      style={{ padding: `${padding}px` }}
    >
      <Icon name={name} size={size} {...props} />
    </span>
  );
}

/**
 * Status icon with dot indicator
 */
export function StatusIcon({
  name,
  size = 16,
  status,
  className = '',
  ...props
}: IconProps & {
  name: IconName;
  status: 'online' | 'offline' | 'busy' | 'away' | 'none';
}) {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-neutral-400',
    busy: 'bg-red-500',
    away: 'bg-amber-500',
    none: '',
  };

  const dotSize = typeof size === 'number' ? Math.max(6, Math.round(size * 0.35)) : 6;

  return (
    <span className={`relative inline-flex ${className}`}>
      <Icon name={name} size={size} {...props} />
      {status !== 'none' && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-neutral-900 ${statusColors[status]}`}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </span>
  );
}
