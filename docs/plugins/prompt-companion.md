# Prompt Companion Plugin

The Prompt Companion is a plugin bundle that injects an interactive toolbar alongside prompt input surfaces. It provides quick access to prompt analysis, variant suggestions, and semantic pack hints.

## Overview

The Prompt Companion plugin demonstrates the **Prompt Companion Slot** pattern - an extension mechanism that allows plugins to inject UI alongside any prompt input surface in the application.

The system supports **4 integration patterns** for maximum flexibility:

| Pattern | Use When | Effort |
|---------|----------|--------|
| **Explicit Host** | Full control needed | Manual placement |
| **Context Provider** | Wrapping existing components | Wrap once |
| **Hook with Bind** | Custom textarea/input components | Use hook |
| **Global Injector** | Zero-config, data attributes | Add attribute |

### Supported Surfaces

Any surface name works! Common ones:

| Surface | Location | Notes |
|---------|----------|-------|
| `prompt-lab` | Prompt Lab Analyze tab | Full features in dev mode |
| `quick-generate` | Quick Generate panel | Compact layout |
| `generation-workbench` | Generation Workbench | Via `renderFooter` prop |
| `{custom}` | Any custom surface | Just use a unique string |

## Features

### 1. Explain Blocks
Analyzes the prompt structure and breaks it down into categorized segments:
- **Character** - Character descriptions and references
- **Action** - Actions and movements
- **Setting** - Environment and location details
- **Mood** - Emotional tone and atmosphere
- **Romance** - Romantic elements
- **Other** - Uncategorized content

### 2. Suggest Variants
Generates AI-powered prompt variations. This feature:
- Requires the variants API endpoint
- Degrades gracefully if the API is unavailable
- Shows a "Dev-only" notice in production mode if unavailable

### 3. Pack Hints (Dev Mode)
Discovers semantic categories and packs for the prompt:
- Suggested ontology IDs
- Suggested semantic packs with parser hints
- Suggested action blocks

### 4. Block Builder
A modal for building new prompt blocks from analyzed segments:
- Select segments from different categories
- Combine with sentence or inline separators
- Add custom text
- Preview and insert the combined block

## Usage

### Enabling the Plugin

The plugin is registered during app initialization. Add to your main.tsx:

```typescript
import { registerPromptCompanion } from '@/plugins/ui/prompt-companion';

// During initialization
registerPromptCompanion();
```

---

## Integration Patterns

### Pattern 1: Explicit Host (Original)

Full control over placement. Best for complex layouts.

```tsx
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';

function MyPromptSurface() {
  const [prompt, setPrompt] = useState('');

  return (
    <div>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />

      <PromptCompanionHost
        surface="my-surface"
        promptValue={prompt}
        setPromptValue={setPrompt}
        metadata={{ customData: 'value' }}
      />
    </div>
  );
}
```

### Pattern 2: Context Provider (Recommended for Wrappers)

Wrap your component once, companion auto-injects.

```tsx
import { PromptSurfaceProvider } from '@lib/ui/promptCompanionSlot';
import { PromptInput } from '@pixsim7/shared.ui';

function MyFeature() {
  const [prompt, setPrompt] = useState('');

  return (
    <PromptSurfaceProvider
      surface="my-feature"
      value={prompt}
      onChange={setPrompt}
      companionPosition="bottom" // 'top' | 'bottom' | 'none'
      metadata={{ feature: 'my-feature' }}
    >
      <PromptInput value={prompt} onChange={setPrompt} />
      {/* Companion auto-renders at bottom */}
    </PromptSurfaceProvider>
  );
}
```

### Pattern 3: Hook with Bind (Most Flexible)

For custom inputs. Get bind props and a CompanionSlot component.

```tsx
import { usePromptSurface } from '@lib/ui/promptCompanionSlot';

function MyCustomPrompt() {
  const [prompt, setPrompt] = useState('');

  const { bind, CompanionSlot } = usePromptSurface({
    surface: 'custom-prompt',
    value: prompt,
    onChange: setPrompt,
    metadata: { mode: 'advanced' },
  });

  return (
    <div>
      <textarea {...bind} className="w-full p-2 border rounded" />
      <CompanionSlot className="mt-2" />
    </div>
  );
}
```

### Pattern 4: Global Injector (Zero Config)

Add `GlobalPromptCompanionInjector` to your app root, then use data attributes.

