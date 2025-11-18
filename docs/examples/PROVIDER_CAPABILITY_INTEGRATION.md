# Provider Capability Registry - Integration Examples

This document provides practical examples of integrating the Provider Capability Registry into your components.

## Quick Start

### 1. Basic Setup

The plugin system is automatically initialized in `main.tsx`:

```tsx
import './lib/providers/plugins' // Register provider generation UI plugins
```

This auto-registers all provider-specific plugins (Pixverse, Sora, etc.).

### 2. Using in a Component

#### Example: Simple Prompt Editor with Dynamic Limits

```tsx
import { usePromptLimit } from '@/lib/providers';
import { PromptInput } from '@pixsim7/ui';

function PromptEditor({ providerId }: { providerId?: string }) {
  const maxChars = usePromptLimit(providerId);
  const [prompt, setPrompt] = useState('');

  return (
    <PromptInput
      value={prompt}
      onChange={setPrompt}
      maxChars={maxChars}
      placeholder={`Max ${maxChars} characters`}
    />
  );
}
```

#### Example: Provider Selection with Capabilities

```tsx
import { useProviderCapabilities } from '@/lib/providers';

function ProviderSelector({ onSelect }: Props) {
  const { capabilities, loading, error } = useProviderCapabilities();

  if (loading) return <div>Loading providers...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <select onChange={(e) => onSelect(e.target.value)}>
      {capabilities.map(cap => (
        <option key={cap.provider_id} value={cap.provider_id}>
          {cap.name} - {cap.operations.length} operations
        </option>
      ))}
    </select>
  );
}
```

#### Example: Operation Selector Based on Provider

```tsx
import { useSupportedOperations } from '@/lib/providers';

function OperationSelector({ providerId, onSelect }: Props) {
  const operations = useSupportedOperations(providerId);

  return (
    <select onChange={(e) => onSelect(e.target.value)}>
      {operations.map(op => (
        <option key={op} value={op}>{op}</option>
      ))}
    </select>
  );
}
```

#### Example: Dynamic Form with Provider Plugins

```tsx
import { useOperationSpec } from '@/lib/providers';
import { GenerationPluginRenderer } from '@/lib/providers';

function GenerationForm({ providerId, operation }: Props) {
  const opSpec = useOperationSpec(providerId, operation);
  const [values, setValues] = useState({});

  const handleChange = (name: string, value: any) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form>
      {/* Standard operation parameters */}
      {opSpec?.parameters.map(param => (
        <FormField key={param.name} param={param} onChange={handleChange} />
      ))}

      {/* Provider-specific plugin controls */}
      <GenerationPluginRenderer
        providerId={providerId}
        operationType={operation}
        values={values}
        onChange={handleChange}
        disabled={false}
      />
    </form>
  );
}
```

## Advanced Examples

### Example: Feature-Based UI

```tsx
import { useProviderFeature } from '@/lib/providers';

function ProviderFeatures({ providerId }: { providerId: string }) {
  const canUpload = useProviderFeature(providerId, 'asset_upload');
  const hasEmbedded = useProviderFeature(providerId, 'embedded_assets');

  return (
    <div>
      {canUpload && <UploadButton providerId={providerId} />}
      {hasEmbedded && <EmbeddedAssetsPanel providerId={providerId} />}
    </div>
  );
}
```

### Example: Cost Estimation Display

```tsx
import { useCostHints } from '@/lib/providers';

function CostEstimate({ providerId, duration }: Props) {
  const costHints = useCostHints(providerId);

  if (!costHints?.per_second) return null;

  const estimate = costHints.per_second * duration;

  return (
    <div className="cost-estimate">
      Estimated cost: {costHints.currency || '$'}{estimate.toFixed(2)}
      {costHints.estimation_note && (
        <div className="note">{costHints.estimation_note}</div>
      )}
    </div>
  );
}
```

### Example: Limits Display

