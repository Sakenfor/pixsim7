# Generic Overlay Positioning System

## Overview

A reusable, type-safe system for positioning UI elements (badges, controls, overlays, widgets) on container components throughout the application.

### Design Goals

- **Declarative first**: All overlay placement should be expressed as data so presets can be serialized, inspected, and edited visually.
- **Predictable layout**: The same configuration should produce identical placement across pages and frameworks, without relying on incidental CSS.
- **Accessibility-aware**: Widgets must remain focusable and discoverable when hidden behind visibility triggers.
- **Composable**: Widgets from different sources (system presets, user presets, feature flags) should merge deterministically.

### Non-Goals

- **No implicit DOM manipulation**: The system should not directly query or mutate arbitrary DOM nodes. Consumers provide container refs.
- **No layout reflow hacks**: Avoid forced synchronous layout or `requestAnimationFrame` loops to position widgets; prefer pure calculations and CSS transforms.
- **No bespoke per-component CSS**: Styling belongs in widget styles/presets rather than ad-hoc overrides on consuming components.

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

// Implementation notes
// - Containers MUST be `position: relative` (or any non-static value) so absolutely
//   positioned widgets remain inside the overlay surface.
// - Offsets default to `{ x: 0, y: 0 }` when omitted.
// - String offsets should accept CSS units (e.g., `"10%"`, `"1.5rem"`).
// - Validate anchors at runtime and fail fast in development to avoid silent misplacements.
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
  reduceMotion?: boolean; // respect prefers-reduced-motion
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
  pointerEvents?: 'auto' | 'none';
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

  // Accessibility
  ariaLabel?: string;
  tabIndex?: number; // Explicit tab order for focusable widgets

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

  // Runtime expectations
  allowOverflow?: boolean; // Defaults to true. If false, clamp positions to container bounds
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

**Spacing tokens**

- `compact` → 4px gap
- `normal` → 8px gap
- `spacious` → 12px gap

If a consumer passes a numeric spacing into lower-level utilities, normalize it back into these tokens to keep runtime and serialized presets consistent.

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

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

function validateConfiguration(
  configuration: OverlayConfiguration
): ValidationResult {
  // Surface actionable errors (invalid anchors, negative sizes, conflicting tabIndex)
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
- [ ] Add configuration validation + dev warnings

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
- [ ] Accessibility preview (keyboard + screen reader flow)

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

## 7. Implementation Guardrails

- **Container contract**: The immediate overlay wrapper should set `position: relative`, `overflow: visible` by default, and allow an opt-in clamp to `overflow: hidden` when `allowOverflow` is `false`.
- **Anchor math**: Normalize calculations to container width/height first, then apply offsets. Avoid mixing percentage offsets with `translate` transforms without normalizing against anchor origin.
- **Collision strategy**: Prefer deterministic shifting (e.g., push widgets down/right by spacing) over random jitter. Document any fallback that hides colliding widgets.
- **Z-index discipline**: Reserve a small range (e.g., 10–20) for default widgets and allow consumers to opt into higher ranges. Avoid global z-index constants that conflict with modals/tooltips elsewhere in the app.
- **Keyboard navigation**: Widgets that render interactive elements must support focus rings and keyboard activation. When visibility depends on hover, ensure focus still reveals the widget.
- **SSR/CSR parity**: Keep positioning calculations pure so they can run during SSR without touching `window`. Defer DOM measurements to effects that guard for `typeof window !== 'undefined'`.
- **Theming**: Favor tokens/classes (`className`) over inline styles, allowing light/dark theme overrides without altering widget definitions.
- **Pointer/touch fallback**: Degrade `hover`-only triggers to `focus` or `always` on touch-only devices so widgets remain reachable without a cursor.

## 8. Known Gaps & Open Questions

- **Right-to-left layouts**: Should anchors auto-flip (e.g., `top-left` → `top-right`) when `dir="rtl"`? Today, configs assume LTR.
- **Container resizing**: Do widgets reposition on resize observers, or is a manual reflow hook required? Define a contract so heavy reflows can be throttled.
- **Persistence format**: Presets currently assume JSON. If we store in the database, do we need migrations/versioning for widget schema changes?

## 9. Benefits

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

## 10. File Structure

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

## 11. Next Steps

1. Review and approve architecture
2. Create core types and utilities
3. Implement OverlayContainer component
4. Build widget library
5. Migrate badge system
6. Create configuration UI
7. Expand to other components
