/**
 * Advanced Capability Hooks Demo
 *
 * Demonstrates all advanced capability hooks including:
 * - useStateValue: Reactive state consumption
 * - useExecuteAction: Action execution with loading/error states
 * - useSearchCapabilities: Search across all capabilities
 * - useCommandPalette: Command palette integration
 * - useCapabilityPermission: Permission checking
 * - useRegisterCapabilities: Batch registration
 */

import { useState } from 'react';
import {
  useStateValue,
  useExecuteAction,
  useSearchCapabilities,
  useCommandPalette,
  useCapabilityPermission,
  useAllowedFeatures,
  useAllowedActions,
  useRegisterCapabilities,
} from '@lib/capabilities';

/**
 * Example 1: Reactive State Value
 */
export function StateValueExample() {
  // Automatically subscribes to state changes
  const sessionState = useStateValue<any>('session-state');

  return (
    <div className="p-4 bg-gray-100 rounded">
      <h3 className="font-semibold mb-2">Reactive State Value</h3>
      <pre className="text-sm bg-white p-2 rounded">
        {JSON.stringify(sessionState, null, 2) || 'No session state'}
      </pre>
    </div>
  );
}

/**
 * Example 2: Action Execution with Loading/Error
 */
export function ActionExecutionExample() {
  const { execute, loading, error, reset, isEnabled } = useExecuteAction('create-scene');

  return (
    <div className="p-4 bg-blue-50 rounded">
      <h3 className="font-semibold mb-2">Action Execution</h3>

      <button
        onClick={() => execute()}
        disabled={loading || !isEnabled}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Creating Scene...' : 'Create Scene'}
      </button>

      {error && (
        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
          Error: {error.message}
          <button onClick={reset} className="ml-2 underline">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Example 3: Capability Search
 */
export function CapabilitySearchExample() {
  const [query, setQuery] = useState('');
  const results = useSearchCapabilities(query);

  return (
    <div className="p-4 bg-green-50 rounded">
      <h3 className="font-semibold mb-2">Capability Search</h3>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search capabilities..."
        className="w-full p-2 border rounded mb-2"
      />

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {results.map((result) => (
          <div key={result.id} className="p-2 bg-white rounded text-sm">
            <span className="font-medium">{result.icon} {result.name}</span>
            <span className="ml-2 text-xs text-gray-500">{result.type}</span>
            {result.description && (
              <p className="text-xs text-gray-600 mt-1">{result.description}</p>
            )}
          </div>
        ))}
        {query && results.length === 0 && (
          <p className="text-gray-500 text-sm">No results found</p>
        )}
      </div>
    </div>
  );
}

/**
 * Example 4: Command Palette
 */
export function CommandPaletteExample() {
  const [query, setQuery] = useState('');
  const { commands, executeCommand } = useCommandPalette(query);

  const handleExecute = async (commandId: string) => {
    try {
      await executeCommand(commandId);
      setQuery('');
    } catch (error) {
      console.error('Command execution failed:', error);
    }
  };

  return (
    <div className="p-4 bg-purple-50 rounded">
      <h3 className="font-semibold mb-2">Command Palette</h3>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a command..."
        className="w-full p-2 border rounded mb-2"
      />

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {commands.map((command) => (
          <button
            key={command.id}
            onClick={() => handleExecute(command.id)}
            disabled={!command.enabled}
            className="w-full text-left p-2 bg-white rounded hover:bg-purple-100 disabled:opacity-50"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {command.icon} {command.name}
              </span>
              {command.shortcut && (
                <kbd className="text-xs bg-gray-200 px-2 py-1 rounded">
                  {command.shortcut}
                </kbd>
              )}
            </div>
            {command.description && (
              <p className="text-xs text-gray-600 mt-1">{command.description}</p>
            )}
            {command.category && (
              <span className="text-xs text-gray-500">{command.category}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Example 5: Permission Checking
 */
export function PermissionExample() {
  const [userPermissions] = useState(['read:session', 'read:world', 'ui:overlay']);

  const canUseSceneBuilder = useCapabilityPermission('scene-builder', userPermissions);
  const allowedFeatures = useAllowedFeatures(userPermissions);
  const allowedActions = useAllowedActions(userPermissions);

  return (
    <div className="p-4 bg-yellow-50 rounded">
      <h3 className="font-semibold mb-2">Permission Checking</h3>

      <div className="space-y-2">
        <div className="text-sm">
          <span className="font-medium">Scene Builder Access:</span>{' '}
          {canUseSceneBuilder ? (
            <span className="text-green-600">✓ Allowed</span>
          ) : (
            <span className="text-red-600">✗ Denied</span>
          )}
        </div>

        <div className="text-sm">
          <span className="font-medium">Allowed Features:</span> {allowedFeatures.length}
        </div>

        <div className="text-sm">
          <span className="font-medium">Allowed Actions:</span> {allowedActions.length}
        </div>

        <div className="mt-2 p-2 bg-white rounded">
          <p className="text-xs font-medium mb-1">Your Permissions:</p>
          <div className="flex flex-wrap gap-1">
            {userPermissions.map(perm => (
              <span key={perm} className="text-xs bg-blue-100 px-2 py-1 rounded">
                {perm}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Example 6: Batch Registration
 */
export function BatchRegistrationExample() {
  // This hook automatically registers capabilities when component mounts
  // and unregisters them when component unmounts
  useRegisterCapabilities({
    features: [
      {
        id: 'demo-feature',
        name: 'Demo Feature',
        description: 'A dynamically registered feature',
        category: 'utility',
        icon: '🎯',
      },
    ],
    actions: [
      {
        id: 'demo-action',
        name: 'Demo Action',
        description: 'A dynamically registered action',
        icon: '⚡',
        execute: () => {
          console.log('Demo action executed!');
        },
        featureId: 'demo-feature',
      },
    ],
  }, []); // Empty deps = register once on mount

  return (
    <div className="p-4 bg-pink-50 rounded">
      <h3 className="font-semibold mb-2">Batch Registration</h3>
      <p className="text-sm">
        This component automatically registered a feature and action on mount.
        They will be unregistered when this component unmounts.
      </p>
      <p className="text-xs text-gray-600 mt-2">
        Check the capability browser to see the "Demo Feature" and "Demo Action".
      </p>
    </div>
  );
}

/**
 * Complete Demo Component
 */
export function AdvancedHooksDemo() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Advanced Capability Hooks Demo</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StateValueExample />
        <ActionExecutionExample />
        <CapabilitySearchExample />
        <CommandPaletteExample />
        <PermissionExample />
        <BatchRegistrationExample />
      </div>

      <div className="p-4 bg-gray-50 rounded">
        <h3 className="font-semibold mb-2">About These Hooks</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li><strong>useStateValue:</strong> Automatically subscribes to state changes</li>
          <li><strong>useExecuteAction:</strong> Manages loading/error states for actions</li>
          <li><strong>useSearchCapabilities:</strong> Search across features, routes, actions, and states</li>
          <li><strong>useCommandPalette:</strong> VS Code-style command palette for actions</li>
          <li><strong>useCapabilityPermission:</strong> Check user permissions for capabilities</li>
          <li><strong>useRegisterCapabilities:</strong> Declaratively register capabilities with auto-cleanup</li>
        </ul>
      </div>
    </div>
  );
}
