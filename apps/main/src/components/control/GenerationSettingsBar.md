# GenerationSettingsBar Reuse Pattern

## Overview

The `GenerationSettingsBar` component provides a reusable, provider-agnostic UI for generation settings across different generation interfaces in PixSim7. It dynamically adapts to provider capabilities and operation types based on specs fetched from the backend.

## Key Features

- **Provider Agnostic**: Works with any provider (Pixverse, Sora, Runway, etc.)
- **Operation Aware**: Automatically shows/hides parameters based on operation type
- **Dynamic**: Adapts to provider capabilities without code changes
- **Compact**: Horizontal layout optimized for header bars
- **Accessible**: Supports primary (inline) and advanced (popover) parameters

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend UI (React Component)                              │
│ ├─ useProviderSpecs() hook                                 │
│ ├─ GenerationSettingsBar component                         │
│ └─ Dynamic parameter state                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ├─ HTTP GET /api/v1/providers
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API                                                 │
│ ├─ extract_provider_capabilities()                         │
│ ├─ Provider.get_operation_parameter_spec()                 │
│ └─ Returns operation_specs per provider                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ├─ Calls SDK metadata helpers
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ SDK (pixverse-py for Pixverse)                             │
│ ├─ VideoModel, ImageModel enums                            │
│ ├─ VIDEO_OPERATION_FIELDS mapping                          │
│ └─ get_video_operation_fields(operation)                   │
└─────────────────────────────────────────────────────────────┘
```

## Integration Guide

### Step 1: Fetch Provider Specs

Use the `useProviderSpecs` hook to fetch operation specifications for the current provider:

```typescript
import { useProviderSpecs } from '@/hooks/useProviderSpecs';

function MyGenerationUI() {
  const [providerId, setProviderId] = useState<string | undefined>();
  const { specs } = useProviderSpecs(providerId);

  // specs.operation_specs contains parameter metadata per operation
  // e.g., specs.operation_specs.text_to_video.parameters
}
```

### Step 2: Extract Parameter Specs

Filter the operation's parameters to get only the settings parameters (excluding prompt/source fields):

```typescript
import { useMemo } from 'react';
import type { ParamSpec } from './DynamicParamForm';

const paramSpecs = useMemo<ParamSpec[]>(() => {
  if (!specs?.operation_specs) return [];
  const opSpec = specs.operation_specs[operationType];
  if (!opSpec?.parameters) return [];

  // Filter out prompt and operation-specific array fields
  return opSpec.parameters.filter((p: any) =>
    p.name !== 'prompt' &&
    p.name !== 'image_urls' &&
    p.name !== 'prompts' &&
    p.name !== 'image_url' &&  // Add other source fields as needed
    p.name !== 'video_url'
  );
}, [specs, operationType]);
```

### Step 3: Manage State

Hold provider ID and dynamic parameters in component state:

```typescript
const [providerId, setProviderId] = useState<string | undefined>();
const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});
const [showSettings, setShowSettings] = useState(false);

// Handler for parameter changes
function handleDynamicParamChange(name: string, value: any) {
  setDynamicParams(prev => ({ ...prev, [name]: value }));
}
```

### Step 4: Render GenerationSettingsBar

Drop in the component with the required props:

```typescript
import { GenerationSettingsBar } from './GenerationSettingsBar';
import { useProviders } from '@/hooks/useProviders';

function MyGenerationUI() {
  const { providers } = useProviders();

  return (
    <div className="flex items-center gap-2">
      {/* Your other UI elements */}

      <div className="flex-1" />

      {/* Generation settings bar */}
      <GenerationSettingsBar
        providerId={providerId}
        providers={providers}
        paramSpecs={paramSpecs}
        dynamicParams={dynamicParams}
        onChangeParam={handleDynamicParamChange}
        onChangeProvider={setProviderId}
        generating={generating}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
        presetId={presetId}  // Optional: for preset indicator
      />

      {/* Your generate button */}
    </div>
  );
}
```

### Step 5: Auto-Show Settings (Optional)

Automatically expand settings when there are visible options:

```typescript
const hasVisibleOptions = paramSpecs.length > 0;

