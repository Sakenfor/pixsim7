/**
 * Video Generation Manager for Real-Time NPC Responses
 * Integrates with existing Jobs API for backend generation
 * Handles caching, fallbacks, and predictive pre-generation client-side
 */

import type { VideoGenerationOutput } from './npcResponseEvaluator';
import type { NpcResponseParams } from '@pixsim7/shared.types';

// ============================================================================
// Configuration Types
// ============================================================================

export interface VideoGenerationConfig {
  /** Quality/speed preset */
  preset: 'realtime' | 'fast' | 'balanced' | 'quality';

  /** Max time to wait for generation (ms) */
  maxWaitTime: number;

  /** Fallback strategy when generation is slow */
  fallback: 'placeholder' | 'procedural' | 'cached' | 'freeze';

  /** Enable predictive pre-generation */
  predictive: boolean;

  /** Cache size (number of videos) */
  cacheSize: number;

  /** Enable progressive loading (low quality → high quality) */
  progressive: boolean;

  /** API base URL (default: /api/v1) */
  apiBaseUrl?: string;

  /** Auth token for API requests */
  authToken?: string;
}

export interface QualityPreset {
  name: string;
  resolution: string;
  fps: number;
  steps: number;
  cfg: number;
  estimatedTime: number; // ms
}

export const QUALITY_PRESETS: Record<VideoGenerationConfig['preset'], QualityPreset> = {
  realtime: {
    name: 'Real-time (2-3s)',
    resolution: '256x256',
    fps: 8,
    steps: 4, // Lightning/LCM models
    cfg: 1.5,
    estimatedTime: 2500,
  },
  fast: {
    name: 'Fast (3-5s)',
    resolution: '512x512',
    fps: 12,
    steps: 8,
    cfg: 3.0,
    estimatedTime: 4000,
  },
  balanced: {
    name: 'Balanced (5-10s)',
    resolution: '512x512',
    fps: 24,
    steps: 15,
    cfg: 5.0,
    estimatedTime: 8000,
  },
  quality: {
    name: 'Quality (10-20s)',
    resolution: '768x768',
    fps: 30,
    steps: 25,
    cfg: 7.5,
    estimatedTime: 15000,
  },
};

// ============================================================================
// Generation Request Types
// ============================================================================

export interface GenerationRequest {
  id: string;
  jobId?: number; // Job ID from backend API
  params: VideoGenerationOutput;
  priority: number; // Higher = more urgent
  timestamp: number;
  config: VideoGenerationConfig;
  onComplete?: (video: GeneratedVideo) => void;
  onFallback?: (fallback: FallbackVideo) => void;
}

export interface GeneratedVideo {
  id: string;
  url: string; // Video blob URL or path
  params: VideoGenerationOutput;
  quality: VideoGenerationConfig['preset'];
  generatedAt: number;
  duration: number; // ms
}

export interface FallbackVideo {
  type: 'placeholder' | 'procedural' | 'cached' | 'freeze';
  data: any; // Depends on type
}

// ============================================================================
// Video Cache
// ============================================================================

class VideoCache {
  private cache = new Map<string, GeneratedVideo>();
  private maxSize: number;
  private accessOrder: string[] = [];

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from video parameters
   */
  private getCacheKey(params: VideoGenerationOutput): string {
    // Create a deterministic key based on important params
    const key = JSON.stringify({
      expression: params.expression,
      emotion: params.emotion,
      animation: params.animation,
      // Intensity rounded to reduce cache misses
      intensity: Math.round(params.intensity * 10) / 10,
      style: params.style,
      seed: params.seed,
    });
    return key;
  }

  /**
   * Get cached video
   */
  get(params: VideoGenerationOutput): GeneratedVideo | undefined {
    const key = this.getCacheKey(params);
    const video = this.cache.get(key);

    if (video) {
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
    }

    return video;
  }

  /**
   * Store video in cache
   */
  set(params: VideoGenerationOutput, video: GeneratedVideo): void {
    const key = this.getCacheKey(params);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        const oldVideo = this.cache.get(oldestKey);
        if (oldVideo) {
          // Revoke blob URL to free memory
          if (oldVideo.url.startsWith('blob:')) {
            URL.revokeObjectURL(oldVideo.url);
          }
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, video);
    this.accessOrder.push(key);
  }

