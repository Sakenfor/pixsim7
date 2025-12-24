/**
 * Plugin Test Harnesses
 *
 * Provides testing environments for different plugin kinds.
 * Each harness simulates the context and allows testing plugin code.
 */

import { useState, useEffect } from 'react';
import type {
  InteractionPluginProject,
  NodeTypePluginProject,
  GalleryToolPluginProject,
  WorldToolPluginProject,
} from '@lib/plugins/projects';

/**
 * Dynamically load a plugin from source code without using eval.
 *
 * Supports CommonJS-style exports (module.exports / exports.default)
 * and a window.__lastPlugin fallback used by some plugin examples.
 */
function loadPluginFromCode<T = any>(code: string): T {
  const exports: any = {};
  const module: any = { exports };
  const globalWindow: any = typeof window !== 'undefined' ? window : {};

  const fn = new Function(
    'exports',
    'module',
    'window',
    `
      ${code}

      return (typeof module !== 'undefined' && module.exports)
        || (typeof exports !== 'undefined' && exports.default)
        || window.__lastPlugin;
    `
  ) as (exports: any, module: any, window: any) => T;

  return fn(exports, module, globalWindow);
}

// ============================================================================
// Interaction Test Harness
// ============================================================================

export function InteractionTestHarness({ project }: { project: InteractionPluginProject }) {
  const [config, setConfig] = useState('{\n  "enabled": true,\n  "successChance": 75\n}');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecute = async () => {
    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Parse config
      const parsedConfig = JSON.parse(config);

      // Create a stub context
      const context = {
        state: {
          assignment: {
            slot_id: 'test-slot',
            npc_id: 1,
            npc_name: 'Test NPC',
          },
          gameSession: {
            id: 1,
            world_id: 1,
            player_name: 'Test Player',
            session_flags: {},
            relationships: {},
          },
          sessionFlags: {},
          relationships: {},
          worldId: 1,
          worldTime: { day: 1, hour: 12 },
          locationId: 1,
          locationNpcs: [],
        },
        api: {},
        session: {},
        onSceneOpen: async () => {},
        onSessionUpdate: () => {},
        onError: (msg: string) => setError(msg),
        onSuccess: (msg: string) => console.log('Success:', msg),
      };

      // Load plugin implementation from project code
      const plugin = loadPluginFromCode<any>(project.code);

      if (!plugin || typeof plugin.execute !== 'function') {
        throw new Error('Plugin must export an execute function');
      }

      // Execute the plugin
      const execResult = await plugin.execute(parsedConfig, context);
      setResult(execResult);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Test Interaction
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Edit the config JSON and click Execute to test your interaction plugin.
        </p>
      </div>

      {/* Config Editor */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Config JSON
        </label>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Execute Button */}
      <button
        onClick={handleExecute}
        disabled={isExecuting}
        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
      >
        {isExecuting ? 'Executing...' : 'Execute Interaction'}
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">Error</h4>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">Result</h4>
          <pre className="text-sm text-green-700 dark:text-green-400 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Node Type Test Harness
// ============================================================================

export function NodeTypeTestHarness({ project }: { project: NodeTypePluginProject }) {
  const [nodeData, setNodeData] = useState('{\n  "value": "test",\n  "enabled": true\n}');
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = () => {
    setError(null);
    setValidationResult(null);

    try {
      // Parse node data
      const parsedData = JSON.parse(nodeData);

      // Load node type definition from project code
      const nodeType = loadPluginFromCode<any>(project.code);

      if (!nodeType) {
        throw new Error('Plugin must export a node type definition');
      }

      // Run validation if available
      if (nodeType.validate) {
        const result = nodeType.validate(parsedData);
        if (result) {
          setValidationResult(`Validation failed: ${result}`);
        } else {
          setValidationResult('Validation passed ✓');
        }
      } else {
        setValidationResult('No validation function defined');
      }
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Test Node Type
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Edit the node data JSON and validate it against your node type definition.
        </p>
      </div>

      {/* Node Metadata */}
      <div className="p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{project.metadata.icon}</span>
          <div>
            <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
              {project.metadata.name}
            </h4>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {project.metadata.description}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-neutral-600 dark:text-neutral-400">Category:</span>{' '}
            <span className="text-neutral-900 dark:text-neutral-100">{project.metadata.category}</span>
          </div>
          <div>
            <span className="text-neutral-600 dark:text-neutral-400">Scope:</span>{' '}
            <span className="text-neutral-900 dark:text-neutral-100">{project.metadata.scope}</span>
          </div>
        </div>
      </div>

      {/* Node Data Editor */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Node Data JSON
        </label>
        <textarea
          value={nodeData}
          onChange={(e) => setNodeData(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Validate Button */}
      <button
        onClick={handleValidate}
        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors"
      >
        Validate Node Data
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">Error</h4>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Validation Result */}
      {validationResult && (
        <div
          className={`p-4 rounded-lg border ${
            validationResult.includes('failed')
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          }`}
        >
          <p
            className={`text-sm ${
              validationResult.includes('failed')
                ? 'text-yellow-700 dark:text-yellow-400'
                : 'text-green-700 dark:text-green-400'
            }`}
          >
            {validationResult}
          </p>
        </div>
      )}

      <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          💡 To see this node in the graph editor, use the "Dev Register" button to temporarily
          add it to the node palette.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Gallery Tool Test Harness
// ============================================================================

export function GalleryToolTestHarness({ project }: { project: GalleryToolPluginProject }) {
  const [assets] = useState([
    {
      id: 1,
      createdAt: new Date().toISOString(),
      description: 'Test asset 1',
      durationSec: null,
      fileSizeBytes: null,
      fileUrl: null,
      height: null,
      isArchived: false,
      lastUploadStatusByProvider: null,
      localPath: null,
      mediaType: 'image' as const,
      mimeType: null,
      previewKey: null,
      previewUrl: null,
      providerAssetId: 'asset-1',
      providerId: 'test',
      providerStatus: 'ok' as const,
      remoteUrl: null,
      sourceGenerationId: null,
      storedKey: null,
      syncStatus: 'remote' as const,
      tags: [],
      thumbnailKey: null,
      thumbnailUrl: 'https://via.placeholder.com/150',
      userId: 0,
      width: null,
    },
    {
      id: 2,
      createdAt: new Date().toISOString(),
      description: 'Test asset 2',
      durationSec: null,
      fileSizeBytes: null,
      fileUrl: null,
      height: null,
      isArchived: false,
      lastUploadStatusByProvider: null,
      localPath: null,
      mediaType: 'video' as const,
      mimeType: null,
      previewKey: null,
      previewUrl: null,
      providerAssetId: 'asset-2',
      providerId: 'test',
      providerStatus: 'ok' as const,
      remoteUrl: null,
      sourceGenerationId: null,
      storedKey: null,
      syncStatus: 'remote' as const,
      tags: [],
      thumbnailKey: null,
      thumbnailUrl: null,
      userId: 0,
      width: null,
    },
  ]);

  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRender = () => {
    setError(null);
    setOutput(null);

    try {
      const context = {
        assets,
        selectedAssets: [],
        filters: { q: '', tag: '', provider_id: '', sort: 'new' as const },
        refresh: () => console.log('Refresh called'),
        updateFilters: (f: any) => console.log('Update filters:', f),
        isSelectionMode: false,
      };

      // Load gallery tool from project code
      const tool = loadPluginFromCode<any>(project.code);

      if (!tool || typeof tool.render !== 'function') {
        throw new Error('Plugin must export a render function');
      }

      // Render the tool (this will return React elements)
      const rendered = tool.render(context);
      setOutput('Tool rendered successfully! Check console for render output.');
      console.log('Gallery Tool Render:', rendered);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Test Gallery Tool
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Test your gallery tool with sample assets.
        </p>
      </div>

      {/* Sample Assets */}
      <div className="p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800">
        <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Sample Assets ({assets.length})
        </h4>
        <div className="space-y-2">
          {assets.map((asset) => (
            <div key={asset.id} className="text-sm text-neutral-700 dark:text-neutral-300">
              <span className="font-mono">{asset.id}</span> - {asset.mediaType} ({asset.description})
            </div>
          ))}
        </div>
      </div>

      {/* Render Button */}
      <button
        onClick={handleRender}
        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors"
      >
        Test Render
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">Error</h4>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Output Display */}
      {output && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-700 dark:text-green-400">{output}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// World Tool Test Harness
// ============================================================================

export function WorldToolTestHarness({ project }: { project: WorldToolPluginProject }) {
  const [worldData] = useState({
    world: {
      id: 1,
      title: 'Test World',
      description: 'A test world for development',
    },
    gameSession: {
      id: 1,
      world_id: 1,
      player_name: 'Test Player',
    },
    worldTime: { day: 1, hour: 12 },
    location: {
      id: 1,
      name: 'Test Location',
      description: 'A test location',
    },
    locationNpcs: [
      { npc_id: 1, npc_name: 'Test NPC 1', slot_id: 'slot-1' },
      { npc_id: 2, npc_name: 'Test NPC 2', slot_id: 'slot-2' },
    ],
  });

  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRender = () => {
    setError(null);
    setOutput(null);

    try {
      const context = {
        ...worldData,
        onSessionUpdate: () => console.log('Session update called'),
        refresh: () => console.log('Refresh called'),
      };

      // Load world tool from project code
      const tool = loadPluginFromCode<any>(project.code);

      if (!tool || typeof tool.render !== 'function') {
        throw new Error('Plugin must export a render function');
      }

      // Render the tool
      const rendered = tool.render(context);
      setOutput('Tool rendered successfully! Check console for render output.');
      console.log('World Tool Render:', rendered);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">
          Test World Tool
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Test your world tool with sample world data.
        </p>
      </div>

      {/* Sample World Data */}
      <div className="p-4 rounded-lg bg-neutral-100 dark:bg-neutral-800 space-y-2">
        <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-2">Sample World Data</h4>
        <div className="text-sm space-y-1 text-neutral-700 dark:text-neutral-300">
          <div>World: {worldData.world.title}</div>
          <div>
            Time: Day {worldData.worldTime.day}, Hour {worldData.worldTime.hour}
          </div>
          <div>Location: {worldData.location.name}</div>
          <div>NPCs: {worldData.locationNpcs.length}</div>
        </div>
      </div>

      {/* Render Button */}
      <button
        onClick={handleRender}
        className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition-colors"
      >
        Test Render
      </button>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">Error</h4>
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Output Display */}
      {output && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-700 dark:text-green-400">{output}</p>
        </div>
      )}
    </div>
  );
}
