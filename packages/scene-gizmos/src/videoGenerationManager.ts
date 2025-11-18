/**
 * Video Generation Manager for Real-Time NPC Responses
 * Handles async generation, caching, fallbacks, and predictive pre-generation
 */

import type { VideoGenerationOutput } from './npcResponseEvaluator';

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
  private generateVideoFn?: (params: VideoGenerationOutput, quality: QualityPreset) => Promise<GeneratedVideo>;

  constructor(config: Partial<VideoGenerationConfig> = {}) {
    this.config = {
      preset: 'fast',
      maxWaitTime: 5000,
      fallback: 'placeholder',
      predictive: true,
      cacheSize: 50,
      progressive: true,
      ...config,
    };

    this.cache = new VideoCache(this.config.cacheSize);
    this.predictor = new PredictiveGenerator();
  }

  /**
   * Set the actual video generation function (integrates with your backend)
   */
  setGenerationFunction(
    fn: (params: VideoGenerationOutput, quality: QualityPreset) => Promise<GeneratedVideo>
  ): void {
    this.generateVideoFn = fn;
  }

  /**
   * Request video generation
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

    // Create request
    const request: GenerationRequest = {
      id: `${Date.now()}-${Math.random()}`,
      params,
      priority,
      timestamp: Date.now(),
      config: this.config,
    };

    // Add to queue
    this.queue.push(request);
    this.sortQueue();

    // Start processing if not already
    if (!this.processing) {
      this.processQueue();
    }

    // Try to predict and pre-generate next states
    if (this.config.predictive) {
      this.predictor.recordState(params);
      const predictions = this.predictor.predictNextStates();

      // Queue predictions at lower priority
      for (const prediction of predictions) {
        if (!this.cache.has(prediction)) {
          this.requestVideo(prediction, 0.5); // Lower priority
        }
      }
    }

    // Wait for generation or timeout
    return this.waitForGeneration(request);
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
   * Sort queue by priority
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Older requests first if same priority
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Process generation queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        // Check cache again (might have been generated while waiting)
        const cached = this.cache.get(request.params);
        if (cached) {
          request.onComplete?.(cached);
          continue;
        }

        // Generate video
        const quality = QUALITY_PRESETS[this.config.preset];

        if (!this.generateVideoFn) {
          console.error('[VideoGenerationManager] No generation function set!');
          request.onFallback?.(this.getFallback(request.params));
          continue;
        }

        console.log('[VideoGenerationManager] Generating:', request.params.expression, quality.name);

        const video = await this.generateVideoFn(request.params, quality);

        // Cache result
        this.cache.set(request.params, video);

        // Notify completion
        request.onComplete?.(video);

      } catch (error) {
        console.error('[VideoGenerationManager] Generation error:', error);
        request.onFallback?.(this.getFallback(request.params));
      }
    }

    this.processing = false;
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
      processing: this.processing,
      config: this.config,
    };
  }

  /**
   * Clear cache and reset
   */
  clear(): void {
    this.cache.clear();
    this.queue = [];
    this.predictor.reset();
  }
}

// ============================================================================
// Progressive Loading Strategy
// ============================================================================

export class ProgressiveVideoLoader {
  /**
   * Request video with progressive quality upgrade
   */
  static async requestProgressive(
    manager: VideoGenerationManager,
    params: VideoGenerationOutput,
    onLowQuality?: (video: GeneratedVideo) => void,
    onHighQuality?: (video: GeneratedVideo) => void
  ): Promise<void> {
    // Request low quality immediately
    const lowQualityManager = new VideoGenerationManager({
      preset: 'realtime',
      maxWaitTime: 3000,
      fallback: 'placeholder',
      predictive: false,
      progressive: false,
    });

    lowQualityManager.setGenerationFunction(manager['generateVideoFn']!);

    const lowQualityResult = await lowQualityManager.requestVideo(params, 10);

    if ('url' in lowQualityResult) {
      onLowQuality?.(lowQualityResult);
    }

    // Then request high quality in background
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
