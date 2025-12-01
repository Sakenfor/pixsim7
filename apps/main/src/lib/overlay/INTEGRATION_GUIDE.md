# Overlay Unified Config Integration Guide

This guide explains how the overlay system integrates with the unified configuration system, enabling portable and editable overlay presets across different surfaces (Media Cards, HUD, etc.).

## Task 94: Complete Implementation

### 94.1 Registry-Based Reconstruction ✅

**What it does:**
- Extends the widget registry to support overlay widget factories
- Registers all overlay widget types (badge, panel, upload, button) with factories
- Provides `buildOverlayConfigFromUnified()` to reconstruct fully functional OverlayWidget instances from UnifiedSurfaceConfig

**Key Files:**
- `apps/main/src/lib/editing-core/registry/widgetRegistry.ts` - Extended with factory support
- `apps/main/src/lib/overlay/overlayWidgetRegistry.ts` - Widget factory registrations
- `apps/main/src/lib/overlay/overlayConfig.ts` - Added `buildOverlayConfigFromUnified()`

**Usage:**

```typescript
import { registerOverlayWidgets, buildOverlayConfigFromUnified } from '@/lib/overlay';
import type { UnifiedSurfaceConfig } from '@/lib/editing-core';

// Register overlay widgets (call once at app startup)
registerOverlayWidgets();

// Build overlay config from unified config
const unifiedConfig: UnifiedSurfaceConfig = { /* ... */ };
const overlayConfig = buildOverlayConfigFromUnified(unifiedConfig, {
  'widget-id': {
    onClick: (data) => console.log('Clicked!', data),
  },
});

// Use the config with OverlayContainer
<OverlayContainer configuration={overlayConfig} data={myData}>
  {/* content */}
</OverlayContainer>
```

---

### 94.2 Bindings & Widget Props Round-Trip ✅

**What it does:**
- Updates `toUnifiedWidget()` to extract widget-specific props and bindings
- Preserves DataBinding information for badge labels, panel titles/content, upload state/progress, button labels
- Ensures round-trip conversion preserves widget semantics

**Key Widget Props Preserved:**

**Badge:**
- `variant`, `icon`, `color`, `shape`, `pulse`, `tooltip`
- Bindings: `label`

**Panel:**
- `variant`, `backdrop`
- Bindings: `title`, `content`

**Upload:**
- `variant`, `size`, `showProgress`, `successDuration`, `labels`, `icons`
- Bindings: `state`, `progress`

**Button:**
- `variant`, `size`, `icon`, `disabled`, `tooltip`
- Bindings: `label`

**Menu:**
- `trigger`, `triggerType`, `placement`, `closeOnClick`
- Props: `items` (array of menu items - note: function items and onClick handlers cannot be serialized)

**Tooltip:**
- `trigger`, `placement`, `showArrow`, `delay`, `maxWidth`, `rich`
- Props: `content` (note: custom React content cannot be serialized, only basic properties)

**Video Scrub:**
- `showTimeline`, `showTimestamp`, `timelinePosition`, `throttle`, `frameAccurate`, `muted`
- Bindings: `videoUrl`, `duration`

**Progress:**
- `max`, `variant`, `orientation`, `size`, `color`, `showLabel`, `icon`, `animated`, `state`
- Bindings: `value`, `label`

**Usage:**

```typescript
import { toUnifiedSurfaceConfig, createBadgeWidget } from '@/lib/overlay';

// Create overlay with bindings
const badge = createBadgeWidget({
  id: 'status',
  position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
  visibility: { trigger: 'always' },
  variant: 'icon-text',
  icon: 'check',
  color: 'green',
  labelBinding: { kind: 'path', path: 'status.message' },
});

// Export to unified config (preserves bindings)
const unified = toUnifiedSurfaceConfig({
  id: 'my-overlay',
  name: 'My Overlay',
  widgets: [badge],
});

// unified.widgets[0].bindings contains the label binding
// unified.widgets[0].props contains variant, icon, color
```

**Example: Menu Widget**

```typescript
import { createMenuWidget, toUnifiedSurfaceConfig } from '@/lib/overlay';

const menu = createMenuWidget({
  id: 'actions-menu',
  position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
  visibility: { trigger: 'always' },
  trigger: { icon: 'moreVertical', variant: 'icon' },
  triggerType: 'click',
  placement: 'bottom-right',
  items: [
    { id: 'edit', label: 'Edit', icon: 'edit' },
    { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger' },
  ],
});

// Export to unified config (preserves items array)
const unified = toUnifiedSurfaceConfig({
  id: 'menu-overlay',
  name: 'Actions Menu',
  widgets: [menu],
});
```

**Example: Tooltip Widget**

```typescript
import { createTooltipWidget } from '@/lib/overlay';

const tooltip = createTooltipWidget({
  id: 'info-tooltip',
  position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
  visibility: { trigger: 'always' },
  trigger: { type: 'icon', icon: 'info' },
  placement: 'auto',
  content: {
    title: 'Important Info',
    description: 'This is a helpful tooltip',
    icon: 'info',
    iconColor: 'text-blue-500',
  },
});
```

**Example: Video Scrub Widget**

```typescript
import { createVideoScrubWidget } from '@/lib/overlay';

const videoScrub = createVideoScrubWidget({
  id: 'video-preview',
  position: { anchor: 'center' },
  visibility: { trigger: 'hover' },
  videoUrlBinding: { kind: 'path', path: 'video.url' },
  durationBinding: { kind: 'path', path: 'video.duration' },
  showTimeline: true,
  showTimestamp: true,
  timelinePosition: 'bottom',
});
```

**Example: Progress Widget**