useEffect(() => {
  if (hasVisibleOptions) {
    setShowSettings(true);
  }
}, [hasVisibleOptions, operationType]);
```

## Props Reference

### GenerationSettingsBarProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `providerId` | `string \| undefined` | No | Currently selected provider ID (undefined = "Auto") |
| `providers` | `ProviderOption[]` | Yes | List of available providers for the dropdown |
| `paramSpecs` | `ParamSpec[]` | Yes | Parameter specifications from operation_specs |
| `dynamicParams` | `Record<string, any>` | Yes | Current parameter values |
| `onChangeParam` | `(name: string, value: any) => void` | Yes | Callback when a parameter changes |
| `onChangeProvider` | `(providerId?: string) => void` | No | Callback when provider changes |
| `generating` | `boolean` | No | Whether generation is in progress (disables inputs) |
| `showSettings` | `boolean` | Yes | Whether settings bar is expanded |
| `onToggleSettings` | `() => void` | Yes | Callback to toggle settings visibility |
| `presetId` | `string` | No | Active preset ID (shows badge) |

### ParamSpec Type

```typescript
interface ParamSpec {
  name: string;          // Parameter name (e.g., "model", "quality")
  type: string;          // Parameter type ("enum", "boolean", "number", "string")
  required?: boolean;    // Whether the parameter is required
  default?: any;         // Default value
  enum?: string[];       // For enum types: list of valid values
  description?: string;  // Human-readable description
  group?: string;        // Grouping hint (not currently used in UI)
  min?: number;          // For number types: minimum value
  max?: number;          // For number types: maximum value
}
```

## Primary vs Advanced Parameters

The component automatically splits parameters into:

### Primary Parameters (Inline Selects)
- Must have `enum` type (dropdown with predefined options)
- Must be in the `PRIMARY_PARAM_NAMES` list:
  - `duration`
  - `quality`
  - `aspect_ratio`
  - `model`
  - `model_version`
  - `seconds`
  - `style`
  - `resolution`
- Shown directly in the settings bar as small inline dropdowns

### Advanced Parameters (Popover)
- All non-primary parameters OR parameters without `enum` values
- Includes:
  - Booleans (rendered as checkboxes)
  - Numbers (rendered as number inputs)
  - Strings (rendered as text inputs)
  - Enums not in primary list (rendered as dropdowns)
- Shown in a `+N` popover that opens on click

## Example: QuickGenerateModule Integration

See `QuickGenerateModule.tsx` for a complete working example:

```typescript
// 1. Fetch specs
const { specs } = useProviderSpecs(providerId);

// 2. Extract param specs
const paramSpecs = useMemo<ParamSpec[]>(() => {
  if (!specs?.operation_specs) return [];
  const opSpec = specs.operation_specs[operationType];
  if (!opSpec?.parameters) return [];

  return opSpec.parameters.filter((p: any) =>
    p.name !== 'prompt' &&
    p.name !== 'image_urls' &&
    p.name !== 'prompts'
  );
}, [specs, operationType]);

// 3. Render in header
<GenerationSettingsBar
  providerId={providerId}
  providers={providers}
  paramSpecs={paramSpecs}
  dynamicParams={dynamicParams}
  onChangeParam={handleDynamicParamChange}
  onChangeProvider={setProvider}
  generating={generating}
  showSettings={showSettings}
  onToggleSettings={() => setShowSettings(!showSettings)}
  presetId={presetId}
