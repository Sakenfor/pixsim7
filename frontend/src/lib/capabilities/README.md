# Capability Registry

## Quick Start

The capability registry provides React hooks for accessing app features, routes, and actions.

### Basic Usage

```tsx
import { useFeatures, useFeatureRoutes, useActions } from '@/lib/capabilities';

function MyComponent() {
  // Get all features (auto-subscribes to changes)
  const features = useFeatures();

  // Get routes for a specific feature (auto-subscribes to changes)
  const routes = useFeatureRoutes('scene-builder');

  // Get all actions (auto-subscribes to changes)
  const actions = useActions();

  return (
    <div>
      {features.map(f => <div key={f.id}>{f.name}</div>)}
      {routes.map(r => <a key={r.path} href={r.path}>{r.name}</a>)}
      {actions.map(a => <button key={a.id} onClick={() => a.execute()}>{a.name}</button>)}
    </div>
  );
}
```

### Key Hooks

- **`useFeatures()`** - Returns all features, automatically filtered by enabled status and sorted by priority
- **`useFeatureRoutes(featureId)`** - Returns all routes for a specific feature
- **`useActions()`** - Returns all actions, automatically filtered by enabled status

### Reactivity

All hooks use Zustand's selector pattern:
- ✅ Automatic subscriptions - no manual subscribe/unsubscribe needed
- ✅ Efficient re-renders - only when your data changes
- ✅ Automatic cleanup - when components unmount

### Additional Hooks

See `docs/CAPABILITY_HOOKS.md` for:
- `useFeature(id)` - Get specific feature
- `useFeaturesByCategory(category)` - Get features by category
- `useRoutes()` - Get all routes
- `useNavRoutes()` - Get navigation routes
- `useAction(id)` - Get specific action
- `useFeatureActions(featureId)` - Get actions for feature
- `useStates()` - Get all states
- `useState(id)` - Get specific state

## Architecture

```
index.ts              - Main store and hooks
routeConstants.ts     - Route ID constants
pluginAdapter.ts      - Plugin capability adapter
securityFilter.ts     - Security filtering for plugins
```

## Examples

See:
- `components/capabilities/CapabilityHooksDemo.tsx` - Usage examples
- `components/capabilities/CapabilityAutocomplete.tsx` - Real-world usage
- `docs/CAPABILITY_HOOKS.md` - Comprehensive documentation