```tsx
import { useProviderLimits } from '@/lib/providers';

function ProviderLimitsInfo({ providerId }: { providerId: string }) {
  const limits = useProviderLimits(providerId);

  if (!limits) return <div>No limits available</div>;

  return (
    <div className="limits-info">
      <h3>Provider Limits</h3>
      {limits.prompt_max_chars && (
        <div>Max prompt: {limits.prompt_max_chars} chars</div>
      )}
      {limits.max_duration && (
        <div>Max duration: {limits.max_duration}s</div>
      )}
      {limits.max_resolution && (
        <div>
          Max resolution: {limits.max_resolution.width}x{limits.max_resolution.height}
        </div>
      )}
      {limits.max_variants && (
        <div>Max variants: {limits.max_variants}</div>
      )}
    </div>
  );
}
```

### Example: Quality & Aspect Ratio Selectors

```tsx
import { useQualityPresets, useAspectRatios } from '@/lib/providers';

function MediaSettings({ providerId, values, onChange }: Props) {
  const qualityPresets = useQualityPresets(providerId);
  const aspectRatios = useAspectRatios(providerId);

  return (
    <div>
      {qualityPresets.length > 0 && (
        <div>
          <label>Quality</label>
          <select
            value={values.quality}
            onChange={(e) => onChange('quality', e.target.value)}
          >
            {qualityPresets.map(preset => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
        </div>
      )}

      {aspectRatios.length > 0 && (
        <div>
          <label>Aspect Ratio</label>
          <select
            value={values.aspect_ratio}
            onChange={(e) => onChange('aspect_ratio', e.target.value)}
          >
            {aspectRatios.map(ratio => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

## Creating Custom Plugins

### Example: Custom Provider Plugin

```tsx
// File: src/lib/providers/plugins/CustomProviderPlugin.tsx

import { defineGenerationUIPlugin } from '@/lib/providers';
import type { GenerationUIPluginProps } from '@/lib/providers';