```typescript
import { createProgressWidget } from '@/lib/overlay';

const progress = createProgressWidget({
  id: 'upload-progress',
  position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
  visibility: { trigger: 'always' },
  valueBinding: { kind: 'path', path: 'upload.progress' },
  labelBinding: { kind: 'path', path: 'upload.statusText' },
  variant: 'bar',
  orientation: 'horizontal',
  color: 'blue',
  showLabel: true,
  animated: true,
});
```

---

### 94.3 OverlayEditor Type-Aware Creation & Editing ✅

**What it does:**
- Updates OverlayEditor to use widget registry defaults when creating widgets
- Adds TypeSpecificProperties component for type-aware editing
- Exposes type-specific properties (variant, icon, color, etc.) in the property editor

**Key Files:**
- `apps/main/src/components/overlay-editor/OverlayEditor.tsx` - Uses registry for widget creation
- `apps/main/src/components/overlay-editor/TypeSpecificProperties.tsx` - Type-specific property editors
- `apps/main/src/components/overlay-editor/WidgetPropertyEditor.tsx` - Integrated type-specific properties

**Features:**
- When adding a widget, the editor uses sensible defaults from the registry
- Property editor shows type-specific controls based on widget.type
- Supported widgets: badge, panel, upload, button

**Usage:**

```typescript
import { OverlayEditor } from '@/components/overlay-editor';
import { registerOverlayWidgets } from '@/lib/overlay';
import { listWidgets } from '@/lib/editing-core/registry/widgetRegistry';

// Register widgets
registerOverlayWidgets();

// Get available widget types for editor
const availableWidgetTypes = listWidgets()
  .filter(w => w.componentType === 'overlay' || !w.componentType)
  .map(w => ({
    type: w.type,
    name: w.displayName,
    icon: w.icon,
  }));

// Use editor
<OverlayEditor
  configuration={config}
  onChange={setConfig}
  availableWidgetTypes={availableWidgetTypes}
  preview={<MyPreview />}
/>
```

---

### 94.4 Visibility Trigger Fidelity ✅

**What it does:**
- Improves `toUnifiedVisibility()` to preserve overlay-specific triggers (hover-container, hover-sibling, active)
- Updates `fromUnifiedVisibility()` to restore overlay triggers from advanced conditions
- Uses `advanced` conditions with type `'overlayTrigger'` to encode overlay-specific semantics

**Visibility Mapping:**

| Overlay Trigger | Unified Representation |
|----------------|----------------------|
| `always`, `hover`, `focus` | `simple` trigger |
| `hover-container` | `advanced[0]`: `{ type: 'overlayTrigger', params: { trigger: 'hover-container' } }` |
| `hover-sibling` | `advanced[0]`: `{ type: 'overlayTrigger', params: { trigger: 'hover-sibling' } }` |
| `active` | `advanced[0]`: `{ type: 'overlayTrigger', params: { trigger: 'active' } }` |
| `{ condition: 'foo' }` | `advanced[0]`: `{ id: 'foo', type: 'custom' }` |

**Additional Properties Preserved:**
- `delay`, `transition`, `transitionDuration`, `reduceMotion`

**Example:**

```typescript
// Overlay config with hover-container
const widget = createBadgeWidget({
  id: 'badge',
  position: { anchor: 'top-left' },
  visibility: {
    trigger: 'hover-container',
    delay: 200,
    transition: 'fade',
  },
  variant: 'icon',
  icon: 'info',
});

// Convert to unified (preserves hover-container via advanced)
const unified = toUnifiedSurfaceConfig({
  id: 'test',
  name: 'Test',
  widgets: [widget],
});

// unified.widgets[0].visibility.advanced[0].type === 'overlayTrigger'
// unified.widgets[0].visibility.advanced[0].params.trigger === 'hover-container'

// Convert back to overlay (restores hover-container)
const restored = buildOverlayConfigFromUnified(unified);
// restored.widgets[0].visibility.trigger === 'hover-container'
```

---

## Initialization

To use the overlay unified config integration, call `registerOverlayWidgets()` once at app startup:

```typescript
// apps/main/src/main.tsx or similar entry point
import { registerOverlayWidgets } from '@/lib/overlay';

registerOverlayWidgets();

// ... rest of app initialization
```

---

## Supported Widget Types

| Type | Display Name | Factory | Default Config | Type-Specific Props |
|------|-------------|---------|----------------|-------------------|
| `badge` | Badge | ✅ | ✅ | variant, icon, color, shape, pulse, tooltip |
| `panel` | Panel | ✅ | ✅ | variant, backdrop |
| `upload` | Upload Button | ✅ | ✅ | variant, size, showProgress, labels, icons |
| `button` | Button | ✅ | ✅ | variant, size, icon, disabled, tooltip |
| `menu` | Menu | ✅ | ✅ | trigger, triggerType, placement, closeOnClick, items |
| `tooltip` | Tooltip | ✅ | ✅ | trigger, placement, showArrow, delay, maxWidth, rich, content |
| `video-scrub` | Video Scrubber | ✅ | ✅ | showTimeline, showTimestamp, timelinePosition, throttle, frameAccurate, muted |
| `progress` | Progress Bar | ✅ | ✅ | max, variant, orientation, size, color, showLabel, icon, animated, state |

---

## Non-Goals / Out of Scope

- Full HUD editor integration (covered by Task 101+)
- Backward migration of legacy overlay configs
- Adding brand-new widget types (focus is on making existing ones portable)

---

## Future Enhancements

1. Support for more complex binding scenarios (computed bindings, conditional bindings)
2. Visual editor for data bindings
3. Export/import overlay presets as JSON files
4. Improved serialization for complex menu items and tooltip content
