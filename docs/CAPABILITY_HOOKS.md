# Capability Registry Hooks

React hooks for consuming the capability registry with automatic reactivity.

## Overview

The capability registry provides simple React hooks that make it easy to access features, routes, and actions from any component. These hooks use Zustand's selector pattern to provide automatic subscriptions and re-renders when data changes.

## Available Hooks

### `useFeatures()`

Returns all registered features, automatically filtered by enabled status and sorted by priority.

```tsx
import { useFeatures } from '@/lib/capabilities';

function FeatureList() {
  const features = useFeatures();

  return (
    <div>
      {features.map(feature => (
        <div key={feature.id}>
          <h3>{feature.name}</h3>
          <p>{feature.description}</p>
        </div>
      ))}
    </div>
  );
}
```

**Reactivity**: Component re-renders when features are registered/unregistered or when feature properties change.

### `useFeatureRoutes(featureId: string)`

Returns all routes associated with a specific feature.

```tsx
import { useFeatureRoutes } from '@/lib/capabilities';

function FeatureNav({ featureId }: { featureId: string }) {
  const routes = useFeatureRoutes(featureId);

  return (
    <nav>
      {routes.map(route => (
        <a key={route.path} href={route.path}>
          {route.name}
        </a>
      ))}
    </nav>
  );
}
```

**Reactivity**: Component re-renders when routes are registered/unregistered or when route properties change.

### `useActions()`

Returns all registered actions, automatically filtered by enabled status.

```tsx
import { useActions } from '@/lib/capabilities';

function ActionButtons() {
  const actions = useActions();

  return (
    <div>
      {actions.map(action => (
        <button
          key={action.id}
          onClick={() => action.execute()}
          disabled={action.enabled && !action.enabled()}
        >
          {action.name}
        </button>
      ))}
    </div>
  );
}
```

**Reactivity**: Component re-renders when actions are registered/unregistered or when action properties change.

## Additional Hooks

The capability system also provides several bonus hooks for specific use cases:

### Feature Hooks

- `useFeature(id: string)` - Get a specific feature by ID
- `useFeaturesByCategory(category: string)` - Get features by category

### Route Hooks

- `useRoutes()` - Get all routes
- `useNavRoutes()` - Get only navigation routes (showInNav = true)

### Action Hooks

- `useAction(id: string)` - Get a specific action by ID
- `useFeatureActions(featureId: string)` - Get actions for a specific feature

### State Hooks

- `useStates()` - Get all registered states
- `useState(id: string)` - Get a specific state by ID

## How Reactivity Works

All hooks use Zustand's selector pattern, which provides automatic subscriptions:

```tsx
// Under the hood, these hooks use Zustand selectors
export function useFeatures() {
  return useCapabilityStore((s) => s.getAllFeatures());
}
```

**What this means for you:**

1. **Automatic Subscriptions**: When you use a hook, your component automatically subscribes to the capability store
2. **Efficient Re-renders**: Components only re-render when the specific data they're using changes
3. **Automatic Cleanup**: Subscriptions are automatically cleaned up when components unmount
4. **No Manual Subscribe**: You don't need to manually call subscribe/unsubscribe

## Examples

### Dynamic Feature Dashboard

```tsx
import { useFeatures, useFeatureRoutes, useFeatureActions } from '@/lib/capabilities';

function FeatureDashboard({ featureId }: { featureId: string }) {
  const features = useFeatures();
  const routes = useFeatureRoutes(featureId);
  const actions = useFeatureActions(featureId);

  const feature = features.find(f => f.id === featureId);

  if (!feature) {
    return <div>Feature not found</div>;
  }

  return (
    <div>
      <h1>{feature.name}</h1>
      <p>{feature.description}</p>

      <section>
        <h2>Routes</h2>
        {routes.map(route => (
          <a key={route.path} href={route.path}>{route.name}</a>
        ))}
      </section>

      <section>
        <h2>Actions</h2>
        {actions.map(action => (
          <button key={action.id} onClick={() => action.execute()}>
            {action.name}
          </button>
        ))}
      </section>
    </div>
  );
}
```

### Feature Category Browser

```tsx
import { useFeaturesByCategory } from '@/lib/capabilities';

function CategoryBrowser() {
  const categories = ['creation', 'editing', 'viewing', 'management', 'utility', 'game'];

  return (
    <div>
      {categories.map(category => (
        <CategorySection key={category} category={category} />
      ))}
    </div>
  );
}

function CategorySection({ category }: { category: string }) {
  const features = useFeaturesByCategory(category);

  return (
    <section>
      <h2>{category}</h2>
      <div>
        {features.map(feature => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </section>
  );
}
```

### Keyboard Shortcut Handler

```tsx
import { useActions } from '@/lib/capabilities';
import { useEffect } from 'react';

function KeyboardShortcuts() {
  const actions = useActions();

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey && 'Ctrl',
        e.shiftKey && 'Shift',
        e.altKey && 'Alt',
        e.key
      ].filter(Boolean).join('+');

      const action = actions.find(a => a.shortcut === key);
      if (action && (!action.enabled || action.enabled())) {
        e.preventDefault();
        action.execute();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [actions]);

  return null;
}
```

## Performance Considerations

### Selector Specificity

Zustand only re-renders components when the selected data changes. This means:

```tsx
// ✅ Good - Only re-renders when features change
const features = useFeatures();

// ✅ Good - Only re-renders when routes for this specific feature change
const routes = useFeatureRoutes('scene-builder');

// ❌ Avoid - Re-renders on any store change
const store = useCapabilityStore();
```

### Memoization

For computed values, use React's `useMemo`:

```tsx
const features = useFeatures();

// Memoize filtered/sorted results
const sortedFeatures = useMemo(() =>
  features.filter(f => f.category === 'game').sort((a, b) => a.name.localeCompare(b.name)),
  [features]
);
```

## Integration with Plugins

Plugins can use these hooks to dynamically integrate with app capabilities:

```tsx
// In your plugin component
import { useFeatures, useActions } from '@/lib/capabilities';

export function MyPluginComponent() {
  const features = useFeatures();
  const actions = useActions();

  // Plugin can discover and use app features dynamically
  const sceneBuilderFeature = features.find(f => f.id === 'scene-builder');
  const createSceneAction = actions.find(a => a.id === 'create-scene');

  return (
    <div>
      {sceneBuilderFeature && (
        <button onClick={() => createSceneAction?.execute()}>
          Create Scene
        </button>
      )}
    </div>
  );
}
```

## Testing

Hooks can be easily tested using React Testing Library:

```tsx
import { renderHook } from '@testing-library/react';
import { useFeatures } from '@/lib/capabilities';
import { useCapabilityStore } from '@/lib/capabilities';

test('useFeatures returns all features', () => {
  // Register test features
  const store = useCapabilityStore.getState();
  store.registerFeature({
    id: 'test-feature',
    name: 'Test Feature',
    description: 'A test feature',
    category: 'utility'
  });

  // Test hook
  const { result } = renderHook(() => useFeatures());

  expect(result.current).toHaveLength(1);
  expect(result.current[0].id).toBe('test-feature');
});
```

## Summary

The capability hooks provide:

- ✅ Simple, intuitive API
- ✅ Automatic reactivity via Zustand
- ✅ Efficient re-renders (only when relevant data changes)
- ✅ Automatic subscription management
- ✅ Type-safe with TypeScript
- ✅ Easy to test
- ✅ Minimal boilerplate

Use these hooks to build dynamic UIs that automatically adapt to available features, routes, and actions!
