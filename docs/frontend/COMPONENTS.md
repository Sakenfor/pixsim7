# Frontend Components Guide

Complete reference for PixSim7's frontend component library.

---

## 🎯 Component Architecture

PixSim7 frontend uses React 19 with TypeScript, organized by feature and responsibility.

### **Directory Structure**

```
frontend/src/components/
├── layout/          # Layout system (DockLayout, panels, splits)
├── control/         # Control Center (generation UI)
├── media/           # Media components (cards, players)
├── nodes/           # Scene graph nodes
├── inspector/       # Property inspectors
├── navigation/      # Navigation components
├── filters/         # Filter components
├── common/          # Common utilities
├── ui/              # Basic UI primitives
└── ...
```

---

## 🏗️ Core Layout System

### **DockLayout** (`layout/DockLayout.tsx`)

Professional dock-based layout system using Dockview library.

**Features:**
- Floating panels
- Dockable panels
- Resizable splits
- Layout presets
- State persistence

**Usage:**
```tsx
import { DockLayout } from '@/components/layout/DockLayout';
import { useLayoutStore } from '@/stores/layoutStore';

export const Workspace = () => {
  const { panels, activePanelId } = useLayoutStore();

  return (
    <DockLayout
      panels={panels}
      activePanelId={activePanelId}
      onLayoutChange={(newLayout) => {
        // Handle layout changes
      }}
    />
  );
};
```

**Layout Store:**
```tsx
interface LayoutState {
  panels: Record<string, PanelConfig>;
  activePanelId: string | null;
  addPanel: (config: PanelConfig) => void;
  removePanel: (panelId: string) => void;
  setActive: (panelId: string) => void;
}
```

---

### **ResizableSplit** (`layout/ResizableSplit.tsx`)

Two-pane resizable split view.

**Props:**
```tsx
interface ResizableSplitProps {
  direction: 'horizontal' | 'vertical';
  initialSize: number;  // Percentage 0-100
  minSize?: number;
  maxSize?: number;
  children: [ReactNode, ReactNode];
}
```

**Usage:**
```tsx
<ResizableSplit direction="horizontal" initialSize={70}>
  <MainContent />
  <Sidebar />
</ResizableSplit>
```

---

### **PanelChrome** (`layout/PanelChrome.tsx`)

Panel wrapper with title bar and actions.

**Props:**
```tsx
interface PanelChromeProps {
  title: string;
  icon?: IconName;
  actions?: PanelAction[];
  children: ReactNode;
  onClose?: () => void;
}
```

**Usage:**
```tsx
<PanelChrome
  title="Assets"
  icon="image"
  actions={[
    { label: 'Refresh', icon: 'refresh', onClick: () => refresh() },
    { label: 'Settings', icon: 'settings', onClick: () => openSettings() }
  ]}
  onClose={() => closePanel()}
>
  <AssetGallery />
</PanelChrome>
```

---

## 🎮 Control Center

### **ControlCenterDock** (`control/ControlCenterDock.tsx`)

Bottom dock for video generation controls.

**Features:**
- Prompt input with character count
- Provider selection
- Preset selection
- Dynamic parameter forms
- Job status display
- Generation history

**Store:**
```tsx
interface ControlCenterState {
  isOpen: boolean;
  activeTab: 'generate' | 'history' | 'settings';
  prompt: string;
  selectedProvider: string;
  selectedPreset: string | null;
  parameters: Record<string, any>;
  setPrompt: (prompt: string) => void;
  setProvider: (providerId: string) => void;
  setPreset: (presetId: string | null) => void;
  updateParameter: (key: string, value: any) => void;
}
```

**Usage:**
```tsx
import { ControlCenterDock } from '@/components/control/ControlCenterDock';

export const App = () => {
  return (
    <>
      <MainContent />
      <ControlCenterDock />  {/* Fixed to bottom */}
    </>
  );
};
```

---

### **PromptInput** (`primitives/PromptInput.tsx`)

Canonical prompt input component.

**Props:**
```tsx
interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;  // Default from config
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}
```

**Features:**
- Character counter
- Validation
- Auto-resize
- Keyboard shortcuts

**Usage:**
```tsx
import { PromptInput } from '@/components/primitives';

<PromptInput
  value={prompt}
  onChange={setPrompt}
  maxLength={2048}
  placeholder="Describe your video..."
/>
```

---

## 🖼️ Media Components

### **MediaCard** (`media/MediaCard.tsx`)

Asset display card with hover scrubbing for videos.

**Props:**
```tsx
interface MediaCardProps {
  asset: Asset;
  onClick?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  showMetadata?: boolean;
  hoverScrub?: boolean;  // Video hover scrubbing
}
```

