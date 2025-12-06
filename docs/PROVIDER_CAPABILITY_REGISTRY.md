# Provider Capability Registry

**Status**: ✅ Implemented
**Date**: 2025-11-18
**Related Issues**: LLM/prompt/generation pipeline improvements

## Overview

The Provider Capability Registry is a frontend system that pulls provider capabilities, limits, and controls from the backend and provides a plugin-based architecture for generation UI. This replaces hardcoded provider-specific logic with a dynamic, extensible system.

## Motivation

**Before**:
- `apps/main/src/utils/prompt/limits.ts` had hardcoded provider limits
- Provider-specific UI logic scattered across components
- No centralized access to provider capabilities
- Adding new providers required changes in multiple places

**After**:
- Dynamic capability fetching from backend `/providers` endpoint
- Centralized provider capability registry
- Plugin-based architecture for provider-specific UI
- Type-safe access to limits, controls, and cost hints

## Architecture

### Core Components

```
apps/main/src/lib/providers/
├── types.ts                      # Type definitions
├── capabilityRegistry.ts         # Core registry class
├── hooks.ts                      # React hooks for capability access
├── generationPlugins.ts          # Plugin system
├── pluginHooks.tsx               # React hooks for plugins
├── plugins/
│   ├── PixversePlugin.tsx       # Pixverse-specific UI
│   ├── SoraPlugin.tsx           # Sora-specific UI
│   └── index.ts                 # Plugin registration
└── index.ts                     # Public API exports
```

### Data Flow

```
Backend /providers API
        ↓
ProviderCapabilityRegistry (fetch & cache)
        ↓
React Hooks (useProviderCapability, usePromptLimit, etc.)
        ↓
UI Components (QuickGenerateModule, etc.)
        ↓
GenerationUIPluginRegistry (provider-specific UI)
        ↓
Provider Plugins (PixversePlugin, SoraPlugin, etc.)
```

## Usage

### 1. Basic Capability Access

```tsx
import { useProviderCapability, usePromptLimit } from '@/lib/providers';

function ProviderForm({ providerId }: { providerId: string }) {
  const { capability, loading, error } = useProviderCapability(providerId);
  const maxChars = usePromptLimit(providerId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>{capability?.name}</h2>
      <p>Operations: {capability?.operations.join(', ')}</p>
      <p>Max prompt chars: {maxChars}</p>
    </div>
  );
}
```

### 2. Using Provider Limits

```tsx
import { useProviderLimits } from '@/lib/providers';

function LimitsDisplay({ providerId }: { providerId: string }) {
  const limits = useProviderLimits(providerId);

  return (
    <div>
      <div>Max prompt: {limits?.prompt_max_chars}</div>
      <div>Max duration: {limits?.max_duration}s</div>
      <div>Max resolution: {limits?.max_resolution?.width}x{limits?.max_resolution?.height}</div>
    </div>
  );
}
```

### 3. Checking Provider Features

```tsx
import { useProviderFeature } from '@/lib/providers';

function UploadButton({ providerId }: { providerId: string }) {
  const canUpload = useProviderFeature(providerId, 'asset_upload');

  if (!canUpload) return null;

  return <button>Upload Asset</button>;
}
```

### 4. Getting Quality Presets & Aspect Ratios

```tsx
import { useQualityPresets, useAspectRatios } from '@/lib/providers';

function GenerationSettings({ providerId }: { providerId: string }) {
  const qualityPresets = useQualityPresets(providerId);
  const aspectRatios = useAspectRatios(providerId);

  return (
    <div>
      <select>
        {qualityPresets.map(preset => (
          <option key={preset}>{preset}</option>
        ))}
      </select>
      <select>
        {aspectRatios.map(ratio => (
          <option key={ratio}>{ratio}</option>
        ))}
      </select>
    </div>
  );
}
```

### 5. Using Operation Specs

```tsx
import { useOperationSpec } from '@/lib/providers';

function DynamicForm({ providerId, operation }: Props) {
  const opSpec = useOperationSpec(providerId, operation);

  if (!opSpec) return <div>Operation not supported</div>;

  return (
    <form>
      {opSpec.parameters.map(param => (
        <div key={param.name}>
          <label>{param.name}</label>
          {param.type === 'string' && <input type="text" />}
          {param.type === 'number' && (
            <input
              type="number"
              min={param.min}
              max={param.max}
              step={param.step}
            />
          )}
          {param.enum && (
            <select>
              {param.enum.map(opt => <option key={opt}>{opt}</option>)}
            </select>
          )}
        </div>
      ))}
    </form>
  );
}
```

## Plugin System

### Creating a Provider Plugin