function CustomProviderControls({
  providerId,
  operationType,
  values,
  onChange,
  disabled,
}: GenerationUIPluginProps) {
  if (providerId !== 'custom-provider') return null;

  return (
    <div className="custom-provider-controls">
      <h4>Custom Provider Settings</h4>

      {/* Custom control 1 */}
      <div>
        <label>Custom Setting</label>
        <input
          type="text"
          value={values.custom_setting || ''}
          onChange={(e) => onChange('custom_setting', e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Operation-specific controls */}
      {operationType === 'text_to_video' && (
        <div>
          <label>Video Style</label>
          <select
            value={values.video_style || 'cinematic'}
            onChange={(e) => onChange('video_style', e.target.value)}
            disabled={disabled}
          >
            <option value="cinematic">Cinematic</option>
            <option value="documentary">Documentary</option>
            <option value="animation">Animation</option>
          </select>
        </div>
      )}
    </div>
  );
}

export const customProviderPlugin = defineGenerationUIPlugin({
  id: 'custom-provider-controls',
  providerId: 'custom-provider',
  operations: ['text_to_video', 'image_to_video'], // Optional
  component: CustomProviderControls,
  priority: 10,
  validate: (values) => {
    const errors: Record<string, string> = {};

    if (values.custom_setting && values.custom_setting.length > 100) {
      errors.custom_setting = 'Must be 100 characters or less';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  },
  metadata: {
    name: 'Custom Provider Controls',
    description: 'Advanced controls for custom provider',
    version: '1.0.0',
  },
});
```

### Registering the Custom Plugin

```tsx
// File: src/lib/providers/plugins/index.ts

import { generationUIPluginRegistry } from '../generationPlugins';
import { pixversePlugin } from './PixversePlugin';
import { soraPlugin } from './SoraPlugin';
import { customProviderPlugin } from './CustomProviderPlugin';

export function registerProviderPlugins() {
  generationUIPluginRegistry.register(pixversePlugin);
  generationUIPluginRegistry.register(soraPlugin);
  generationUIPluginRegistry.register(customProviderPlugin);
}

registerProviderPlugins();
```

## Common Patterns

### Pattern: Conditional Rendering Based on Capabilities

```tsx
function ConditionalFeature({ providerId }: { providerId: string }) {
  const { capability } = useProviderCapability(providerId);

  // Don't render if provider doesn't support text_to_video
  if (!capability?.operations.includes('text_to_video')) {
    return null;
  }

  return <TextToVideoPanel />;
}
```

### Pattern: Fallback to Default Values

```tsx
function PromptEditor({ providerId }: { providerId?: string }) {
  const maxChars = usePromptLimit(providerId);
  // maxChars will be 800 (default) if providerId is undefined or provider not found

  return <textarea maxLength={maxChars} />;
}
```

### Pattern: Loading States

```tsx
function ProviderDependentUI({ providerId }: { providerId: string }) {
  const { capability, loading, error } = useProviderCapability(providerId);

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!capability) {
    return <div>Provider not found</div>;
  }

  return <ProviderUI capability={capability} />;
}
```

### Pattern: Dynamic Parameter Validation

```tsx
import { usePluginValidation } from '@/lib/providers';

function ValidatedForm({ providerId, operation, values }: Props) {
  const validation = usePluginValidation(providerId, operation, values);

  return (
    <div>
      {/* Form fields */}

      {/* Validation errors */}
      {validation.errors && (
        <div className="errors">
          {Object.entries(validation.errors).map(([field, error]) => (
            <div key={field} className="error">
              <strong>{field}:</strong> {error}
            </div>
          ))}
        </div>
      )}

      {/* Validation warnings */}
      {validation.warnings && (
        <div className="warnings">
          {Object.entries(validation.warnings).map(([field, warning]) => (
            <div key={field} className="warning">
              <strong>{field}:</strong> {warning}
            </div>
          ))}
        </div>
      )}

      <button disabled={!validation.valid}>Submit</button>
    </div>
  );
}
```

## Testing

### Example: Mock Provider Capability

```tsx
import { ProviderCapabilityRegistry } from '@/lib/providers';

describe('MyComponent', () => {
  it('renders with provider capabilities', async () => {
    const registry = new ProviderCapabilityRegistry();

    // Mock fetch
    jest.spyOn(registry, 'fetchCapabilities').mockResolvedValue();
    jest.spyOn(registry, 'getCapability').mockReturnValue({
      provider_id: 'test-provider',
      operations: ['text_to_video'],
      features: { embedded_assets: false, asset_upload: false },
      operation_specs: {},
    });

    const { getByText } = render(<MyComponent providerId="test-provider" />);
    expect(getByText('text_to_video')).toBeInTheDocument();
  });
});
```

## Performance Tips

1. **Use selective hooks**: Only use the hooks you need instead of fetching full capability
   ```tsx
   // Good: Specific hook
   const maxChars = usePromptLimit(providerId);

   // Less efficient: Full capability fetch
   const { capability } = useProviderCapability(providerId);
   const maxChars = capability?.limits?.prompt_max_chars || 800;
   ```

2. **Avoid unnecessary re-renders**: The hooks use `useMemo` internally, but be mindful of dependency arrays

3. **Cache is your friend**: The registry caches for 5 minutes by default, so repeated calls are cheap

4. **Preload capabilities**: If you know you'll need capabilities, preload them:
   ```tsx
   useEffect(() => {
     providerCapabilityRegistry.fetchCapabilities();
   }, []);
   ```

## Troubleshooting

### Issue: Plugins not showing up

**Solution**: Ensure plugins are imported in `main.tsx`:
```tsx
import './lib/providers/plugins'
```

### Issue: Capabilities not loading

**Solution**: Check that:
1. Backend `/providers` endpoint is accessible
2. User is authenticated
3. Check browser console for fetch errors

### Issue: Stale capability data

**Solution**: Manually invalidate cache:
```tsx
import { providerCapabilityRegistry } from '@/lib/providers';

providerCapabilityRegistry.invalidate();
await providerCapabilityRegistry.fetchCapabilities();
```

## See Also

- [PROVIDER_CAPABILITY_REGISTRY.md](../PROVIDER_CAPABILITY_REGISTRY.md) - Full documentation
- [DYNAMIC_GENERATION_FOUNDATION.md](../DYNAMIC_GENERATION_FOUNDATION.md) - Generation system design