**Features:**
- Thumbnail display
- Hover video scrubbing
- Status badge (pending, processing, complete)
- Metadata overlay
- Action menu

**Usage:**
```tsx
import { MediaCard } from '@/components/media/MediaCard';

<MediaCard
  asset={asset}
  onClick={(asset) => openAsset(asset)}
  onDelete={(asset) => deleteAsset(asset)}
  showMetadata
  hoverScrub
/>
```

---

### **MasonryGrid** (`layout/MasonryGrid.tsx`)

Responsive masonry layout for media cards.

**Props:**
```tsx
interface MasonryGridProps {
  items: any[];
  columns?: number;  // Auto-responsive if not set
  gap?: number;
  renderItem: (item: any, index: number) => ReactNode;
}
```

**Usage:**
```tsx
import { MasonryGrid } from '@/components/layout/MasonryGrid';

<MasonryGrid
  items={assets}
  columns={4}
  gap={16}
  renderItem={(asset) => (
    <MediaCard asset={asset} />
  )}
/>
```

---

## 🔍 Filters & Search

### **FiltersBar** (inline in `routes/Assets.tsx`)

Asset filtering component with URL sync.

**Features:**
- Search input
- Provider filter
- Media type filter
- Sort options
- URL synchronization
- sessionStorage persistence

**State:**
```tsx
interface FilterState {
  search: string;
  provider: string | null;
  mediaType: MediaType | null;
  sortBy: 'created_at' | 'updated_at' | 'size';
  sortOrder: 'asc' | 'desc';
}
```

**Usage:**
```tsx
const [filters, setFilters] = useState<FilterState>({
  search: '',
  provider: null,
  mediaType: null,
  sortBy: 'created_at',
  sortOrder: 'desc'
});

// Filters automatically sync to URL and sessionStorage
```

---

## 🎨 Icon System

### **Icon Component** (`lib/icons.tsx`)

Centralized icon system using Lucide React.

**Why?**
- ✅ No emoji encoding corruption
- ✅ Theme-aware (dark/light mode)
- ✅ Type-safe
- ✅ Consistent sizing

**Available Sizes:**
```tsx
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const IconSizes: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};
```

**Usage:**
```tsx
import { Icon } from '@/lib/icons';

// Basic usage
<Icon name="check" size="md" />

// With className
<Icon name="settings" size="lg" className="text-blue-500" />

// Theme-aware icon
import { ThemedIcon } from '@/lib/icons';
<ThemedIcon name="sun" size="sm" />
```

**Available Icons (52+):**
```
home, settings, user, image, video, folder, file, check,
x, plus, minus, edit, trash, download, upload, search,
filter, refresh, play, pause, stop, zap, heart, star,
bell, info, alert, help, menu, grid, list, calendar,
clock, map, globe, mail, phone, link, lock, unlock,
eye, eyeOff, chevronDown, chevronUp, chevronLeft, chevronRight,
arrowUp, arrowDown, arrowLeft, arrowRight, and more...
```

**Adding New Icons:**
```tsx
// In lib/icons.tsx
import { NewIcon } from 'lucide-react';

export const Icons = {
  // ...existing icons
  myNewIcon: NewIcon,
} as const;
```

See full documentation: `/frontend/src/lib/ICONS_README.md`

---

## 🕹️ Scene Graph Components

### **NodePalette** (`nodes/NodePalette.tsx`)

Node type selection palette.

**Node Types:**
- Video
- Choice
- Condition
- MiniGame
- End
- Group

**Usage:**
```tsx
import { NodePalette } from '@/components/nodes/NodePalette';

<NodePalette
  onNodeSelect={(nodeType) => {
    addNode(nodeType);
  }}
/>
```

---

### **SceneNode** (`nodes/SceneNode.tsx`)

Graph node component (uses React Flow).

**Props:**
```tsx
interface SceneNodeProps {
  id: string;
  data: NodeData;
  selected: boolean;
}
```

---

### **InspectorPanel** (`inspector/InspectorPanel.tsx`)

Property inspector for selected nodes.

**Type-Specific Editors:**
- `VideoNodeEditor` - Video playback settings, segments
- `ChoiceNodeEditor` - Choice options, branches
- `ConditionNodeEditor` - Condition expressions
- `MiniGameNodeEditor` - Mini-game configuration
- `EndNodeEditor` - End node settings

---

## 🧭 Navigation

### **Tabs** (`navigation/Tabs.tsx`)

Tab navigation component.

**Props:**
```tsx
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

interface Tab {
  id: string;
  label: string;
  icon?: IconName;
  count?: number;  // Badge count
}
```

