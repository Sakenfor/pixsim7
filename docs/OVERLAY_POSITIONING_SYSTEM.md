# Generic Overlay Positioning System

## Overview

A reusable, type-safe system for positioning UI elements (badges, controls, overlays, widgets) on container components throughout the application.

## Architecture

### Core Concepts

```
Container (Media Card, Video Player, Canvas)
  └─> Overlay Widgets (Badges, Controls, Metadata)
      ├─> Position (where)
      ├─> Visibility (when)
      ├─> Style (how)
      └─> Behavior (interactions)
```

## 1. Type Definitions

### Position System

```typescript
// Preset positions (9-point anchor + custom)
type OverlayAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

// Flexible positioning
interface OverlayPosition {
  anchor: OverlayAnchor;
  offset?: {
    x: number | string; // px or %
    y: number | string;
  };
  transform?: string; // CSS transform override
  alignment?: 'start' | 'center' | 'end'; // For stacked widgets
}

// Alternative: Custom coordinates
interface CustomPosition {
  x: number | string; // px, %, or CSS unit
  y: number | string;
  origin?: 'top-left' | 'center'; // Transform origin
}

type WidgetPosition = OverlayPosition | CustomPosition;
```

### Visibility Rules

```typescript
type VisibilityTrigger =
  | 'always'
  | 'hover'
  | 'hover-container'
  | 'hover-sibling'
  | 'focus'
  | 'active'
  | { condition: string }; // Custom condition key

interface VisibilityConfig {
  trigger: VisibilityTrigger;
  delay?: number; // ms delay before show/hide
  transition?: 'fade' | 'slide' | 'scale' | 'none';
  transitionDuration?: number; // ms
}
```

### Style Configuration

```typescript
type WidgetSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number; // number = px

interface WidgetStyle {
  size?: WidgetSize;
  opacity?: number; // 0-1
  padding?: number | string;
  zIndex?: number;
  className?: string; // Additional Tailwind classes
  maxWidth?: number | string;
  maxHeight?: number | string;
}
```

### Widget Definition

```typescript
interface OverlayWidget<TData = any> {
  id: string;
  type: string; // 'badge', 'button', 'panel', 'custom'
  position: WidgetPosition;
  visibility: VisibilityConfig;
  style?: WidgetStyle;

  // Content
  render: (data: TData, context: WidgetContext) => React.ReactNode;

  // Behavior
  interactive?: boolean;
  dismissible?: boolean;
  onClick?: (data: TData) => void;

  // Grouping
  group?: string; // Stack with other widgets in same group
  priority?: number; // Higher = rendered on top
}

interface WidgetContext {
  containerRef: React.RefObject<HTMLElement>;
  isHovered: boolean;
  isFocused: boolean;
  customState?: Record<string, any>;
}
```

### Configuration System

```typescript
interface OverlayConfiguration {
  id: string;
  name: string;
  description?: string;

  widgets: OverlayWidget[];

  // Layout
  spacing?: 'compact' | 'normal' | 'spacious'; // Gap between widgets
  collisionDetection?: boolean; // Auto-adjust positions to avoid overlap

  // Defaults
  defaultVisibility?: VisibilityConfig;
  defaultStyle?: WidgetStyle;
}

// Preset system
interface OverlayPreset {
  id: string;
  name: string;
  icon?: string;
  category: 'media' | 'video' | 'hud' | 'dashboard' | 'custom';
  configuration: OverlayConfiguration;
  isUserCreated?: boolean;
  thumbnail?: string;
}
```

## 2. Component Architecture

### OverlayContainer Component

```tsx
interface OverlayContainerProps {
  configuration: OverlayConfiguration;
  data?: any; // Data passed to widget render functions
  customState?: Record<string, any>;
  onWidgetClick?: (widgetId: string, data: any) => void;
  children: React.ReactNode; // Container content
  className?: string;
}

// Usage:
<OverlayContainer configuration={mediaCardOverlayConfig} data={mediaItem}>
  <img src={mediaItem.thumbnail} />
</OverlayContainer>
```