```tsx
import { defineGenerationUIPlugin } from '@/lib/providers';
import type { GenerationUIPluginProps } from '@/lib/providers';

function MyProviderControls({
  providerId,
  operationType,
  values,
  onChange,
  disabled,
}: GenerationUIPluginProps) {
  if (providerId !== 'my-provider') return null;

  return (
    <div>
      <label>Custom Control</label>
      <input
        value={values.custom_param || ''}
        onChange={(e) => onChange('custom_param', e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export const myProviderPlugin = defineGenerationUIPlugin({
  id: 'my-provider-controls',
  providerId: 'my-provider',
  operations: ['text_to_video'], // Optional: specific operations
  component: MyProviderControls,
  priority: 10,
  validate: (values) => {
    const errors: Record<string, string> = {};

    if (values.custom_param && values.custom_param.length > 100) {
      errors.custom_param = 'Must be 100 chars or less';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  },
  metadata: {
    name: 'My Provider Controls',
    description: 'Custom controls for my provider',
    version: '1.0.0',
  },
});
```

### Registering a Plugin

```tsx
import { generationUIPluginRegistry } from '@/lib/providers';
import { myProviderPlugin } from './MyProviderPlugin';

// Register on app startup
generationUIPluginRegistry.register(myProviderPlugin);
```

### Using Plugins in Components

```tsx
import { GenerationPluginRenderer } from '@/lib/providers';

function GenerationForm({ providerId, operation, values, onChange }: Props) {
  return (
    <div>
      {/* Standard form fields */}
      <input type="text" value={values.prompt} onChange={...} />

      {/* Provider-specific plugin UI */}
      <GenerationPluginRenderer
        providerId={providerId}
        operationType={operation}
        values={values}
        onChange={onChange}
        disabled={false}
      />
    </div>
  );
}
```

### Validating with Plugins

```tsx
import { usePluginValidation } from '@/lib/providers';

function GenerationForm({ providerId, operation, values }: Props) {
  const validation = usePluginValidation(providerId, operation, values);

  return (
    <div>
      {validation.errors && (
        <div className="errors">
          {Object.entries(validation.errors).map(([field, error]) => (
            <div key={field}>{field}: {error}</div>
          ))}
        </div>
      )}
      {validation.warnings && (
        <div className="warnings">
          {Object.entries(validation.warnings).map(([field, warning]) => (
            <div key={field}>{field}: {warning}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Available Hooks

### Capability Hooks

- `useProviderCapabilities()` - Get all provider capabilities
- `useProviderCapability(providerId)` - Get specific provider capability
- `usePromptLimit(providerId)` - Get prompt character limit
- `useProviderLimits(providerId)` - Get all limits
- `useCostHints(providerId)` - Get cost estimation hints
- `useSupportedOperations(providerId)` - Get supported operations
- `useProviderFeature(providerId, feature)` - Check if feature is supported
- `useQualityPresets(providerId)` - Get quality presets
- `useAspectRatios(providerId)` - Get aspect ratios
- `useOperationSpec(providerId, operation)` - Get operation parameter spec

### Plugin Hooks

- `useGenerationPlugins(providerId, operation)` - Get plugins for provider/operation
- `useRenderPlugins(providerId, operation, props)` - Render plugin components
- `usePluginValidation(providerId, operation, values)` - Validate using plugins

## Types

```typescript
interface ProviderCapability {
  provider_id: string;
  name?: string;
  operations: string[];
  features: {
    embedded_assets: boolean;
    asset_upload: boolean;
  };
  operation_specs: Record<string, OperationSpec>;
  quality_presets?: string[];
  aspect_ratios?: string[];
  parameter_hints?: Record<string, string[]>;
  limits?: ProviderLimits;
  cost_hints?: CostHints;
}

interface ProviderLimits {
  prompt_max_chars?: number;
  max_duration?: number;
  max_resolution?: { width: number; height: number };
  max_variants?: number;
}

interface CostHints {
  per_second?: number;
  per_generation?: number;
  currency?: string;
  estimation_note?: string;
}

interface OperationSpec {
  parameters: OperationParameterSpec[];
}

interface OperationParameterSpec {
  name: string;
  type: string;
  required: boolean;
  default: any | null;
  enum: string[] | null;
  description: string | null;
  group: string | null;
  min?: number;
  max?: number;
  step?: number;
}
```

## Cache Management

The capability registry uses a 5-minute TTL cache by default:

```typescript
// Default config
const registry = new ProviderCapabilityRegistry({
  cacheTTL: 5 * 60 * 1000, // 5 minutes
  autoFetch: true,
});

// Manual refresh
providerCapabilityRegistry.invalidate();
await providerCapabilityRegistry.fetchCapabilities();

// Clear cache
providerCapabilityRegistry.clear();
```

## Integration with Existing Code

### Before

```typescript
// Hardcoded limits
const PROVIDER_LIMITS: Record<string, number> = {
  pixverse: 2048,
};

