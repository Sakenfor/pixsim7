/**
 * API-based Preset Storage
 *
 * Stores overlay presets via REST API backend
 */

import type { OverlayPreset } from '../../types';
import type { PresetStorage } from '../presetManager';

export interface APIStorageConfig {
  /** Base URL for the API */
  baseUrl: string;

  /** Authentication token (optional) */
  authToken?: string;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * API-based preset storage implementation
 *
 * API Endpoints expected:
 * - GET    /presets        - Get all presets
 * - GET    /presets/:id    - Get a specific preset
 * - POST   /presets        - Create a new preset
 * - PUT    /presets/:id    - Update an existing preset
 * - DELETE /presets/:id    - Delete a preset
 * - HEAD   /presets/:id    - Check if preset exists
 */
export class APIPresetStorage implements PresetStorage<OverlayPreset> {
  private config: APIStorageConfig;
  private cache: Map<string, OverlayPreset> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: APIStorageConfig) {
    this.config = {
      timeout: 10000,
      ...config,
    };
  }

  /**
   * Make an API request with timeout and error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      // Handle empty responses (e.g., DELETE)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`API request timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Invalidate the cache
   */
  private invalidateCache(): void {
    this.cache.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  async save(preset: OverlayPreset): Promise<void> {
    try {
      // Check if preset exists
      const exists = await this.exists(preset.id);

      if (exists) {
        // Update existing preset
        await this.request(`/presets/${preset.id}`, {
          method: 'PUT',
          body: JSON.stringify(preset),
        });
      } else {
        // Create new preset
        await this.request('/presets', {
          method: 'POST',
          body: JSON.stringify(preset),
        });
      }

      // Update cache
      this.cache.set(preset.id, preset);
      this.invalidateCache(); // Invalidate full cache to force reload
    } catch (error) {
      console.error('Failed to save preset to API:', error);
      throw new Error(`Failed to save preset: ${error}`);
    }
  }

  async load(id: string): Promise<OverlayPreset | null> {
    try {
      // Check cache first
      if (this.cache.has(id)) {
        return this.cache.get(id)!;
      }

      // Fetch from API
      const preset = await this.request<OverlayPreset>(`/presets/${id}`, {
        method: 'GET',
      });

      // Update cache
      this.cache.set(id, preset);

      return preset;
    } catch (error) {
      // If 404, return null instead of throwing
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }

      console.error('Failed to load preset from API:', error);
      throw new Error(`Failed to load preset: ${error}`);
    }
  }

  async loadAll(): Promise<OverlayPreset[]> {
    try {
      // Use cache if valid
      if (this.isCacheValid() && this.cache.size > 0) {
        return Array.from(this.cache.values());
      }

      // Fetch from API
      const presets = await this.request<OverlayPreset[]>('/presets', {
        method: 'GET',
      });

      // Update cache
      this.cache.clear();
      for (const preset of presets) {
        this.cache.set(preset.id, preset);
      }
      this.cacheTimestamp = Date.now();

      return presets;
    } catch (error) {
      console.error('Failed to load presets from API:', error);
      throw new Error(`Failed to load presets: ${error}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.request(`/presets/${id}`, {
        method: 'DELETE',
      });

      // Update cache
      this.cache.delete(id);
      this.invalidateCache();
    } catch (error) {
      console.error('Failed to delete preset from API:', error);
      throw new Error(`Failed to delete preset: ${error}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      // Check cache first
      if (this.cache.has(id)) {
        return true;
      }

      // Use HEAD request to check existence
      const url = `${this.config.baseUrl}/presets/${id}`;
      const headers: Record<string, string> = {
        ...this.config.headers,
      };

      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      const response = await fetch(url, {
        method: 'HEAD',
        headers,
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to check preset existence:', error);
      return false;
    }
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
    this.invalidateCache(); // Invalidate cache when auth changes
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.config.authToken = undefined;
    this.invalidateCache();
  }

  /**
   * Manually clear cache
   */
  clearCache(): void {
    this.invalidateCache();
  }
}
