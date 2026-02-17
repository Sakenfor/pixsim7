/* eslint-disable react-refresh/only-export-components */
/**
 * Devtools-local Icon System
 *
 * Simplified icon component that renders lucide-react icons by semantic name.
 * No icon-set registry, no theme-based variants — just straightforward rendering.
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
  MousePointer2,
  Home,
  FileQuestionMark,
  Tags,
} from 'lucide-react';

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
  cubeFront: Image,
  cubeBack: Palette,
  cubeLeft: ChevronLeft,
  cubeRight: ChevronRight,
  cubeTop: ChevronUp,
  cubeBottom: Download,

  // Actions
  pin: Pin,
  unpin: Pin,
  check: Check,
  close: X,
  x: X,
  add: Plus,
  plus: Plus,
  plusSquare: PlusSquare,
  'plus-square': PlusSquare,
  remove: Minus,
  minus: Minus,
  checkSquare: CheckSquare,
  'check-square': CheckSquare,
  delete: Trash,
  trash: Trash,
  trash2: Trash2,
  'trash-2': Trash2,
  archive: Archive,
  edit: Edit,
  copy: Copy,
  save: Save,
  upload: Upload,
  download: Download,
  refresh: RefreshCw,
  refreshCw: RefreshCw,
  rotateCcw: RotateCcw,
  'rotate-ccw': RotateCcw,
  cut: Scissors,
  clipboard: Clipboard,
  link: Link2,
  externalLink: ExternalLink,
  'external-link': ExternalLink,
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
  'folder-open': FolderOpen,
  eye: Eye,
  eyeOff: EyeOff,
  sliders: Sliders,
  fileText: FileText,
  fileCode: FileCode,
  'file-code': FileCode,
  fileQuestion: FileQuestionMark,
  clock: Clock,
  code: Code,
  maximize2: Maximize2,
  'maximize-2': Maximize2,
  minimize2: Minimize2,
  'minimize-2': Minimize2,
  layers: Layers,
  moreVertical: MoreVertical,
  'more-vertical': MoreVertical,
  hash: Hash,
  cpu: Cpu,
  database: Database,
  tag: Tag,
  tags: Tags,
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
  'grid-3x3': Grid3x3,
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
  'x-circle': XCircle,
  warning: AlertCircle,
  alertCircle: AlertCircle,
  'alert-circle': AlertCircle,
  alertTriangle: AlertTriangle,
  info: Info,
  history: History,
  'clock-history': History,

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
  move: MoveRight,
  'move-left': MoveLeft,
  'move-right': MoveRight,

  // Misc
  folderTree: FolderTree,
  cursorClick: Target,
  mousePointer: MousePointer2,
  package: Package,
  box: Box,
  square: Square,
  quest: Scroll,

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
  home: Home,
} as const;

export type IconName = keyof typeof Icons;

/**
 * Render an icon by name with props
 */
export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 2,
  ...props
}: IconProps & { name: IconName | string }) {
  if (typeof name === 'string' && name.trim().length === 0) {
    return null;
  }

  const IconComponent = Icons[name as IconName];

  if (!IconComponent) {
    if (typeof name === 'string') {
      const fontSize = typeof size === 'number' ? `${size}px` : size;
      return (
        <span
          className={className ?? ''}
          style={{ fontSize, lineHeight: 1 }}
          aria-hidden="true"
        >
          {name}
        </span>
      );
    }
    return null;
  }

  const colorOverride = props.color
    ? { stroke: props.color, style: { color: props.color } }
    : {};

  return (
    <IconComponent
      size={size}
      className={className ?? ''}
      strokeWidth={strokeWidth}
      {...props}
      {...colorOverride}
    />
  );
}