export function resolvePromptLimit(providerId?: string): number {
  if (!providerId) return DEFAULT_PROMPT_MAX_CHARS;
  return PROVIDER_LIMITS[providerId] ?? DEFAULT_PROMPT_MAX_CHARS;
}
```

### After

```typescript
import { providerCapabilityRegistry } from '@/lib/providers';

export function resolvePromptLimit(providerId?: string): number {
  if (!providerId) return DEFAULT_PROMPT_MAX_CHARS;
  const limit = providerCapabilityRegistry.getPromptLimit(providerId);
  return limit ?? DEFAULT_PROMPT_MAX_CHARS;
}
```

## Example Plugins

### Pixverse Plugin Features

- Motion mode selection (auto, slow, fast)
- Camera movement controls (zoom, pan, tilt)
- Negative prompt support
- Style presets (realistic, anime, 3D, fantasy, cinematic)
- Validation for parameter constraints

### Sora Plugin Features

- Model selection (turbo, standard)
- Variant count (1-4 variants)
- Resolution controls (width/height with 64px steps)
- Image source type (URL vs Media ID)
- Validation for resolution constraints
- Cost warnings for multiple variants

## Migration Guide

### For Component Authors

1. **Replace hardcoded limits**:
   ```tsx
   // Before
   const maxChars = providerId === 'pixverse' ? 2048 : 800;

   // After
   const maxChars = usePromptLimit(providerId);
   ```

2. **Replace provider-specific conditionals**:
   ```tsx
   // Before
   {providerId === 'pixverse' && <PixverseControls />}
   {providerId === 'sora' && <SoraControls />}

   // After
   <GenerationPluginRenderer
     providerId={providerId}
     operationType={operation}
     values={values}
     onChange={onChange}
   />
   ```

3. **Use capability checks**:
   ```tsx
   // Before
   const canUpload = providerId === 'sora';

   // After
   const canUpload = useProviderFeature(providerId, 'asset_upload');
   ```

### For Plugin Authors

1. Create a new plugin file in `apps/main/src/lib/providers/plugins/`
2. Define your component with `GenerationUIPluginProps`
3. Use `defineGenerationUIPlugin()` to create the plugin
4. Register in `plugins/index.ts`
5. Import plugins early in your app (e.g., in `main.tsx`)

## Benefits

1. **Dynamic Configuration**: No need to update frontend code when backend providers change
2. **Type Safety**: Full TypeScript support for all capabilities and parameters
3. **Extensibility**: Easy to add new providers via plugins
4. **Maintainability**: Centralized provider logic, easier to update
5. **Performance**: Caching with TTL and single-flight requests
6. **Developer Experience**: Rich hooks and components for common patterns

## Testing

```typescript
import { ProviderCapabilityRegistry } from '@/lib/providers';

describe('ProviderCapabilityRegistry', () => {
  it('fetches and caches capabilities', async () => {
    const registry = new ProviderCapabilityRegistry();
    await registry.fetchCapabilities();

    const capability = registry.getCapability('pixverse');
    expect(capability).toBeDefined();
    expect(capability?.operations).toContain('text_to_video');
  });

  it('respects cache TTL', async () => {
    const registry = new ProviderCapabilityRegistry({ cacheTTL: 100 });
    await registry.fetchCapabilities();

    // Should use cache
    const cap1 = registry.getCapability('pixverse');

    // Wait for cache expiry
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should refetch
    await registry.fetchCapabilities();
    const cap2 = registry.getCapability('pixverse');

    expect(cap1).toBeDefined();
    expect(cap2).toBeDefined();
  });
});
```

## Future Enhancements

1. **Cost Estimation**: Add real-time cost calculation based on parameters
2. **Capability Comparison**: UI to compare providers side-by-side
3. **Provider Recommendations**: Suggest best provider for a given operation
4. **Advanced Validation**: Cross-parameter validation rules
5. **Plugin Marketplace**: Share and discover community plugins
6. **A/B Testing**: Test different provider configurations
7. **Analytics**: Track which providers/operations are most used

## Related Documentation

- [MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md](./MERGE_MIDDLEWARE_PLUGIN_ARCHITECTURE.md) - Backend plugin architecture
- [systems/generation/GENERATION_SYSTEM.md](./systems/generation/GENERATION_SYSTEM.md) - Generation system design
- [PLUGIN_SYSTEM_ARCHITECTURE.md](./PLUGIN_SYSTEM_ARCHITECTURE.md) - Plugin system overview

---

**Implemented**: 2025-11-18
**Status**: ✅ Complete
**Replaces**: Hardcoded provider limits in `apps/main/src/utils/prompt/limits.ts`
