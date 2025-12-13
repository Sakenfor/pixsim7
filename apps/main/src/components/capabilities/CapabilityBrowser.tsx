/**
 * Capability Browser
 *
 * Browse all available app capabilities for plugin development.
 * Shows features, actions, routes, and state that plugins can integrate with.
 */

import { useState } from 'react';
import {
  useFeatures,
  useActions,
  useRoutes,
  useStates,
  type FeatureCapability,
  type ActionCapability,
  type RouteCapability,
  type StateCapability,
} from '@lib/capabilities';

type CapabilityView = 'features' | 'actions' | 'routes' | 'states';

export function CapabilityBrowser() {
  const [view, setView] = useState<CapabilityView>('features');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  const features = useFeatures();
  const actions = useActions();
  const routes = useRoutes();
  const states = useStates();

  // Filter by search query
  const filteredFeatures = features.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredActions = actions.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRoutes = routes.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStates = states.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get feature-specific items when a feature is selected
  const selectedFeatureActions = selectedFeatureId
    ? actions.filter((a) => a.featureId === selectedFeatureId)
    : [];
  const selectedFeatureRoutes = selectedFeatureId
    ? routes.filter((r) => r.featureId === selectedFeatureId)
    : [];

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Available Capabilities
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Discover features, actions, routes, and state your plugin can integrate with
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search capabilities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full mt-3 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* View selector */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setView('features')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'features'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Features ({features.length})
          </button>
          <button
            onClick={() => setView('actions')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'actions'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Actions ({actions.length})
          </button>
          <button
            onClick={() => setView('routes')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'routes'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            Routes ({routes.length})
          </button>
          <button
            onClick={() => setView('states')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'states'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            }`}
          >
            State ({states.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {view === 'features' && (
          <FeaturesView
            features={filteredFeatures}
            selectedFeatureId={selectedFeatureId}
            onSelectFeature={setSelectedFeatureId}
            selectedFeatureActions={selectedFeatureActions}
            selectedFeatureRoutes={selectedFeatureRoutes}
          />
        )}
        {view === 'actions' && <ActionsView actions={filteredActions} />}
        {view === 'routes' && <RoutesView routes={filteredRoutes} />}
        {view === 'states' && <StatesView states={filteredStates} />}
      </div>
    </div>
  );
}

// ============================================================================
// Features View
// ============================================================================

interface FeaturesViewProps {
  features: FeatureCapability[];
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  selectedFeatureActions: ActionCapability[];
  selectedFeatureRoutes: RouteCapability[];
}

function FeaturesView({
  features,
  selectedFeatureId,
  onSelectFeature,
  selectedFeatureActions,
  selectedFeatureRoutes,
}: FeaturesViewProps) {
  const selectedFeature = features.find((f) => f.id === selectedFeatureId);

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Features list */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase">
          Features ({features.length})
        </h3>
        {features.map((feature) => (
          <div
            key={feature.id}
            onClick={() =>
              onSelectFeature(selectedFeatureId === feature.id ? null : feature.id)
            }
            className={`p-4 rounded-lg border cursor-pointer transition-colors ${
              selectedFeatureId === feature.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{feature.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  {feature.name}
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  ID: <code className="bg-neutral-100 dark:bg-neutral-700 px-1 rounded">{feature.id}</code>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                  {feature.description}
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                    {feature.category}
                  </span>
                  {feature.priority && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      Priority: {feature.priority}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Feature details */}
      <div>
        {selectedFeature ? (
          <div className="sticky top-0">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase mb-3">
              {selectedFeature.icon} {selectedFeature.name}
            </h3>

            {/* Routes */}
            {selectedFeatureRoutes.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Routes ({selectedFeatureRoutes.length})
                </h4>
                <div className="space-y-2">
                  {selectedFeatureRoutes.map((route) => (
                    <div
                      key={route.path}
                      className="p-3 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2">
                        {route.icon && <span>{route.icon}</span>}
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                          {route.path}
                        </code>
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        {route.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {selectedFeatureActions.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Actions ({selectedFeatureActions.length})
                </h4>
                <div className="space-y-2">
                  {selectedFeatureActions.map((action) => (
                    <div
                      key={action.id}
                      className="p-3 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {action.icon && <span>{action.icon}</span>}
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {action.name}
                          </span>
                        </div>
                        {action.shortcut && (
                          <kbd className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600">
                            {action.shortcut}
                          </kbd>
                        )}
                      </div>
                      <code className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 block">
                        {action.id}
                      </code>
                      {action.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                          {action.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Usage hint */}
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                💡 Plugin Integration
              </div>
              <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <p>To consume this feature in your plugin:</p>
                <code className="block bg-blue-100 dark:bg-blue-900/40 p-2 rounded mt-2">
                  consumesFeatures: ['{selectedFeature.id}']
                </code>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-neutral-500 dark:text-neutral-400 mt-20">
            Select a feature to see its routes and actions
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Actions View
// ============================================================================

function ActionsView({ actions }: { actions: ActionCapability[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase">
        All Actions ({actions.length})
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <div
            key={action.id}
            className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                {action.icon && <span className="text-xl">{action.icon}</span>}
                <div className="flex-1">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {action.name}
                  </div>
                  <code className="text-xs text-neutral-600 dark:text-neutral-400 block mt-1">
                    {action.id}
                  </code>
                </div>
              </div>
              {action.shortcut && (
                <kbd className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 whitespace-nowrap">
                  {action.shortcut}
                </kbd>
              )}
            </div>
            {action.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                {action.description}
              </p>
            )}
            {action.featureId && (
              <div className="mt-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  {action.featureId}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Routes View
// ============================================================================

function RoutesView({ routes }: { routes: RouteCapability[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase">
        All Routes ({routes.length})
      </h3>
      <div className="space-y-3">
        {routes.map((route) => (
          <div
            key={route.path}
            className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {route.icon && <span className="text-xl">{route.icon}</span>}
                  <code className="text-sm font-mono font-medium text-blue-600 dark:text-blue-400">
                    {route.path}
                  </code>
                </div>
                <div className="text-neutral-900 dark:text-neutral-100 mt-2">
                  {route.name}
                </div>
                {route.description && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                    {route.description}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  {route.protected && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                      Protected
                    </span>
                  )}
                  {route.showInNav && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                      In Nav
                    </span>
                  )}
                  {route.featureId && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {route.featureId}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// States View
// ============================================================================

function StatesView({ states }: { states: StateCapability[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase">
        Available State ({states.length})
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {states.map((state) => (
          <div
            key={state.id}
            className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              {state.name}
            </div>
            <code className="text-xs text-neutral-600 dark:text-neutral-400 block mt-1">
              {state.id}
            </code>
            <div className="flex gap-2 mt-2">
              {state.readonly && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  Read-only
                </span>
              )}
              {state.subscribe && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                  Reactive
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