/>
```

## Planned Integration Points

The following UIs are candidates for using `GenerationSettingsBar`:

### 1. Intimacy Scene Composer (Generation Tab)
- Location: `apps/main/src/components/intimacy/IntimacySceneComposer.tsx`
- Context: Character/scene generation interface
- Pattern: Same as QuickGenerateModule, but filter for intimacy-relevant params

### 2. Development Tools
- **Generation Health Panel**: Preview generation settings for debugging
- **Prompt Inspector**: Show effective parameters for a generation
- **Provider Comparison**: Side-by-side settings for different providers

### 3. Asset Browser Context Menu
- Quick generation actions with inline settings
- Right-click → "Generate similar" with settings popover

## Provider-Specific Behavior

### Pixverse
Thanks to the SDK integration, Pixverse automatically:
- Shows all video models (v3.5, v4, v5, v5.5) in `model` dropdown
- Hides `aspect_ratio` for `image_to_video` (follows source image)
- Shows `camera_movement` only for `image_to_video`
- Exposes `multi_shot`, `audio`, `off_peak` as checkboxes in advanced section

### Other Providers (Sora, Runway, Pika)
Each provider can define its own operation_specs with custom parameters.
The GenerationSettingsBar will automatically adapt to their parameter lists.

## Adding New Parameters

To add a new parameter (e.g., for a new Pixverse feature):

### Backend (SDK)
1. Add field to `GenerationOptions` in `pixverse-py/pixverse/models.py`
2. Add field name to relevant operations in `VIDEO_OPERATION_FIELDS`
3. SDK change is automatically picked up by adapter

### Backend (Adapter)
1. Add field spec to `video_field_specs` in `pixverse.py`
2. The `_fields_for()` helper will include it automatically

### Frontend
- **No changes needed!**
- The component will automatically:
  - Fetch the new parameter via `/api/v1/providers`
  - Render appropriate input (checkbox for boolean, dropdown for enum, etc.)
  - Include it in primary or advanced section based on type

## Styling and Customization

The component uses Tailwind classes and supports dark mode out of the box.

### Key Classes
- Settings bar: `bg-neutral-100 dark:bg-neutral-800`
- Inputs: `bg-white dark:bg-neutral-700`
- Popover: `bg-white dark:bg-neutral-900`
- Text: `text-[10px]` for compact display

### Customization Points
- **PRIMARY_PARAM_NAMES**: Edit to change which params appear inline vs in popover
- **Dropdown widths**: Adjust `max-w-[80px]` for primary param selects
- **Popover size**: Adjust `min-w-[180px] max-h-[250px]` for advanced popover

## Troubleshooting

### Settings Not Showing
- Check that `showSettings` state is true
- Verify `paramSpecs` has length > 0
- Check browser console for errors in spec fetching

### Parameter Not Appearing
- Verify it's in the backend's `get_operation_parameter_spec()` for the operation
- Check it's not filtered out in the `paramSpecs` useMemo
- Ensure the parameter name doesn't match excluded names (prompt, image_urls, etc.)

### Wrong Provider Specs
- Check that `providerId` state matches the intended provider
- Verify `/api/v1/providers` returns correct specs for that provider
- For Pixverse, ensure pixverse-py SDK is installed and up to date

### Advanced Params Not Working
- Boolean params should have `type: "boolean"` in spec
- Enum params without PRIMARY_PARAM_NAME will go to advanced section
- Check popover is opening (click the `+N` button)

## Best Practices

1. **Always filter source fields** (prompt, image_url, etc.) from paramSpecs
2. **Use the onChangeProvider callback** instead of treating provider as a regular param
3. **Auto-expand settings** when there are visible options for better UX
4. **Disable inputs during generation** by passing `generating` prop
5. **Show preset indicator** when a preset is active for user clarity
6. **Validate params before submission** using SDK's `validate_operation_params()`

## References

- **Component**: `apps/main/src/components/control/GenerationSettingsBar.tsx`
- **Example Usage**: `apps/main/src/components/control/QuickGenerateModule.tsx`
- **SDK Docs**: `pixverse-py/README.md`
- **Backend Adapter**: `pixsim7/backend/main/services/provider/adapters/pixverse.py`
