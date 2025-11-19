/**
 * Tests for relationship preview API client
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  previewRelationshipTier,
  previewIntimacyLevel,
  configurePreviewApi,
  resetPreviewApiConfig,
  getPreviewApiConfig,
} from '../preview';

describe('Relationship Preview API', () => {
  // Mock fetch function
  let mockFetch: any;
  let fetchCalls: any[];

  beforeEach(() => {
    fetchCalls = [];
    mockFetch = async (url: string, options: any) => {
      fetchCalls.push({ url, options });

      // Mock successful response
      return {
        ok: true,
        json: async () => {
          if (url.includes('preview-tier')) {
            return {
              tier_id: 'close_friend',
              schema_key: 'default',
              affinity: 75.0,
            };
          } else if (url.includes('preview-intimacy')) {
            return {
              intimacy_level_id: 'intimate',
              relationship_values: {
                affinity: 75.0,
                trust: 55.0,
                chemistry: 70.0,
                tension: 15.0,
              },
            };
          }
          return {};
        },
      };
    };

    configurePreviewApi({ fetch: mockFetch });
  });

  afterEach(() => {
    resetPreviewApiConfig();
  });

  describe('previewRelationshipTier', () => {
    it('should call preview-tier endpoint with correct payload', async () => {
      const result = await previewRelationshipTier({
        worldId: 1,
        affinity: 75.0,
        schemaKey: 'default',
      });

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toContain('/game/relationships/preview-tier');
      expect(fetchCalls[0].options.method).toBe('POST');

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(1);
      expect(body.affinity).toBe(75.0);
      expect(body.schema_key).toBe('default');
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

    it('should use default schema key if not provided', async () => {
      await previewRelationshipTier({
        worldId: 1,
        affinity: 75.0,
      });

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.schema_key).toBe('default');
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
    it('should call preview-intimacy endpoint with correct payload', async () => {
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
      expect(fetchCalls[0].url).toContain('/game/relationships/preview-intimacy');
      expect(fetchCalls[0].options.method).toBe('POST');

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.world_id).toBe(1);
      expect(body.relationship_values).toEqual({
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
});
