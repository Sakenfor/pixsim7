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
  Download,
  Video,
  Camera,
  Headphones,
  Pin,
  Check,
  X,
  Settings,
  Wrench,
  Save,
  Folder,
  FolderOpen,
  Search,
  Plus,
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
  Edit,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Heart,
  Network,
  Zap,
  BarChart3,
  Sliders,
  FileText,
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
  Plug,
  Star,
  Drama,
  ClipboardList,
  LayoutGrid,
  LightbulbIcon,
  KeyRound,
  Map,
  User,
  Clock,
  Code,
  ListPlus,
  FolderTree,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon component props
 */
export interface IconProps {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
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
  remove: Minus,
  delete: Trash,
  trash: Trash,
  edit: Edit,
  copy: Copy,
  save: Save,
  upload: Upload,
  download: Download,
  refresh: RefreshCw,
  refreshCw: RefreshCw,  // Alias for consistency
  cut: Scissors,
  clipboard: Clipboard,
  link: Link2,
  externalLink: ExternalLink,
  listPlus: ListPlus,

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
  eye: Eye,
  eyeOff: EyeOff,
  sliders: Sliders,
  fileText: FileText,
  clock: Clock,
  code: Code,

  // Panels & Features
  heart: Heart,
  graph: Network,
  palette: Palette,
  gamepad: Gamepad2,
  zap: Zap,
  barChart: BarChart3,
  sparkles: Sparkles,
  target: Target,
  bot: Bot,
  globe: Globe,
  radio: Radio,
  plug: Plug,
  star: Star,
  drama: Drama,
  clipboardList: ClipboardList,
  layoutGrid: LayoutGrid,
  lightbulb: LightbulbIcon,
  key: KeyRound,
  map: Map,
  user: User,

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

  // Directional
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,

  // Misc
  folderTree: FolderTree,
  cursorClick: Target,
} as const;

export type IconName = keyof typeof Icons;

/**
 * Get an icon component by name
 */
export function getIcon(name: IconName): LucideIcon {
  return Icons[name];
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
}: IconProps & { name: IconName }) {
  const IconComponent = getIcon(name);

  if (!IconComponent) {
    console.error(`Icon "${name}" not found in Icons. Available icons:`, Object.keys(Icons));
    return null;
  }

  return (
    <IconComponent
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

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
