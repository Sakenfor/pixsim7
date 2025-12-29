/**
 * Tests for Dynamic Plugin Interaction Loader
 *
 * Tests the jsonSchemaToConfigFields helper and createGenericInteraction factory.
 */

import {
  jsonSchemaToConfigFields,
  createGenericInteraction,
  clearLoadedPluginsCache,
} from '../dynamicLoader';

describe('jsonSchemaToConfigFields', () => {
  beforeEach(() => {
    clearLoadedPluginsCache();
  });

  describe('basic type mapping', () => {
    it('should convert number properties with constraints', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          successChance: {
            type: 'number' as const,
            description: 'Probability of success',
            minimum: 0,
            maximum: 1,
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields).toHaveLength(1);
      expect(fields[0]).toEqual({
        key: 'successChance',
        label: 'Success Chance',
        type: 'number',
        description: 'Probability of success',
        min: 0,
        max: 1,
        step: 0.1, // Auto-added for 0-1 range
      });
    });

    it('should convert integer properties', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          maxAttempts: {
            type: 'integer' as const,
            minimum: 1,
            maximum: 10,
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('number');
      expect(fields[0].min).toBe(1);
      expect(fields[0].max).toBe(10);
      expect(fields[0].step).toBeUndefined(); // No auto-step for non-0-1 range
    });

    it('should convert string properties to text fields', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          customMessage: {
            type: 'string' as const,
            description: 'Custom success message',
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('text');
      expect(fields[0].description).toBe('Custom success message');
    });

    it('should convert boolean properties', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          isEnabled: {
            type: 'boolean' as const,
            description: 'Enable this feature',
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('boolean');
    });

    it('should convert array properties to tags', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          onSuccessFlags: {
            type: 'array' as const,
            description: 'Flags to set on success',
            items: { type: 'string' as const },
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('tags');
      expect(fields[0].placeholder).toContain('onSuccessFlags');
    });
  });

  describe('enum handling', () => {
    it('should convert string with enum to select field', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          difficulty: {
            type: 'string' as const,
            enum: ['easy', 'medium', 'hard'],
            description: 'Difficulty level',
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('select');
      expect(fields[0].options).toEqual([
        { value: 'easy', label: 'easy' },
        { value: 'medium', label: 'medium' },
        { value: 'hard', label: 'hard' },
      ]);
    });

    it('should convert number with enum to select field', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          priority: {
            type: 'number' as const,
            enum: [1, 2, 3, 5, 8],
            description: 'Priority level',
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('select');
      expect(fields[0].options).toHaveLength(5);
    });
  });

  describe('label formatting', () => {
    it('should convert camelCase to Title Case', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          baseSuccessChance: { type: 'number' as const },
          detectionChance: { type: 'number' as const },
          onSuccessFlags: { type: 'array' as const },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].label).toBe('Base Success Chance');
      expect(fields[1].label).toBe('Detection Chance');
      expect(fields[2].label).toBe('On Success Flags');
    });
  });

  describe('edge cases', () => {
    it('should handle empty schema', () => {
      const schema = {
        type: 'object' as const,
        properties: {},
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields).toHaveLength(0);
    });

    it('should handle missing properties', () => {
      const schema = {
        type: 'object' as const,
      } as any; // Intentionally missing properties

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields).toHaveLength(0);
    });

    it('should handle unknown types as text', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          unknownField: {
            type: 'unknown' as any,
          },
        },
      };

      const fields = jsonSchemaToConfigFields(schema);

      expect(fields[0].type).toBe('text');
    });
  });
});

describe('createGenericInteraction', () => {
  const mockManifest = {
    id: 'test-interaction',
    name: 'Test Interaction',
    description: 'A test interaction for testing',
    icon: '\u2728',
    category: 'test',
    version: '1.0.0',
    tags: ['test'],
    apiEndpoint: '/test/endpoint',
    configSchema: {
      type: 'object' as const,
      properties: {
        successChance: {
          type: 'number' as const,
          minimum: 0,
          maximum: 1,
          default: 0.5,
        },
      },
    },
    defaultConfig: {
      successChance: 0.5,
    },
    uiMode: 'notification',
    capabilities: {
      hasRisk: true,
    },
  };

  it('should create a valid InteractionPlugin', () => {
    const plugin = createGenericInteraction(mockManifest);

    expect(plugin.id).toBe('test-interaction');
    expect(plugin.name).toBe('Test Interaction');
    expect(plugin.description).toBe('A test interaction for testing');
    expect(plugin.icon).toBe('\u2728');
    expect(plugin.category).toBe('test');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.tags).toEqual(['test']);
    expect(plugin.uiMode).toBe('notification');
    expect(plugin.capabilities).toEqual({ hasRisk: true });
  });

  it('should include enabled flag in defaultConfig', () => {
    const plugin = createGenericInteraction(mockManifest);

    expect(plugin.defaultConfig).toHaveProperty('enabled', true);
    expect(plugin.defaultConfig).toHaveProperty('successChance', 0.5);
  });

  it('should generate configFields from schema', () => {
    const plugin = createGenericInteraction(mockManifest);

    expect(plugin.configFields).toHaveLength(1);
    expect(plugin.configFields[0].key).toBe('successChance');
    expect(plugin.configFields[0].type).toBe('number');
  });

  it('should have an execute function', () => {
    const plugin = createGenericInteraction(mockManifest);

    expect(typeof plugin.execute).toBe('function');
  });

  it('should have a validate function', () => {
    const plugin = createGenericInteraction(mockManifest);

    expect(typeof plugin.validate).toBe('function');
  });

  describe('validate function', () => {
    it('should return null for valid config', () => {
      const plugin = createGenericInteraction(mockManifest);

      const result = plugin.validate?.({
        enabled: true,
        successChance: 0.5,
      } as any);

      expect(result).toBeNull();
    });

    it('should return error for value below minimum', () => {
      const plugin = createGenericInteraction(mockManifest);

      const result = plugin.validate?.({
        enabled: true,
        successChance: -0.1,
      } as any);

      expect(result).toContain('at least 0');
    });

    it('should return error for value above maximum', () => {
      const plugin = createGenericInteraction(mockManifest);

      const result = plugin.validate?.({
        enabled: true,
        successChance: 1.5,
      } as any);

      expect(result).toContain('at most 1');
    });
  });
});
