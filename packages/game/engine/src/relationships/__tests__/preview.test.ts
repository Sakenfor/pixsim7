/**
 * Tests for relationship preview API client
 * Tests the re-exported functions from @pixsim7/shared.stats-core
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  previewRelationshipTier,
  previewIntimacyLevel,
  previewDerivedStat,
  configurePreviewApi,
  resetPreviewApiConfig,
  getPreviewApiConfig,
} from '@pixsim7/shared.stats-core';

describe('Relationship Preview API', () => {
  // Mock fetch function
  let mockFetch: any;
  let fetchCalls: any[];

  beforeEach(() => {
    fetchCalls = [];
    mockFetch = async (url: string, options: any) => {
      fetchCalls.push({ url, options });

      const body = JSON.parse(options.body);

      // Mock successful response for generic preview-entity-stats endpoint
      return {
        ok: true,
        json: async () => ({
          normalized_stats: {
            affinityTierId: body.values.affinity >= 60 ? 'close_friend' : 'friend',
            levelId: body.values.affinity >= 60 && body.values.chemistry >= 60 ? 'intimate' : 'light_flirt',
            affinity: body.values.affinity,
            trust: body.values.trust,
            chemistry: body.values.chemistry,
            tension: body.values.tension,
          },
        }),
      };
    };

    configurePreviewApi({ fetch: mockFetch });
  });

  afterEach(() => {
    resetPreviewApiConfig();
  });

  describe('previewRelationshipTier', () => {
    it('should call preview-entity-stats endpoint with correct payload', async () => {
      const result = await previewRelationshipTier({
        worldId: 1,
        affinity: 75.0,
        schemaKey: 'default',
      });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toContain('/stats/preview-entity-stats');
      expect(fetchCalls[0].options.method).toBe('POST');

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(1);
      expect(body.stat_definition_id).toBe('relationships');
      expect(body.values.affinity).toBe(75.0);
    });

    it('should return properly formatted response', async () => {
      const result = await previewRelationshipTier({
        worldId: 1,
        affinity: 75.0,
      });

      expect(result.tierId).toBe('close_friend');
      expect(result.schemaKey).toBe('default');
      expect(result.affinity).toBe(75.0);
    });

    it('should throw error on API failure', async () => {
      mockFetch = async () => ({
        ok: false,
        json: async () => ({
          detail: { error: 'World not found' },
        }),
      });

      configurePreviewApi({ fetch: mockFetch });

      await expect(
        previewRelationshipTier({ worldId: 999, affinity: 50.0 })
      ).rejects.toThrow('World not found');
    });
  });

  describe('previewIntimacyLevel', () => {
    it('should call preview-entity-stats endpoint with correct payload', async () => {
      const result = await previewIntimacyLevel({
        worldId: 1,
        relationshipValues: {
          affinity: 75.0,
          trust: 55.0,
          chemistry: 70.0,
          tension: 15.0,
        },
      });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toContain('/stats/preview-entity-stats');
      expect(fetchCalls[0].options.method).toBe('POST');

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(1);
      expect(body.stat_definition_id).toBe('relationships');
      expect(body.values).toEqual({
        affinity: 75.0,
        trust: 55.0,
        chemistry: 70.0,
        tension: 15.0,
      });
    });

    it('should return properly formatted response', async () => {
      const result = await previewIntimacyLevel({
        worldId: 1,
        relationshipValues: {
          affinity: 75.0,
          trust: 55.0,
          chemistry: 70.0,
          tension: 15.0,
        },
      });

      expect(result.intimacyLevelId).toBe('intimate');
      expect(result.relationshipValues).toEqual({
        affinity: 75.0,
        trust: 55.0,
        chemistry: 70.0,
        tension: 15.0,
      });
    });

    it('should throw error on API failure', async () => {
      mockFetch = async () => ({
        ok: false,
        json: async () => ({
          detail: { error: 'Invalid request' },
        }),
      });

      configurePreviewApi({ fetch: mockFetch });

      await expect(
        previewIntimacyLevel({
          worldId: 1,
          relationshipValues: {
            affinity: 75.0,
            trust: 55.0,
            chemistry: 70.0,
            tension: 15.0,
          },
        })
      ).rejects.toThrow('Invalid request');
    });
  });

  describe('Configuration', () => {
    it('should allow custom base URL configuration', () => {
      configurePreviewApi({ baseUrl: 'http://localhost:8000/api/v1' });

      const config = getPreviewApiConfig();
      expect(config.baseUrl).toBe('http://localhost:8000/api/v1');
    });

    it('should reset to default configuration', () => {
      configurePreviewApi({ baseUrl: 'http://custom.com/api' });
      resetPreviewApiConfig();

      const config = getPreviewApiConfig();
      expect(config.baseUrl).toBe('/api/v1');
    });

    it('should allow custom fetch function', () => {
      const customFetch = async () => ({ ok: true, json: async () => ({}) });
      configurePreviewApi({ fetch: customFetch });

      const config = getPreviewApiConfig();
      expect(config.fetch).toBe(customFetch);
    });
  });

  describe('previewDerivedStat', () => {
    beforeEach(() => {
      // Set up mock for derived stats endpoint
      mockFetch = async (url: string, options: any) => {
        fetchCalls.push({ url, options });

        const body = JSON.parse(options.body);

        // Mock mood derivation response
        if (body.target_stat_id === 'mood') {
          const relationships = body.input_values.relationships || {};
          const valence = (relationships.affinity || 50) * 0.6 + (relationships.chemistry || 50) * 0.4;
          const arousal = (relationships.chemistry || 50) * 0.5 + (relationships.tension || 0) * 0.5;

          return {
            ok: true,
            json: async () => ({
              target_stat_id: 'mood',
              derived_values: {
                valence,
                arousal,
                label: valence >= 60 ? 'happy' : 'neutral',
              },
              input_axes: [
                'relationships.affinity',
                'relationships.chemistry',
                'relationships.tension',
              ],
              tiers: {
                valence: valence >= 60 ? 'high' : 'moderate',
                arousal: arousal >= 60 ? 'high' : 'moderate',
              },
            }),
          };
        }

        // Unknown derived stat
        return {
          ok: false,
          json: async () => ({
            detail: {
              error: 'Derivation not available',
              target_stat_id: body.target_stat_id,
            },
          }),
        };
      };

      configurePreviewApi({ fetch: mockFetch });
    });

    it('should call preview-derived-stats endpoint with correct payload', async () => {
      const result = await previewDerivedStat({
        worldId: 1,
        targetStatId: 'mood',
        inputValues: {
          relationships: {
            affinity: 75.0,
            trust: 55.0,
            chemistry: 70.0,
            tension: 15.0,
          },
        },
      });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toContain('/stats/preview-derived-stats');
      expect(fetchCalls[0].options.method).toBe('POST');

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(1);
      expect(body.target_stat_id).toBe('mood');
      expect(body.input_values.relationships).toEqual({
        affinity: 75.0,
        trust: 55.0,
        chemistry: 70.0,
        tension: 15.0,
      });
    });

    it('should return properly formatted response with tiers', async () => {
      const result = await previewDerivedStat({
        worldId: 1,
        targetStatId: 'mood',
        inputValues: {
          relationships: {
            affinity: 75.0,
            trust: 55.0,
            chemistry: 70.0,
            tension: 15.0,
          },
        },
      });

      expect(result.targetStatId).toBe('mood');
      expect(typeof result.derivedValues.valence).toBe('number');
      expect(typeof result.derivedValues.arousal).toBe('number');
      expect(result.derivedValues.label).toBe('happy');
      expect(result.inputAxes).toContain('relationships.affinity');
      expect(result.tiers.valence).toBe('high');
    });

    it('should support editor mode (worldId=0)', async () => {
      await previewDerivedStat({
        worldId: 0,
        targetStatId: 'mood',
        inputValues: {
          relationships: { affinity: 50 },
        },
      });

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(0);
    });

    it('should default worldId to 0 when undefined', async () => {
      await previewDerivedStat({
        targetStatId: 'mood',
        inputValues: {
          relationships: { affinity: 50 },
        },
      });

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(0);
    });

    it('should throw error on derivation not available', async () => {
      await expect(
        previewDerivedStat({
          worldId: 1,
          targetStatId: 'unknown_stat',
          inputValues: {},
        })
      ).rejects.toThrow('Derivation not available');
    });

    it('should pass optional package IDs', async () => {
      await previewDerivedStat({
        worldId: 1,
        targetStatId: 'mood',
        inputValues: {
          relationships: { affinity: 50 },
        },
        packageIds: ['core.relationships', 'core.mood'],
      });

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.package_ids).toEqual(['core.relationships', 'core.mood']);
    });
  });
});