**Usage:**
```tsx
import { Tabs } from '@/components/navigation/Tabs';

<Tabs
  tabs={[
    { id: 'all', label: 'All Assets', icon: 'image', count: 42 },
    { id: 'videos', label: 'Videos', icon: 'video', count: 28 },
    { id: 'images', label: 'Images', icon: 'image', count: 14 },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

---

## 🎛️ UI Primitives

### **Button** (`ui/Button.tsx`)

Standard button component.

**Variants:**
```tsx
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

<Button variant="primary" size="md" onClick={handleClick}>
  Submit
</Button>
```

---

### **Input** (`ui/Input.tsx`)

Standard text input.

**Props:**
```tsx
interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}
```

---

### **Select** (`ui/Select.tsx`)

Dropdown select component.

**Usage:**
```tsx
<Select
  value={selectedProvider}
  onChange={setSelectedProvider}
  options={[
    { value: 'pixverse', label: 'Pixverse' },
    { value: 'sora', label: 'Sora' }
  ]}
/>
```

---

### **Toast** (`ui/Toast.tsx`)

Toast notification system.

**Store:**
```tsx
const { addToast } = useToastStore();

addToast({
  type: 'success',
  message: 'Asset uploaded successfully',
  duration: 3000,
});
```

**Types:**
- `success` - Green checkmark
- `error` - Red X
- `warning` - Yellow warning
- `info` - Blue info

---

## 🔄 State Management

### **Zustand Stores**

**authStore** (`stores/authStore.ts`)
```tsx
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
```

**layoutStore** (`stores/layoutStore.ts`)
```tsx
interface LayoutState {
  panels: Record<string, PanelConfig>;
  activePanelId: string | null;
  addPanel: (config: PanelConfig) => void;
  removePanel: (panelId: string) => void;
}
```

**controlCenterStore** (`stores/controlCenterStore.ts`)
```tsx
interface ControlCenterState {
  isOpen: boolean;
  prompt: string;
  selectedProvider: string;
  parameters: Record<string, any>;
  setPrompt: (prompt: string) => void;
}
```

**toastStore** (`stores/toastStore.ts`)
```tsx
interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}
```

---

## 📦 Modular System

### **Module Interface**

```tsx
interface Module {
  id: string;
  name: string;
  version: string;
  dependencies?: string[];
  initialize?: () => Promise<void>;
  cleanup?: () => Promise<void>;
  getComponent?: () => React.ComponentType;
}
```

### **Example Module** (`modules/scene-builder/`)

```
modules/scene-builder/
├── index.ts           # Module definition
├── SceneBuilderView.tsx
└── useSceneBuilder.ts
```

**Module Registration:**
```tsx
// modules/index.ts
import sceneBuilder from './scene-builder';

export const modules = {
  'scene-builder': sceneBuilder,
};
```

---

## 🎨 Styling

### **TailwindCSS**

All components use Tailwind utility classes.

**Common Patterns:**
```tsx
// Card
<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">

// Button
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">

// Input
<input className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2">
```

### **Dark Mode**

Dark mode support via Tailwind's `dark:` prefix.

```tsx
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  Content adapts to theme
</div>
```

---

## 🧪 Testing Components

### **Component Test Example**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    const { container } = render(<Button variant="primary">Test</Button>);
    expect(container.firstChild).toHaveClass('bg-blue-500');
  });
});
```

---

## 📝 Best Practices

### **1. Use Icon Component (Not Emoji)**

❌ **Bad:**
```tsx
const icon = '✓';
```

✅ **Good:**
```tsx
import { Icon } from '@/lib/icons';
<Icon name="check" size="md" />
```

### **2. Type Your Props**

✅ **Good:**
```tsx
interface MyComponentProps {
  title: string;
  onSubmit: (value: string) => void;
  optional?: boolean;
}

export const MyComponent: React.FC<MyComponentProps> = ({ ... }) => {
  // Implementation
};
```

### **3. Use Zustand for Global State**

```tsx
import { create } from 'zustand';

interface MyState {
  count: number;
  increment: () => void;
}

export const useMyStore = create<MyState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### **4. Memoize Expensive Computations**

```tsx
import { useMemo } from 'react';

const filteredAssets = useMemo(() => {
  return assets.filter(asset => asset.provider_id === selectedProvider);
}, [assets, selectedProvider]);
```

---

## 🔗 Related Documentation

- **Architecture:** `/ARCHITECTURE.md`
- **Development Guide:** `/DEVELOPMENT_GUIDE.md`
- **Icon System:** `/frontend/src/lib/ICONS_README.md`
- **Modules:** `docs/frontend/MODULES.md`

---

**Last Updated:** 2025-11-16
