# Generation Components

This directory contains shared generation UI components and hooks that provide a consistent experience across different generation surfaces (Quick Generate, Intimacy Composer, dev tools, etc.).

## Overview

The generation workbench pattern separates concerns:

- **Settings management** (`useGenerationWorkbench` hook) - Provider selection, parameter specs, preset sync
- **UI layout** (`GenerationWorkbench` component) - Settings bar, generate button, error/status display
- **Caller-specific content** (render props) - Operation selectors, prompt inputs, asset displays

## Components

### `GenerationWorkbench`

A reusable component that encapsulates the common UI patterns for generation:

- Header row with settings bar and generate button
- Main content area (customizable via render props)
- Error display
- Generation status tracking
- Optional recent prompts

```tsx
import { GenerationWorkbench } from '@/components/generation/GenerationWorkbench';
import { useGenerationWorkbench } from '@/hooks/useGenerationWorkbench';

function MyGenerationUI() {
  const workbench = useGenerationWorkbench({ operationType: 'text_to_video' });
  const [prompt, setPrompt] = useState('');

  const handleGenerate = async () => {
    // Your generation logic
  };

  return (
    <GenerationWorkbench
      // Settings bar props (from workbench hook)
      providerId={workbench.providerId}
      providers={workbench.providers}
      paramSpecs={workbench.paramSpecs}
      dynamicParams={workbench.dynamicParams}
      onChangeParam={workbench.handleParamChange}
      onChangeProvider={workbench.setProvider}
      generating={workbench.generating}
      showSettings={workbench.showSettings}
      onToggleSettings={workbench.toggleSettings}
      presetId={workbench.presetId}
      operationType="text_to_video"

      // Generation action
      onGenerate={handleGenerate}
      canGenerate={prompt.trim().length > 0}

      // Error & status
      error={error}
      generationId={generationId}

      // Render props for customization
      renderHeader={() => (
        <select value={mode} onChange={...}>
          <option value="text">Text Mode</option>
          <option value="image">Image Mode</option>
        </select>
      )}
      renderContent={() => (
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt..."
        />
      )}
    />
  );
}
```

### Props

#### Settings Bar Props

| Prop | Type | Description |
|------|------|-------------|
| `providerId` | `string \| undefined` | Currently selected provider ID |
| `providers` | `{ id: string; name: string }[]` | Available providers |
| `paramSpecs` | `ParamSpec[]` | Parameter specifications |
| `dynamicParams` | `Record<string, any>` | Current parameter values |
| `onChangeParam` | `(name: string, value: any) => void` | Parameter change handler |
| `onChangeProvider` | `(id: string \| undefined) => void` | Provider change handler |
| `generating` | `boolean` | Whether generation is in progress |
| `showSettings` | `boolean` | Whether settings bar is visible |
| `onToggleSettings` | `() => void` | Toggle settings visibility |
| `presetId` | `string \| undefined` | Active preset ID |
| `operationType` | `string \| undefined` | Operation type for cost estimation |

#### Generation Action Props

| Prop | Type | Description |
|------|------|-------------|
| `onGenerate` | `() => void` | Generate button click handler |
| `canGenerate` | `boolean` | Whether generation is allowed |
| `generateButtonLabel` | `ReactNode` | Custom button label |
| `generateButtonTitle` | `string` | Button tooltip |

#### Error & Status Props

| Prop | Type | Description |
|------|------|-------------|
| `error` | `string \| null` | Error message to display |
| `generationId` | `number \| null` | Generation ID for status tracking |

#### Visibility Toggles

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `hideErrorDisplay` | `boolean` | `false` | Hide error display |
| `hideStatusDisplay` | `boolean` | `false` | Hide status display |
| `hideGenerateButton` | `boolean` | `false` | Hide generate button |
| `hideRecentPrompts` | `boolean` | `false` | Hide recent prompts |

#### Render Props

| Prop | Type | Description |
|------|------|-------------|
| `renderHeader` | `(ctx) => ReactNode` | Custom header content (before settings) |
| `renderContent` | `(ctx) => ReactNode` | Main content area |
| `renderFooter` | `(ctx) => ReactNode` | Footer content |

The render context (`ctx`) contains:
- `generating: boolean` - Whether generation is in progress
- `error: string | null` - Current error
- `generationId: number | null` - Current generation ID

## Hooks

### `useGenerationWorkbench`