  /**
   * Check if video is cached
   */
  has(params: VideoGenerationOutput): boolean {
    const key = this.getCacheKey(params);
    return this.cache.has(key);
  }

  /**
   * Clear cache
   */
  clear(): void {
    // Revoke all blob URLs
    for (const video of this.cache.values()) {
      if (video.url.startsWith('blob:')) {
        URL.revokeObjectURL(video.url);
      }
    }
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // TODO: Track hits/misses
    };
  }
}

// ============================================================================
// Predictive Pre-generation
// ============================================================================

class PredictiveGenerator {
  private stateHistory: Array<{ params: VideoGenerationOutput; timestamp: number }> = [];
  private maxHistory = 10;

  /**
   * Record a state for prediction
   */
  recordState(params: VideoGenerationOutput): void {
    this.stateHistory.push({
      params,
      timestamp: Date.now(),
    });

    if (this.stateHistory.length > this.maxHistory) {
      this.stateHistory.shift();
    }
  }

  /**
   * Predict next likely states
   */
  predictNextStates(): VideoGenerationOutput[] {
    if (this.stateHistory.length < 2) {
      return [];
    }

    const predictions: VideoGenerationOutput[] = [];
    const current = this.stateHistory[this.stateHistory.length - 1].params;

    // Strategy 1: Continuation (same state, slightly higher intensity)
    if (current.intensity < 0.9) {
      predictions.push({
        ...current,
        intensity: Math.min(1, current.intensity + 0.1),
      });
    }

    // Strategy 2: State progression (common paths)
    const progressionMap: Record<string, string[]> = {
      neutral: ['interested', 'curious'],
      interested: ['aroused', 'pleased'],
      aroused: ['passionate', 'flushed'],
      passionate: ['ecstatic', 'climax'],
    };

    const nextExpressions = progressionMap[current.expression] || [];
    for (const nextExpr of nextExpressions) {
      predictions.push({
        ...current,
        expression: nextExpr,
        intensity: Math.min(1, current.intensity + 0.15),
      });
    }

    // Strategy 3: Pattern detection (if user has been doing the same thing)
    const recentActions = this.stateHistory.slice(-3);
    const isRepeating = recentActions.every(
      (h, i, arr) => i === 0 || h.params.expression === arr[i - 1].params.expression
    );

    if (isRepeating && nextExpressions.length > 0) {
      // Likely to continue this pattern, prioritize progression
      predictions.unshift({
        ...current,
        expression: nextExpressions[0],
        intensity: Math.min(1, current.intensity + 0.2),
      });
    }

    // Limit predictions
    return predictions.slice(0, 3);
  }

  /**
   * Reset prediction history
   */
  reset(): void {
    this.stateHistory = [];
  }
}

// ============================================================================
// Video Generation Manager
// ============================================================================

export class VideoGenerationManager {
  private cache: VideoCache;
  private predictor: PredictiveGenerator;
  private queue: GenerationRequest[] = [];
  private processing = false;
  private config: VideoGenerationConfig;
  private wsConnection: WebSocket | null = null;
  private apiBaseUrl: string;
  private pendingJobs = new Map<number, GenerationRequest>(); // jobId -> request

  constructor(config: Partial<VideoGenerationConfig> = {}) {
    this.config = {
      preset: 'fast',
      maxWaitTime: 5000,
      fallback: 'placeholder',
      predictive: true,
      cacheSize: 50,
      progressive: true,
      apiBaseUrl: '/api/v1',
      ...config,
    };

    this.apiBaseUrl = this.config.apiBaseUrl || '/api/v1';
    this.cache = new VideoCache(this.config.cacheSize);
    this.predictor = new PredictiveGenerator();

    // Connect to WebSocket for real-time job updates
    if (typeof window !== 'undefined') {
      this.connectWebSocket();
    }
  }