### Widget Renderer

```tsx
interface WidgetRendererProps {
  widget: OverlayWidget;
  context: WidgetContext;
  data: any;
  spacing: number;
  style: React.CSSProperties; // Calculated position
}

// Internal component that handles:
// - Position calculation
// - Visibility logic
// - Transitions
// - Event handling
```

## 3. Built-in Widget Types

### Badge Widget

```typescript
interface BadgeWidgetConfig {
  type: 'badge';
  variant: 'icon' | 'text' | 'icon-text';
  icon?: string;
  label?: string;
  color?: string;
  shape?: 'circle' | 'square' | 'rounded' | 'pill';
  pulse?: boolean;
  tooltip?: string;
}
```

### Button Widget

```typescript
interface ButtonWidgetConfig {
  type: 'button';
  icon?: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick: () => void;
}
```

### Panel Widget

```typescript
interface PanelWidgetConfig {
  type: 'panel';
  title?: string;
  content: React.ReactNode;
  backdrop?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}
```

### Menu Widget

```typescript
interface MenuWidgetConfig {
  type: 'menu';
  trigger: 'hover' | 'click';
  items: Array<{
    icon?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
}
```

## 4. Utility Functions

### Position Calculation

```typescript
function calculatePosition(
  widget: OverlayWidget,
  containerRect: DOMRect,
  spacing: number
): React.CSSProperties {
  // Convert anchor/offset to CSS position
}

function detectCollisions(
  widgets: OverlayWidget[],
  positions: Map<string, DOMRect>
): Map<string, WidgetPosition> {
  // Return adjusted positions to avoid overlap
}
```

### Configuration Management

```typescript
function mergeConfigurations(
  ...configs: Partial<OverlayConfiguration>[]
): OverlayConfiguration {
  // Priority-based merge (similar to badge config merge)
}

function createPreset(
  configuration: OverlayConfiguration,
  metadata: { name: string; icon?: string; }
): OverlayPreset {
  // Create saveable preset
}
```

## 5. Migration Path

### Phase 1: Core System
- [ ] Create type definitions (`lib/overlay/types.ts`)
- [ ] Implement OverlayContainer component
- [ ] Build position calculation utilities
- [ ] Add visibility/transition logic

### Phase 2: Widget Library
- [ ] Implement built-in widget types (badge, button, panel, menu)
- [ ] Create widget factory helpers
- [ ] Add styling utilities

### Phase 3: Configuration System
- [ ] Build preset management
- [ ] Add configuration merge logic
- [ ] Create storage/persistence layer

### Phase 4: Badge System Migration
- [ ] Convert MediaCard badges to overlay widgets
- [ ] Migrate badge presets to overlay presets
- [ ] Update configuration UI

### Phase 5: Expand to Other Components
- [ ] Migrate video node badges
- [ ] Update gizmo indicators
- [ ] Enhance HUD system integration

### Phase 6: Visual Editor (Optional)
- [ ] Drag-drop positioning
- [ ] Live preview
- [ ] Visual preset builder

## 6. Use Case Examples

### Media Card Badges

```typescript
const mediaCardOverlayConfig: OverlayConfiguration = {
  id: 'media-card-default',
  name: 'Default Media Card',
  widgets: [
    {
      id: 'primary-icon',
      type: 'badge',
      position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
      visibility: { trigger: 'always' },
      style: { size: 'md', zIndex: 10 },
      render: (media) => <MediaTypeIcon type={media.type} />
    },
    {
      id: 'status-badge',
      type: 'menu',
      position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
      visibility: { trigger: 'hover-container', delay: 200 },
      style: { zIndex: 20 },
      render: (media) => <StatusMenu media={media} />
    },
    {
      id: 'provider-info',
      type: 'panel',
      position: { anchor: 'bottom-left', offset: { x: 8, y: -8 } },
      visibility: { trigger: 'hover-container' },
      render: (media) => <ProviderInfo media={media} />
    },
    {
      id: 'generate-button',
      type: 'button',
      position: { anchor: 'bottom-right', offset: { x: -8, y: -8 } },
      visibility: { trigger: 'hover-container' },
      render: (media) => <GenerateButton media={media} />
    }
  ],
  spacing: 'normal',
  collisionDetection: true
};
```