Provides shared state and initialization logic for generation settings.

```tsx
import { useGenerationWorkbench } from '@/hooks/useGenerationWorkbench';

const workbench = useGenerationWorkbench({
  operationType: 'text_to_video',  // Operation for param specs
  autoShowSettings: true,          // Auto-show settings when params available
  excludeParams: ['prompt'],       // Params to filter out
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `operationType` | `OperationType` | Store value | Operation for parameter specs |
| `providerId` | `string` | Store value | Override provider ID |
| `autoShowSettings` | `boolean` | `true` | Auto-show settings when available |
| `excludeParams` | `string[]` | `['prompt', 'image_urls', 'prompts']` | Params to exclude |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `providerId` | `string \| undefined` | Selected provider |
| `setProvider` | `(id) => void` | Set provider |
| `providers` | `Provider[]` | Available providers |
| `paramSpecs` | `ParamSpec[]` | Filtered param specs |
| `dynamicParams` | `Record<string, any>` | Current params |
| `setDynamicParams` | `Dispatch<...>` | Set params |
| `handleParamChange` | `(name, value) => void` | Handle single param change |
| `showSettings` | `boolean` | Settings visibility |
| `setShowSettings` | `Dispatch<...>` | Set visibility |
| `toggleSettings` | `() => void` | Toggle visibility |
| `presetId` | `string \| undefined` | Active preset |
| `generating` | `boolean` | Generation in progress |
| `effectiveOperationType` | `OperationType` | Resolved operation type |

## Usage Examples

### QuickGenerateModule

The main Control Center generation UI uses the workbench:

```tsx
function QuickGenerateModule() {
  const controller = useQuickGenerateController();
  const workbench = useGenerationWorkbench({ operationType: controller.operationType });

  return (
    <GenerationWorkbench
      {...workbench}
      onGenerate={controller.generate}
      canGenerate={controller.prompt.trim().length > 0}
      error={controller.error}
      generationId={controller.generationId}
      renderHeader={() => <OperationSelector />}
      renderContent={() => <PromptInput />}
    />
  );
}
```

### IntimacySceneComposer

The intimacy composer uses just the hook for settings, with its own generation flow:

```tsx
function IntimacySceneComposer() {
  const workbench = useGenerationWorkbench({
    operationType: 'text_to_video',
    autoShowSettings: true,
  });

  return (
    <div>
      <GenerationSettingsBar
        providerId={workbench.providerId}
        providers={workbench.providers}
        paramSpecs={workbench.paramSpecs}
        dynamicParams={workbench.dynamicParams}
        onChangeParam={workbench.handleParamChange}
        // ...
      />
      <GenerationPreviewPanel
        providerId={workbench.providerId}
        generationParams={workbench.dynamicParams}
      />
    </div>
  );
}
```

### Custom Dev Tool

For a simpler tool that just needs basic generation:

```tsx
function DevGenerateTool() {
  const workbench = useGenerationWorkbench({ operationType: 'text_to_image' });
  const [prompt, setPrompt] = useState('');

  return (
    <GenerationWorkbench
      {...workbench}
      onGenerate={() => console.log('Generate:', prompt, workbench.dynamicParams)}
      canGenerate={prompt.length > 0}
      hideRecentPrompts
      hideStatusDisplay
      renderContent={() => (
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      )}
    />
  );
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GenerationWorkbench                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Header Row                                             │ │
│  │  ┌──────────────┐ ┌─────────────────┐ ┌─────────────┐ │ │
│  │  │ renderHeader │ │SettingsBar      │ │GenerateBtn  │ │ │
│  │  │ (operation   │ │(provider,params)│ │             │ │ │
│  │  │  selector)   │ │                 │ │             │ │ │
│  │  └──────────────┘ └─────────────────┘ └─────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  renderContent                                          │ │
│  │  (prompt input, asset display, etc.)                   │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Error Display (if error)                               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  GenerationStatusDisplay (if generationId)              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  renderFooter                                           │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Recent Prompts (if enabled)                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Related Files

- `GenerationWorkbench.tsx` - Main workbench component
- `useGenerationWorkbench.ts` - Shared settings hook
- `GenerationSettingsBar.tsx` - Provider/param settings bar
- `GenerationStatusDisplay.tsx` - Generation status tracking
- `SocialContextPanel.tsx` - Social context for intimacy
