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
  error: XCircle,
  warning: AlertCircle,
  alertCircle: AlertCircle,
  'alert-circle': AlertCircle,  // Kebab-case alias
  alertTriangle: AlertTriangle,
  info: Info,

  // Directional
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,

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

/**
 * Theme-aware icon wrapper
 * Automatically adjusts opacity/colors based on theme
 */
export function ThemedIcon({
  name,
  size = 16,
  variant = 'default',
  className = '',
  ...props
}: IconProps & {
  name: IconName;
  variant?: 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'error';
}) {
  const variantClasses = {
    default: 'text-current',
    muted: 'text-neutral-500 dark:text-neutral-400',
    primary: 'text-blue-500 dark:text-blue-400',
    success: 'text-green-500 dark:text-green-400',
    warning: 'text-yellow-500 dark:text-yellow-400',
    error: 'text-red-500 dark:text-red-400',
  };

  return (
    <Icon
      name={name}
      size={size}
      className={`${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