```tsx
// In App.tsx (once)
import { GlobalPromptCompanionInjector } from '@lib/ui/promptCompanionSlot';

function App() {
  return (
    <>
      <GlobalPromptCompanionInjector />
      <Routes />
    </>
  );
}

// Anywhere in the app - just add attributes
function AnyComponent() {
  const [prompt, setPrompt] = useState('');
  const id = useId();

  return (
    <textarea
      data-prompt-surface="my-surface"
      data-prompt-surface-id={id}
      value={prompt}
      onChange={(e) => setPrompt(e.target.value)}
    />
    // Companion auto-injects via portal!
  );
}
```

### With GenerationWorkbench

```tsx
import { GenerationWorkbench } from '@features/generation';
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';

<GenerationWorkbench
  // ... other props
  renderFooter={() => (
    <PromptCompanionHost
      surface="generation-workbench"
      promptValue={prompt}
      setPromptValue={setPrompt}
      metadata={{ operationType }}
    />
  )}
/>
```

---

## Pattern Comparison

| Pattern | Auto-injects | Needs State Access | Portal Support | Best For |
|---------|--------------|-------------------|----------------|----------|
| Explicit Host | No | Yes | No | Full control |
| Context Provider | Yes | Via props | No | Wrapping components |
| Hook with Bind | Partial | Yes | Yes | Custom inputs |
| Global Injector | Yes | Via DOM | Yes | Legacy/third-party code |

## Architecture

### Slot System

The slot system consists of:

1. **Registry** (`promptCompanionRegistry`)
   - Tracks registered companion plugins
   - Filters plugins by surface and dev mode
   - Notifies listeners on changes

2. **Context** (`PromptCompanionContext`)
   ```typescript
   interface PromptCompanionContext {
     promptValue: string;
     setPromptValue: (next: string) => void;
     surface: PromptCompanionSurface;
     metadata?: Record<string, unknown>;
     isDevMode: boolean;
   }
   ```

3. **Host Component** (`PromptCompanionHost`)
   - Renders registered plugins for the current surface
   - Provides context to plugin components
   - Handles dev mode filtering

4. **Event Bus** (`promptCompanionEvents`)
   - Inter-plugin communication
   - Event types: analyze, suggest-variants, pack-hints, insert-block, etc.

### Plugin Structure

```
plugins/ui/prompt-companion/
├── manifest.ts           # Plugin metadata
├── register.ts           # Registration function
├── index.ts              # Public exports
└── components/
    ├── PromptCompanionPanel.tsx    # Main toolbar
    ├── BlockBreakdownDrawer.tsx    # Analysis results
    ├── VariantSuggestionsDrawer.tsx # Variant selection
    ├── PackHintsDrawer.tsx         # Pack discovery results
    └── BlockBuilderModal.tsx       # Block composition
```

## API Endpoints

The plugin uses these dev API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dev/prompt-inspector/analyze-prompt` | POST | Analyze prompt structure |
| `/dev/prompt-editor/suggest-variants` | POST | Generate prompt variants |
| `/dev/prompt-categories/discover` | POST | Discover semantic categories |

## Configuration

### Disabling the Plugin

The plugin can be disabled via the plugin catalog:

```typescript
import { pluginActivationManager } from '@lib/plugins/pluginSystem';

// Disable
pluginActivationManager.deactivate('prompt-companion');

// Re-enable
pluginActivationManager.activate('prompt-companion');
```

### Dev Mode Behavior

- **Dev Mode**: All features available
- **Production Mode**:
  - Pack Hints button hidden
  - Variant suggestions show "Dev-only" notice if API fails
  - Block analysis works normally

## Creating Custom Companion Plugins

To create a custom companion plugin:

```typescript
import { promptCompanionRegistry } from '@lib/ui/promptCompanionSlot';
import type { PromptCompanionContext } from '@lib/ui/promptCompanionSlot';

function MyCustomToolbar(context: PromptCompanionContext) {
  const { promptValue, setPromptValue, isDevMode } = context;

  return (
    <div className="flex gap-2">
      <button onClick={() => setPromptValue(promptValue.toUpperCase())}>
        Uppercase
      </button>
    </div>
  );
}

// Register
promptCompanionRegistry.register({
  id: 'my-custom-toolbar',
  name: 'My Custom Toolbar',
  priority: 50, // Lower than default (100)
  component: MyCustomToolbar,
  supportedSurfaces: ['prompt-lab'], // Only in Prompt Lab
  devOnly: true, // Only in dev mode
});
```

## Related Documentation

- [Plugin Architecture](../PLUGIN_ARCHITECTURE.md)
- [Prompt Lab Dev Route](../routes/prompt-lab-dev.md)
- [Generation Workbench](../features/generation.md)
