import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type FeatureCapability,
  type RouteCapability,
  type ActionCapability,
  useCapabilityStore,
} from '../../lib/capabilities';

interface CapabilityTestingPanelProps {
  features: FeatureCapability[];
  routes: RouteCapability[];
  actions: ActionCapability[];
}

/**
 * CapabilityTestingPanel - Dev-only panel for testing capabilities
 *
 * Features:
 * - Quick navigation to routes
 * - Action invocation with minimal input
 * - Feature state inspection
 */
export function CapabilityTestingPanel({
  features,
  routes,
  actions,
}: CapabilityTestingPanelProps) {
  const [activeSection, setActiveSection] = useState<'routes' | 'actions' | 'state'>('routes');
  const navigate = useNavigate();
  const store = useCapabilityStore();

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleInvokeAction = (action: ActionCapability) => {
    try {
      if (action.handler) {
        action.handler();
        console.log(`✅ Action invoked: ${action.id}`);
      } else {
        console.warn(`⚠️ Action ${action.id} has no handler`);
      }
    } catch (error) {
      console.error(`❌ Error invoking action ${action.id}:`, error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Section Tabs */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSection('routes')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === 'routes'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Routes ({routes.length})
          </button>
          <button
            onClick={() => setActiveSection('actions')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === 'actions'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            Actions ({actions.length})
          </button>
          <button
            onClick={() => setActiveSection('state')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === 'state'
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            State Inspection
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeSection === 'routes' && (
          <RouteTester routes={routes} onNavigate={handleNavigate} />
        )}

        {activeSection === 'actions' && (
          <ActionTester actions={actions} onInvokeAction={handleInvokeAction} />
        )}

        {activeSection === 'state' && (
          <StateInspector store={store} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Route Tester
// ============================================================================

interface RouteTesterProps {
  routes: RouteCapability[];
  onNavigate: (path: string) => void;
}

function RouteTester({ routes, onNavigate }: RouteTesterProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRoutes = routes.filter(route => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      route.path.toLowerCase().includes(query) ||
      route.name.toLowerCase().includes(query) ||
      route.featureId.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search routes..."
        className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Route List */}
      <div className="space-y-2">
        {filteredRoutes.map((route, index) => (
          <div
            key={`${route.featureId}-${route.path}-${index}`}
            className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {route.icon && <span className="text-lg">{route.icon}</span>}
                <div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {route.name}
                  </div>
                  <code className="text-xs font-mono text-blue-600 dark:text-blue-400">
                    {route.path}
                  </code>
                </div>
              </div>
              <button
                onClick={() => onNavigate(route.path)}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
              >
                Navigate →
              </button>
            </div>
            {route.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                {route.description}
              </p>
            )}
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded">
                {route.featureId}
              </span>
              {route.protected && (
                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                  protected
                </span>
              )}
              {route.showInNav && (
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                  in nav
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredRoutes.length === 0 && (
        <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          No routes found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Action Tester
// ============================================================================

interface ActionTesterProps {
  actions: ActionCapability[];
  onInvokeAction: (action: ActionCapability) => void;
}

function ActionTester({ actions, onInvokeAction }: ActionTesterProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredActions = actions.filter(action => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      action.id.toLowerCase().includes(query) ||
      action.name.toLowerCase().includes(query) ||
      (action.description?.toLowerCase().includes(query) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search actions..."
        className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Action List */}
      <div className="space-y-2">
        {filteredActions.map(action => (
          <div
            key={action.id}
            className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {action.icon && <span className="text-lg">{action.icon}</span>}
                <div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {action.name}
                  </div>
                  <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                    {action.id}
                  </code>
                </div>
              </div>
              <div className="flex gap-2">
                {action.shortcut && (
                  <kbd className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded font-mono">
                    {action.shortcut}
                  </kbd>
                )}
                <button
                  onClick={() => onInvokeAction(action)}
                  disabled={!action.handler}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    action.handler
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  {action.handler ? 'Invoke ⚡' : 'No handler'}
                </button>
              </div>
            </div>
            {action.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                {action.description}
              </p>
            )}
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded">
                {action.featureId}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredActions.length === 0 && (
        <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          No actions found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// State Inspector
// ============================================================================

interface StateInspectorProps {
  store: ReturnType<typeof useCapabilityStore>;
}

function StateInspector({ store }: StateInspectorProps) {
  const stateValues = store.getState().state;
  const stateEntries = Object.entries(stateValues);

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
        <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
          State Inspection
        </div>
        <div className="text-xs text-blue-700 dark:text-blue-300">
          {stateEntries.length} registered state values
        </div>
      </div>

      {stateEntries.length === 0 && (
        <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          No state values registered
        </div>
      )}

      <div className="space-y-2">
        {stateEntries.map(([id, value]) => (
          <div
            key={id}
            className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
          >
            <div className="flex items-center justify-between mb-2">
              <code className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                {id}
              </code>
              <span className="text-xs px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 rounded">
                {typeof value}
              </span>
            </div>
            <div className="bg-neutral-100 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700 overflow-x-auto">
              <pre className="text-xs text-neutral-700 dark:text-neutral-300">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
