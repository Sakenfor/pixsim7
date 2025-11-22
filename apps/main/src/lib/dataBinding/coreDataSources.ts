/**
 * Core Data Sources & Transforms
 *
 * Starter set of data sources and transforms for the Panel Builder.
 * Part of Task 51 - Builder Data Sources & Binding System
 */

import { dataSourceRegistry, createStoreSource, createStaticSource } from './dataSourceRegistry';
import type { DataTransform } from './dataSourceRegistry';

/**
 * Register core data sources
 * These are common, useful data sources available to all widgets
 */
export function registerCoreDataSources(): void {
  // Workspace sources
  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.isLocked',
      'Workspace Lock State',
      'workspace',
      'isLocked',
      {
        description: 'Whether the workspace layout is locked',
        tags: ['workspace', 'state'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.closedPanels',
      'Closed Panels',
      'workspace',
      'closedPanels',
      {
        description: 'List of closed panel IDs',
        tags: ['workspace', 'panels'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.closedPanels.count',
      'Closed Panels Count',
      'workspace',
      'closedPanels.length',
      {
        description: 'Number of closed panels',
        tags: ['workspace', 'panels', 'count'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.fullscreenPanel',
      'Fullscreen Panel ID',
      'workspace',
      'fullscreenPanel',
      {
        description: 'ID of the panel in fullscreen mode (if any)',
        tags: ['workspace', 'fullscreen'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.floatingPanels',
      'Floating Panels',
      'workspace',
      'floatingPanels',
      {
        description: 'List of floating panel states',
        tags: ['workspace', 'panels', 'floating'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.floatingPanels.count',
      'Floating Panels Count',
      'workspace',
      'floatingPanels.length',
      {
        description: 'Number of floating panels',
        tags: ['workspace', 'panels', 'count'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.presets',
      'Workspace Presets',
      'workspace',
      'presets',
      {
        description: 'Available workspace presets',
        tags: ['workspace', 'presets'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'workspace.presets.count',
      'Workspace Presets Count',
      'workspace',
      'presets.length',
      {
        description: 'Number of workspace presets',
        tags: ['workspace', 'presets', 'count'],
      }
    )
  );

  // Game state sources
  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context',
      'Game Context',
      'game-state',
      'context',
      {
        description: 'Current game context (mode, world, session, etc.)',
        tags: ['game', 'context'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context.mode',
      'Game Mode',
      'game-state',
      'context.mode',
      {
        description: 'Current game mode (map, room, scene, conversation, menu)',
        tags: ['game', 'mode'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context.worldId',
      'Current World ID',
      'game-state',
      'context.worldId',
      {
        description: 'ID of the current world',
        tags: ['game', 'world'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context.sessionId',
      'Current Session ID',
      'game-state',
      'context.sessionId',
      {
        description: 'ID of the current game session',
        tags: ['game', 'session'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context.sceneId',
      'Current Scene ID',
      'game-state',
      'context.sceneId',
      {
        description: 'ID of the current scene (if in scene mode)',
        tags: ['game', 'scene'],
      }
    )
  );

  dataSourceRegistry.registerSource(
    createStoreSource(
      'game.context.npcId',
      'Current NPC ID',
      'game-state',
      'context.npcId',
      {
        description: 'ID of the current NPC (if in conversation/scene mode)',
        tags: ['game', 'npc'],
      }
    )
  );

  // Static utility sources
  dataSourceRegistry.registerSource(
    createStaticSource('static.true', 'Boolean True', true, {
      description: 'Static true value',
      tags: ['static', 'boolean'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.false', 'Boolean False', false, {
      description: 'Static false value',
      tags: ['static', 'boolean'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.null', 'Null Value', null, {
      description: 'Static null value',
      tags: ['static', 'null'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.empty-string', 'Empty String', '', {
      description: 'Static empty string',
      tags: ['static', 'string'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.zero', 'Number Zero', 0, {
      description: 'Static zero value',
      tags: ['static', 'number'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.empty-array', 'Empty Array', [], {
      description: 'Static empty array',
      tags: ['static', 'array'],
    })
  );

  dataSourceRegistry.registerSource(
    createStaticSource('static.empty-object', 'Empty Object', {}, {
      description: 'Static empty object',
      tags: ['static', 'object'],
    })
  );
}

/**
 * Register core transforms
 * These are common, useful transforms available to all bindings
 */
export function registerCoreTransforms(): void {
  // Type conversions
  dataSourceRegistry.registerTransform({
    id: 'to-string',
    label: 'Convert to String',
    description: 'Converts any value to a string',
    apply: (input: unknown) => String(input),
  });

  dataSourceRegistry.registerTransform({
    id: 'to-number',
    label: 'Convert to Number',
    description: 'Converts any value to a number',
    apply: (input: unknown) => Number(input),
  });

  dataSourceRegistry.registerTransform({
    id: 'to-boolean',
    label: 'Convert to Boolean',
    description: 'Converts any value to a boolean',
    apply: (input: unknown) => Boolean(input),
  });

  // Array operations
  dataSourceRegistry.registerTransform({
    id: 'array-length',
    label: 'Array Length',
    description: 'Returns the length of an array',
    apply: (input: unknown) => (Array.isArray(input) ? input.length : 0),
  });

  dataSourceRegistry.registerTransform({
    id: 'array-first',
    label: 'First Element',
    description: 'Returns the first element of an array',
    apply: (input: unknown) => (Array.isArray(input) && input.length > 0 ? input[0] : undefined),
  });

  dataSourceRegistry.registerTransform({
    id: 'array-last',
    label: 'Last Element',
    description: 'Returns the last element of an array',
    apply: (input: unknown) =>
      Array.isArray(input) && input.length > 0 ? input[input.length - 1] : undefined,
  });

  dataSourceRegistry.registerTransform({
    id: 'array-join',
    label: 'Join Array',
    description: 'Joins array elements into a comma-separated string',
    apply: (input: unknown) => (Array.isArray(input) ? input.join(', ') : String(input)),
  });

  // Logical operations
  dataSourceRegistry.registerTransform({
    id: 'not',
    label: 'Logical NOT',
    description: 'Inverts a boolean value',
    apply: (input: unknown) => !input,
  });

  dataSourceRegistry.registerTransform({
    id: 'is-null',
    label: 'Is Null',
    description: 'Returns true if value is null or undefined',
    apply: (input: unknown) => input === null || input === undefined,
  });

  dataSourceRegistry.registerTransform({
    id: 'is-empty',
    label: 'Is Empty',
    description: 'Returns true if value is empty (null, undefined, empty string, empty array, etc.)',
    apply: (input: unknown) => {
      if (input === null || input === undefined) return true;
      if (typeof input === 'string') return input.length === 0;
      if (Array.isArray(input)) return input.length === 0;
      if (typeof input === 'object') return Object.keys(input).length === 0;
      return false;
    },
  });

  // Numeric operations
  dataSourceRegistry.registerTransform({
    id: 'abs',
    label: 'Absolute Value',
    description: 'Returns the absolute value of a number',
    apply: (input: unknown) => Math.abs(Number(input)),
  });

  dataSourceRegistry.registerTransform({
    id: 'round',
    label: 'Round',
    description: 'Rounds a number to the nearest integer',
    apply: (input: unknown) => Math.round(Number(input)),
  });

  dataSourceRegistry.registerTransform({
    id: 'floor',
    label: 'Floor',
    description: 'Rounds a number down to the nearest integer',
    apply: (input: unknown) => Math.floor(Number(input)),
  });

  dataSourceRegistry.registerTransform({
    id: 'ceil',
    label: 'Ceiling',
    description: 'Rounds a number up to the nearest integer',
    apply: (input: unknown) => Math.ceil(Number(input)),
  });

  // String operations
  dataSourceRegistry.registerTransform({
    id: 'uppercase',
    label: 'Uppercase',
    description: 'Converts a string to uppercase',
    apply: (input: unknown) => String(input).toUpperCase(),
  });

  dataSourceRegistry.registerTransform({
    id: 'lowercase',
    label: 'Lowercase',
    description: 'Converts a string to lowercase',
    apply: (input: unknown) => String(input).toLowerCase(),
  });

  dataSourceRegistry.registerTransform({
    id: 'trim',
    label: 'Trim',
    description: 'Removes whitespace from both ends of a string',
    apply: (input: unknown) => String(input).trim(),
  });

  dataSourceRegistry.registerTransform({
    id: 'string-length',
    label: 'String Length',
    description: 'Returns the length of a string',
    apply: (input: unknown) => String(input).length,
  });

  // Computed transforms (for use with computed sources)
  dataSourceRegistry.registerTransform({
    id: 'sum',
    label: 'Sum',
    description: 'Sums an array of numbers',
    apply: (input: unknown) => {
      if (!Array.isArray(input)) return 0;
      return input.reduce((sum, val) => sum + Number(val), 0);
    },
  });

  dataSourceRegistry.registerTransform({
    id: 'average',
    label: 'Average',
    description: 'Calculates the average of an array of numbers',
    apply: (input: unknown) => {
      if (!Array.isArray(input) || input.length === 0) return 0;
      const sum = input.reduce((s, val) => s + Number(val), 0);
      return sum / input.length;
    },
  });

  dataSourceRegistry.registerTransform({
    id: 'min',
    label: 'Minimum',
    description: 'Returns the minimum value from an array of numbers',
    apply: (input: unknown) => {
      if (!Array.isArray(input) || input.length === 0) return undefined;
      return Math.min(...input.map(Number));
    },
  });

  dataSourceRegistry.registerTransform({
    id: 'max',
    label: 'Maximum',
    description: 'Returns the maximum value from an array of numbers',
    apply: (input: unknown) => {
      if (!Array.isArray(input) || input.length === 0) return undefined;
      return Math.max(...input.map(Number));
    },
  });

  dataSourceRegistry.registerTransform({
    id: 'concat',
    label: 'Concatenate',
    description: 'Concatenates an array of values into a string',
    apply: (input: unknown) => {
      if (!Array.isArray(input)) return String(input);
      return input.map(String).join('');
    },
  });

  // JSON transforms
  dataSourceRegistry.registerTransform({
    id: 'to-json',
    label: 'Convert to JSON',
    description: 'Converts a value to a JSON string',
    apply: (input: unknown) => {
      try {
        return JSON.stringify(input, null, 2);
      } catch {
        return String(input);
      }
    },
  });

  dataSourceRegistry.registerTransform({
    id: 'from-json',
    label: 'Parse JSON',
    description: 'Parses a JSON string to a value',
    apply: (input: unknown) => {
      try {
        return JSON.parse(String(input));
      } catch {
        return null;
      }
    },
  });

  // Boolean display transforms
  dataSourceRegistry.registerTransform({
    id: 'bool-to-yes-no',
    label: 'Boolean to Yes/No',
    description: 'Converts a boolean to "Yes" or "No"',
    apply: (input: unknown) => (input ? 'Yes' : 'No'),
  });

  dataSourceRegistry.registerTransform({
    id: 'bool-to-lock-status',
    label: 'Boolean to Lock Status',
    description: 'Converts a boolean to "Locked" or "Unlocked"',
    apply: (input: unknown) => (input ? 'Locked' : 'Unlocked'),
  });

  dataSourceRegistry.registerTransform({
    id: 'bool-to-emoji',
    label: 'Boolean to Emoji',
    description: 'Converts a boolean to ✓ or ✗',
    apply: (input: unknown) => (input ? '✓' : '✗'),
  });
}

/**
 * Initialize all core data sources and transforms
 * Call this once during application startup
 */
export function initializeCoreDataSources(): void {
  registerCoreDataSources();
  registerCoreTransforms();
}
