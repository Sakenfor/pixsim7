/**
 * Capability Hooks Demo
 *
 * Demonstrates usage of the capability registry React hooks.
 * These hooks provide easy access to features, routes, and actions
 * with automatic reactivity via Zustand.
 */

import { useFeatures, useFeatureRoutes, useActions } from '@lib/capabilities';
import { Icon } from '@lib/icons';

/**
 * Example component showing how to use capability hooks
 */
export function CapabilityHooksDemo() {
  // Get all features - automatically subscribes to changes
  const features = useFeatures();

  // Get all actions - automatically subscribes to changes
  const actions = useActions();

  // Get routes for a specific feature
  const sceneBuilderRoutes = useFeatureRoutes('scene-builder');

  return (
    <div className="p-4 space-y-6">
      <section>
        <h2 className="text-lg font-semibold mb-3">Features ({features.length})</h2>
        <div className="space-y-2">
          {features.map((feature) => (
            <div key={feature.id} className="p-3 bg-gray-100 rounded">
              <div className="flex items-center gap-2">
                {feature.icon && <Icon name={feature.icon} size={16} />}
                <span className="font-medium">{feature.name}</span>
                <span className="text-xs text-gray-500">{feature.category}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Actions ({actions.length})</h2>
        <div className="space-y-2">
          {actions.map((action) => (
            <div key={action.id} className="p-3 bg-blue-50 rounded">
              <div className="flex items-center gap-2">
                {action.icon && <Icon name={action.icon} size={16} />}
                <span className="font-medium">{action.name}</span>
                {action.shortcut && (
                  <kbd className="text-xs bg-gray-200 px-2 py-1 rounded">
                    {action.shortcut}
                  </kbd>
                )}
              </div>
              {action.description && (
                <p className="text-sm text-gray-600 mt-1">{action.description}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Scene Builder Routes ({sceneBuilderRoutes.length})
        </h2>
        <div className="space-y-2">
          {sceneBuilderRoutes.map((route) => (
            <div key={route.path} className="p-3 bg-green-50 rounded">
              <div className="flex items-center gap-2">
                {route.icon && <Icon name={route.icon} size={16} />}
                <span className="font-medium">{route.name}</span>
                <code className="text-xs bg-gray-200 px-2 py-1 rounded">
                  {route.path}
                </code>
              </div>
              {route.description && (
                <p className="text-sm text-gray-600 mt-1">{route.description}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Example: Using hooks in a custom component
 */
export function FeatureSelector({ onSelect }: { onSelect: (featureId: string) => void }) {
  const features = useFeatures();

  return (
    <select onChange={(e) => onSelect(e.target.value)} className="p-2 border rounded">
      <option value="">Select a feature...</option>
      {features.map((feature) => (
        <option key={feature.id} value={feature.id}>
          {feature.icon} {feature.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Example: Using feature routes dynamically
 */
export function FeatureNavigator({ featureId }: { featureId: string }) {
  const routes = useFeatureRoutes(featureId);

  if (routes.length === 0) {
    return <p className="text-gray-500">No routes available for this feature.</p>;
  }

  return (
    <nav className="space-y-1">
      {routes.map((route) => (
        <a
          key={route.path}
          href={route.path}
          className="block p-2 hover:bg-gray-100 rounded"
        >
          {route.icon && <Icon name={route.icon} size={16} className="mr-2" />}
          {route.name}
        </a>
      ))}
    </nav>
  );
}

/**
 * Example: Action executor component
 */
export function QuickActions() {
  const actions = useActions();

  const handleExecute = async (actionId: string) => {
    try {
      const action = actions.find(a => a.id === actionId);
      if (action) {
        await action.execute();
      }
    } catch (error) {
      console.error('Failed to execute action:', error);
    }
  };

  return (
    <div className="flex gap-2">
      {actions.slice(0, 5).map((action) => (
        <button
          key={action.id}
          onClick={() => handleExecute(action.id)}
          disabled={action.enabled && !action.enabled()}
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {action.icon && <Icon name={action.icon} size={14} className="mr-1" />}
          {action.name}
        </button>
      ))}
    </div>
  );
}