  /**
   * Connect to jobs WebSocket for real-time updates
   */
  private connectWebSocket(): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}${this.apiBaseUrl}/ws/jobs`;

      console.log('[VideoGenerationManager] Connecting to WebSocket:', wsUrl);

      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.onopen = () => {
        console.log('[VideoGenerationManager] WebSocket connected');
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleJobUpdate(data);
        } catch (error) {
          console.error('[VideoGenerationManager] Failed to parse WebSocket message:', error);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('[VideoGenerationManager] WebSocket error:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('[VideoGenerationManager] WebSocket closed, reconnecting in 5s...');
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (error) {
      console.error('[VideoGenerationManager] Failed to connect WebSocket:', error);
    }
  }

  /**
   * Handle job update from WebSocket
   */
  private handleJobUpdate(data: any): void {
    const jobId = data.job_id || data.id;
    if (!jobId) return;

    const request = this.pendingJobs.get(jobId);
    if (!request) return;

    if (data.type === 'job:completed' || data.status === 'completed') {
      // Job completed successfully
      const video: GeneratedVideo = {
        id: jobId.toString(),
        url: data.result_url || data.url || '',
        params: request.params,
        quality: this.config.preset,
        generatedAt: Date.now(),
        duration: data.duration || 0,
      };

      // Cache the video
      this.cache.set(request.params, video);

      // Notify completion
      request.onComplete?.(video);

      // Remove from pending
      this.pendingJobs.delete(jobId);
      this.queue = this.queue.filter(r => r.jobId !== jobId);

    } else if (data.type === 'job:failed' || data.status === 'failed') {
      // Job failed
      console.error('[VideoGenerationManager] Job failed:', data.error_message || data.error);
      request.onFallback?.(this.getFallback(request.params));

      // Remove from pending
      this.pendingJobs.delete(jobId);
      this.queue = this.queue.filter(r => r.jobId !== jobId);

    } else if (data.type === 'job:processing' || data.status === 'processing') {
      // Job is processing
      console.log('[VideoGenerationManager] Job processing:', jobId);
    }
  }

  /**
   * Request video generation via Jobs API
   */
  async requestVideo(
    params: VideoGenerationOutput,
    priority: number = 1
  ): Promise<GeneratedVideo | FallbackVideo> {
    // Check cache first
    const cached = this.cache.get(params);
    if (cached) {
      console.log('[VideoGenerationManager] Cache hit!', params.expression);
      return cached;
    }

    // Build NPC response params for API
    const qualityPreset = QUALITY_PRESETS[this.config.preset];
    const npcParams: NpcResponseParams = {
      npc_id: params.npcId || 'unknown',
      npc_name: params.npcName || 'NPC',
      npc_base_image: params.npcBaseImage,
      expression: params.expression,
      emotion: params.emotion,
      animation: params.animation,
      intensity: params.intensity,
      art_style: params.style?.artStyle,
      loras: params.loras,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      quality_preset: this.config.preset,
      width: parseInt(qualityPreset.resolution.split('x')[0]),
      height: parseInt(qualityPreset.resolution.split('x')[1]),
      fps: qualityPreset.fps,
      steps: qualityPreset.steps,
      cfg: qualityPreset.cfg,
      seed: params.seed,
    };

    // Create job via API
    try {
      const response = await fetch(`${this.apiBaseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken ? { 'Authorization': `Bearer ${this.config.authToken}` } : {}),
        },
        body: JSON.stringify({
          operation_type: 'npc_response',
          provider_id: 'comfyui', // TODO: Make this configurable
          params: npcParams,
          priority: Math.round(priority * 2), // Map 0-10 to 0-20
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const job = await response.json();
      const jobId = job.id;

      console.log('[VideoGenerationManager] Job created:', jobId);

      // Create request tracking
      const request: GenerationRequest = {
        id: `${Date.now()}-${Math.random()}`,
        jobId,
        params,
        priority,
        timestamp: Date.now(),
        config: this.config,
      };

      // Add to pending jobs
      this.pendingJobs.set(jobId, request);
      this.queue.push(request);

      // Try to predict and pre-generate next states
      if (this.config.predictive) {
        this.predictor.recordState(params);
        const predictions = this.predictor.predictNextStates();

        // Queue predictions at lower priority
        for (const prediction of predictions) {
          if (!this.cache.has(prediction)) {
            // Don't await - fire and forget for predictions
            this.requestVideo(prediction, 0.5).catch(err => {
              console.warn('[VideoGenerationManager] Prediction generation failed:', err);
            });
          }
        }
      }

      // Wait for generation or timeout
      return this.waitForGeneration(request);

    } catch (error) {
      console.error('[VideoGenerationManager] Failed to create job:', error);
      return this.getFallback(params);
    }
  }

  /**
   * Wait for generation with timeout
   */
  private async waitForGeneration(
    request: GenerationRequest
  ): Promise<GeneratedVideo | FallbackVideo> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        // Timeout reached, use fallback
        console.warn('[VideoGenerationManager] Generation timeout, using fallback');
        const fallback = this.getFallback(request.params);
        resolve(fallback);
      }, this.config.maxWaitTime);

      request.onComplete = (video) => {
        clearTimeout(timeoutId);
        resolve(video);
      };

      request.onFallback = (fallback) => {
        clearTimeout(timeoutId);
        resolve(fallback);
      };
    });
  }

  /**
   * Get fallback content
   */
  private getFallback(params: VideoGenerationOutput): FallbackVideo {
    switch (this.config.fallback) {
      case 'cached':
        // Find closest cached video
        // TODO: Implement similarity search
        return { type: 'cached', data: null };

      case 'procedural':
        // Use procedural animation system
        return {
          type: 'procedural',
          data: {
            expression: params.expression,
            animation: params.animation,
            intensity: params.intensity,
          },
        };

      case 'freeze':
        // Keep current frame
        return { type: 'freeze', data: null };

      case 'placeholder':
      default:
        // Show placeholder
        return {
          type: 'placeholder',
          data: {
            expression: params.expression,
            emotion: params.emotion,
            text: `Generating: ${params.expression}...`,
          },
        };
    }
  }

  /**
   * Disconnect WebSocket and clean up resources
   */
  disconnect(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /**
   * Pre-generate common states
   */
  async preGenerateCommonStates(states: VideoGenerationOutput[]): Promise<void> {
    console.log('[VideoGenerationManager] Pre-generating', states.length, 'states');

    for (const state of states) {
      // Only generate if not cached
      if (!this.cache.has(state)) {
        await this.requestVideo(state, 0.1); // Very low priority
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VideoGenerationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      cacheStats: this.cache.getStats(),
      queueLength: this.queue.length,
      pendingJobs: this.pendingJobs.size,
      config: this.config,
    };
  }

  /**
   * Clear cache and reset
   */
  clear(): void {
    this.cache.clear();
    this.queue = [];
    this.pendingJobs.clear();
    this.predictor.reset();
  }
}

// ============================================================================
// Progressive Loading Strategy
// ============================================================================

export class ProgressiveVideoLoader {
  /**
   * Request video with progressive quality upgrade
   * Requests low quality first, then upgrades to high quality
   */
  static async requestProgressive(
    manager: VideoGenerationManager,
    params: VideoGenerationOutput,
    onLowQuality?: (video: GeneratedVideo) => void,
    onHighQuality?: (video: GeneratedVideo) => void
  ): Promise<void> {
    // Request low quality immediately (separate manager with realtime preset)
    const config = manager['config'];
    const lowQualityManager = new VideoGenerationManager({
      preset: 'realtime',
      maxWaitTime: 3000,
      fallback: 'placeholder',
      predictive: false,
      progressive: false,
      apiBaseUrl: config.apiBaseUrl,
      authToken: config.authToken,
    });

    const lowQualityResult = await lowQualityManager.requestVideo(params, 10);

    if ('url' in lowQualityResult) {
      onLowQuality?.(lowQualityResult);
    }

    // Clean up low quality manager
    lowQualityManager.disconnect();

    // Then request high quality in background (using main manager)
    const highQualityResult = await manager.requestVideo(params, 5);

    if ('url' in highQualityResult) {
      onHighQuality?.(highQualityResult);
    }
  }
}

// ============================================================================
// Utility: Common State Pre-generation
// ============================================================================

/**
 * Generate common NPC states to pre-populate cache
 */
export function getCommonNpcStates(baseParams: Partial<VideoGenerationOutput>): VideoGenerationOutput[] {
  const expressions = ['neutral', 'interested', 'pleased', 'aroused', 'ecstatic', 'giggling', 'blushing'];
  const intensities = [0.3, 0.5, 0.7, 0.9];

  const states: VideoGenerationOutput[] = [];

  for (const expression of expressions) {
    for (const intensity of intensities) {
      states.push({
        prompt: '',
        expression,
        animation: 'idle',
        emotion: 'neutral',
        intensity,
        ...baseParams,
      });
    }
  }

  return states;
}