### Video Player Controls

```typescript
const videoPlayerOverlayConfig: OverlayConfiguration = {
  id: 'video-player-controls',
  name: 'Video Player',
  widgets: [
    {
      id: 'play-pause',
      type: 'button',
      position: { anchor: 'center' },
      visibility: { trigger: 'hover-container' },
      style: { size: 'lg' }
    },
    {
      id: 'timeline',
      type: 'panel',
      position: { anchor: 'bottom-center', offset: { y: -16 } },
      visibility: { trigger: 'hover-container' }
    },
    {
      id: 'quality-badge',
      type: 'badge',
      position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
      visibility: { trigger: 'always' }
    }
  ]
};
```

### HUD Region Widgets

```typescript
const hudOverlayConfig: OverlayConfiguration = {
  id: 'game-hud',
  name: 'Game HUD',
  widgets: [
    {
      id: 'health-bar',
      type: 'custom',
      position: { anchor: 'top-left', offset: { x: 16, y: 16 } },
      visibility: { trigger: 'always' }
    },
    {
      id: 'minimap',
      type: 'panel',
      position: { anchor: 'bottom-right', offset: { x: -16, y: -16 } },
      visibility: { trigger: 'always' }
    },
    {
      id: 'notification',
      type: 'panel',
      position: { anchor: 'top-center' },
      visibility: { trigger: { condition: 'hasNotification' } }
    }
  ]
};
```

## 7. Benefits

### For Developers
- **Reusable**: One system for all overlay needs
- **Type-safe**: Full TypeScript support
- **Declarative**: Configure, don't implement
- **Composable**: Mix and match widgets
- **Testable**: Isolated widget logic

### For Users
- **Customizable**: Position any widget anywhere
- **Presets**: Quick configurations
- **Save/Share**: Export custom layouts
- **Visual Editor**: Drag-drop positioning (future)
- **Consistent**: Same UX across app

### For Codebase
- **Maintainable**: Centralized positioning logic
- **Extensible**: Easy to add new widget types
- **Consistent**: Unified patterns
- **Future-proof**: Adapt to new use cases
- **Migration-friendly**: Gradual adoption

## 8. File Structure

```
apps/main/src/lib/overlay/
  ├── types.ts              # Core type definitions
  ├── OverlayContainer.tsx  # Main container component
  ├── OverlayWidget.tsx     # Widget renderer component
  ├── widgets/              # Built-in widget types
  │   ├── BadgeWidget.tsx
  │   ├── ButtonWidget.tsx
  │   ├── PanelWidget.tsx
  │   └── MenuWidget.tsx
  ├── utils/
  │   ├── position.ts       # Position calculation
  │   ├── collision.ts      # Collision detection
  │   ├── visibility.ts     # Visibility logic
  │   └── merge.ts          # Configuration merging
  ├── presets/
  │   ├── index.ts          # Preset definitions
  │   ├── mediaCard.ts      # Media card presets
  │   ├── videoPlayer.ts    # Video player presets
  │   └── hud.ts            # HUD presets
  └── hooks/
      ├── useOverlay.ts     # Container hook
      ├── useWidget.ts      # Widget state hook
      └── usePreset.ts      # Preset management
```

## 9. Next Steps

1. Review and approve architecture
2. Create core types and utilities
3. Implement OverlayContainer component
4. Build widget library
5. Migrate badge system
6. Create configuration UI
7. Expand to other components
