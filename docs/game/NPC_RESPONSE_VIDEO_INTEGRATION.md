# NPC Response Video Generation - Integration with Existing Infrastructure

## Overview

This document explains how to integrate the NPC Response video generation system with the existing generation infrastructure (Jobs API, GenerationService, and provider plugin system).

## Existing Infrastructure Summary

### 1. **Frontend Generation Types** (`packages/types/src/generation.ts`)

```typescript
export interface GenerateContentRequest {
  type: 'transition' | 'variation' | 'dialogue' | 'environment'
  strategy: 'once' | 'per_playthrough' | 'per_player' | 'always'
  fallback: FallbackConfig
  cache_key?: string
  player_context?: PlayerContextSnapshot
}

export interface GenerateContentResponse {
  status: 'complete' | 'queued' | 'processing' | 'failed'
  content?: GeneratedContentPayload
  job_id?: string
}
```

**Features:**
- Generation strategies (once/per_playthrough/per_player/always)
- Fallback configuration (default_content/skip/retry/placeholder)
- Cache keys for deterministic generation
- Player context snapshots for personalization
- Health status tracking (latency, cost estimates)

### 2. **Backend Jobs API** (`pixsim7/backend/main/api/v1/jobs.py`)

```python
POST /api/v1/jobs
GET /api/v1/jobs
GET /api/v1/jobs/{job_id}
DELETE /api/v1/jobs/{job_id}
WS /api/v1/ws/jobs  # Real-time updates
```

**Operation Types:**
- `text_to_video`: Generate video from prompt
- `image_to_video`: Generate video from image + prompt
- `video_extend`: Extend existing video
- `video_transition`: Create transition between videos
- `fusion`: Combine multiple videos

**Features:**
- Rate limiting (10 requests per 60s)
- Quota checks
- Priority queue
- WebSocket for real-time status updates
- ARQ worker integration

### 3. **GenerationService** (`pixsim7/backend/main/services/generation/generation_service.py`)

```python
class GenerationService:
    async def create_generation(
        user, operation_type, provider_id, params,
        workspace_id, priority, scheduled_at, parent_generation_id,
        prompt_version_id
    ) -> Generation
```

**Features:**
- Parameter canonicalization
- Reproducible hash computation
- Prompt versioning
- Event bus integration
- Database persistence

### 4. **UI Plugin System** (`apps/main/src/lib/providers/generationPlugins.ts`)

```typescript
export class GenerationUIPluginRegistry {
  register(plugin: GenerationUIPlugin): void
  getPlugins(matcher: { providerId, operation? }): GenerationUIPlugin[]
  validate(matcher, values, context): ValidationResult
}
```

**Features:**
- Provider-specific UI components
- Operation-specific overrides
- Priority-based ordering
- Type-safe validation

## Integration Strategy

### Phase 1: Extend Generation Types for NPC Responses

Add NPC response video generation as a new operation type:

**1. Add to `packages/types/src/generation.ts`:**

```typescript
export interface NpcResponseParams {
  // NPC Context
  npc_id: string;
  npc_name: string;
  npc_base_image?: string;  // Base image for img2vid

  // Response Parameters (from evaluator)
  expression: string;       // e.g., "interested", "aroused"
  emotion: string;          // e.g., "pleased", "flustered"
  animation: string;        // e.g., "idle", "giggle"
  intensity: number;        // 0.0-1.0

  // Video Style
  art_style?: 'anime' | 'realistic' | 'semi-realistic';
  loras?: string[];

  // Prompt (can use prompt versioning)
  prompt?: string;
  negative_prompt?: string;

  // Quality preset (realtime/fast/balanced/quality)
  quality_preset?: 'realtime' | 'fast' | 'balanced' | 'quality';

  // Generation settings
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;        // seconds
  steps?: number;
  cfg?: number;
  seed?: number;
}

// Extend operation types
export type NpcOperationType = 'npc_response';
```

**2. Add to backend `domain/enums.py`:**

```python
class OperationType(str, Enum):
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    VIDEO_EXTEND = "video_extend"
    VIDEO_TRANSITION = "video_transition"
    FUSION = "fusion"
    NPC_RESPONSE = "npc_response"  # NEW
```

### Phase 2: Integrate VideoGenerationManager with Jobs API

Refactor `VideoGenerationManager` to use existing backend instead of custom generation function:

**File: `packages/scene/gizmos/src/videoGenerationManager.ts`**

```typescript
export class VideoGenerationManager {
  private cache: VideoCache;
  private predictor: PredictiveGenerator;
  private queue: GenerationRequest[] = [];
  private processing = false;
  private config: VideoGenerationConfig;

  // NEW: Use jobs API instead of custom function
  private apiBaseUrl: string = '/api/v1';
  private wsConnection: WebSocket | null = null;

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

    // Connect to WebSocket for real-time updates
    this.connectWebSocket();
  }

  /**
   * Connect to jobs WebSocket for real-time updates
   */
  private connectWebSocket(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${this.apiBaseUrl}/ws/jobs`;

    this.wsConnection = new WebSocket(wsUrl);

    this.wsConnection.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleJobUpdate(data);
    };

    this.wsConnection.onerror = (error) => {
      console.error('[VideoGenerationManager] WebSocket error:', error);
    };

    this.wsConnection.onclose = () => {
      console.log('[VideoGenerationManager] WebSocket closed, reconnecting...');
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  /**
   * Handle job update from WebSocket
   */
  private handleJobUpdate(data: any): void {
    if (data.type === 'job:completed') {
      // Find pending request
      const request = this.queue.find(r => r.jobId === data.job_id);
      if (request && data.result_url) {
        const video: GeneratedVideo = {
          id: data.job_id.toString(),
          url: data.result_url,
          params: request.params,
          quality: this.config.preset,
          generatedAt: Date.now(),
          duration: data.duration || 0,
        };

        // Cache and complete
        this.cache.set(request.params, video);
        request.onComplete?.(video);

        // Remove from queue
        this.queue = this.queue.filter(r => r.jobId !== data.job_id);
      }
    } else if (data.type === 'job:failed') {
      const request = this.queue.find(r => r.jobId === data.job_id);
      if (request) {
        request.onFallback?.(this.getFallback(request.params));
        this.queue = this.queue.filter(r => r.jobId !== data.job_id);
      }
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

    // Build NPC response params
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
        },
        body: JSON.stringify({
          operation_type: 'npc_response',
          provider_id: 'comfyui', // or your preferred provider
          params: npcParams,
          priority: Math.round(priority * 2), // Map 0-10 to 0-20
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const job = await response.json();

      // Create request tracking
      const request: GenerationRequest = {
        id: `${Date.now()}-${Math.random()}`,
        jobId: job.id,
        params,
        priority,
        timestamp: Date.now(),
        config: this.config,
      };

      this.queue.push(request);

      // Predict and pre-generate next states
      if (this.config.predictive) {
        this.predictor.recordState(params);
        const predictions = this.predictor.predictNextStates();
        for (const prediction of predictions) {
          if (!this.cache.has(prediction)) {
            this.requestVideo(prediction, 0.5); // Lower priority
          }
        }
      }

      // Wait for completion or timeout
      return this.waitForGeneration(request);

    } catch (error) {
      console.error('[VideoGenerationManager] Failed to create job:', error);
      return this.getFallback(params);
    }
  }
}
```

### Phase 3: Create Provider Plugin for NPC Video Generation

Create a provider that handles NPC response video generation:

**File: `pixsim7/backend/main/services/provider/npc_provider.py`**

```python
from pixsim7.backend.main.services.provider.base import BaseProvider
from pixsim7.backend.main.domain.enums import OperationType
from typing import Dict, Any

class NpcResponseProvider(BaseProvider):
    """
    NPC Response video generation provider
    Uses ComfyUI or other backends for actual generation
    """

    provider_id = "npc_response"
    display_name = "NPC Response Generator"
    supported_operations = [OperationType.NPC_RESPONSE]

    async def generate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate NPC response video

        Params:
            npc_id, expression, emotion, animation, intensity,
            quality_preset, prompt, etc.
        """
        # Extract params
        expression = params.get('expression', 'neutral')
        emotion = params.get('emotion', 'neutral')
        intensity = params.get('intensity', 0.5)
        quality_preset = params.get('quality_preset', 'fast')

        # Build prompt from NPC response
        prompt = self._build_npc_prompt(params)

        # Delegate to ComfyUI or other provider
        from pixsim7.backend.main.domain.providers.registry import registry
        comfyui = registry.get('comfyui')

        # Use image_to_video if base image provided, else text_to_video
        if params.get('npc_base_image'):
            result = await comfyui.generate({
                'operation_type': 'image_to_video',
                'image_url': params['npc_base_image'],
                'prompt': prompt,
                'negative_prompt': params.get('negative_prompt'),
                'width': params.get('width', 512),
                'height': params.get('height', 512),
                'fps': params.get('fps', 12),
                'steps': params.get('steps', 8),
                'cfg': params.get('cfg', 3.0),
                'seed': params.get('seed'),
            })
        else:
            result = await comfyui.generate({
                'operation_type': 'text_to_video',
                'prompt': prompt,
                'negative_prompt': params.get('negative_prompt'),
                'width': params.get('width', 512),
                'height': params.get('height', 512),
                'fps': params.get('fps', 12),
                'steps': params.get('steps', 8),
                'cfg': params.get('cfg', 3.0),
                'seed': params.get('seed'),
            })

        return result

    def _build_npc_prompt(self, params: Dict[str, Any]) -> str:
        """Build prompt from NPC response parameters"""
        expression = params.get('expression', 'neutral')
        emotion = params.get('emotion', 'neutral')
        intensity = params.get('intensity', 0.5)
        animation = params.get('animation', 'idle')

        # Base prompt
        base = params.get('prompt', f"{params.get('npc_name', 'character')}")

        # Add expression and emotion
        intensity_desc = "slightly" if intensity < 0.3 else \
                        "moderately" if intensity < 0.7 else "very"

        prompt = f"{base}, {intensity_desc} {expression}, {emotion} expression"

        # Add animation
        if animation != 'idle':
            prompt += f", {animation} animation"

        # Add LoRAs if specified
        loras = params.get('loras', [])
        if loras:
            prompt += f", <lora:{loras[0]}:0.8>"

        return prompt
```

**Register the provider:**

```python
# In pixsim7/backend/main/services/provider/registry.py or __init__.py
from .npc_provider import NpcResponseProvider

registry.register(NpcResponseProvider())
```

### Phase 4: Create UI Plugin for NPC Response Generation

**File: `apps/main/src/lib/providers/plugins/npcResponsePlugin.tsx`**

```typescript
import { defineGenerationUIPlugin } from '../generationPlugins';
import type { GenerationUIPluginProps } from '../generationPlugins';

function NpcResponseUI({ values, onChange, disabled }: GenerationUIPluginProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">NPC Name</label>
        <input
          type="text"
          value={values.npc_name || ''}
          onChange={(e) => onChange('npc_name', e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border rounded"
          placeholder="Character name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Expression</label>
        <select
          value={values.expression || 'neutral'}
          onChange={(e) => onChange('expression', e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="neutral">Neutral</option>
          <option value="interested">Interested</option>
          <option value="pleased">Pleased</option>
          <option value="aroused">Aroused</option>
          <option value="ecstatic">Ecstatic</option>
          <option value="giggling">Giggling</option>
          <option value="blushing">Blushing</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Emotion</label>
        <input
          type="text"
          value={values.emotion || ''}
          onChange={(e) => onChange('emotion', e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border rounded"
          placeholder="e.g., pleased, flustered"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Intensity</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={values.intensity || 0.5}
          onChange={(e) => onChange('intensity', parseFloat(e.target.value))}
          disabled={disabled}
          className="w-full"
        />
        <div className="text-xs text-neutral-500 text-right">
          {(values.intensity || 0.5).toFixed(1)}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Quality Preset</label>
        <select
          value={values.quality_preset || 'fast'}
          onChange={(e) => onChange('quality_preset', e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="realtime">⚡ Real-time (2-3s)</option>
          <option value="fast">🚀 Fast (3-5s)</option>
          <option value="balanced">⚖️ Balanced (5-10s)</option>
          <option value="quality">💎 Quality (10-20s)</option>
        </select>
      </div>
    </div>
  );
}

export const npcResponsePlugin = defineGenerationUIPlugin({
  id: 'npc-response',
  providerId: 'npc_response',
  component: NpcResponseUI,
  priority: 10,
  metadata: {
    name: 'NPC Response Generator',
    description: 'Generate NPC response videos based on interactions',
    version: '1.0.0',
  },
  validate: (values) => {
    const errors: Record<string, string> = {};

    if (!values.npc_name) {
      errors.npc_name = 'NPC name is required';
    }

    if (!values.expression) {
      errors.expression = 'Expression is required';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  },
});

// Register the plugin
import { generationUIPluginRegistry } from '../generationPlugins';
generationUIPluginRegistry.register(npcResponsePlugin);
```

## Migration Path

### Step 1: Add NPC Response Operation Type ✅
- Update `packages/types/src/generation.ts`
- Update `pixsim7/backend/main/domain/enums.py`
- Add NPC response params interface

### Step 2: Create NPC Response Provider ✅
- Implement `NpcResponseProvider` in backend
- Register provider in registry
- Add parameter validation

### Step 3: Update VideoGenerationManager ✅
- Replace custom generation function with Jobs API calls
- Add WebSocket support for real-time updates
- Keep client-side caching and predictive features

### Step 4: Create UI Plugin ✅
- Implement NPC response UI plugin
- Register plugin in catalog
- Add validation logic

### Step 5: Update NpcResponseNodeEditor ✅
- Integrate with new VideoGenerationManager
- Use existing jobs API
- Show job status in UI

### Step 6: Testing
- Test NPC response generation end-to-end
- Verify caching and predictive features work
- Check WebSocket updates
- Validate fallback strategies

## Benefits of Integration

1. **Unified Architecture**: All generation goes through same Jobs API
2. **Database Persistence**: All NPC videos stored in database with metadata
3. **Quota Management**: NPC generation respects user quotas
4. **Rate Limiting**: Prevents abuse
5. **WebSocket Updates**: Real-time status updates in UI
6. **Prompt Versioning**: Can use versioned prompts for NPC responses
7. **Provider Abstraction**: Easy to switch backends (ComfyUI, Pixverse, etc.)
8. **Job History**: Track all NPC video generations
9. **Retry Support**: Built-in retry logic
10. **Cost Tracking**: Monitor generation costs

## Client-Side Features Preserved

1. **LRU Cache**: Client-side cache still works, reduces API calls
2. **Predictive Pre-generation**: Predict next states and queue them
3. **Progressive Loading**: Request low quality first, upgrade later
4. **Fallback Strategies**: Show placeholder while generating
5. **Priority Queue**: High-priority requests processed first

## Example Usage After Integration

```typescript
import { VideoGenerationManager } from '@pixsim7/interaction.gizmos';
import { NpcResponseEvaluator } from '@pixsim7/interaction.gizmos';

// Create manager (now uses Jobs API)
const videoManager = new VideoGenerationManager({
  preset: 'fast',
  maxWaitTime: 5000,
  fallback: 'placeholder',
  predictive: true,
  cacheSize: 50,
  progressive: true,
});

// Evaluate response graph
const evaluator = new NpcResponseEvaluator(npcMetadata);
const videoParams = evaluator.evaluate({
  tool: 'feather',
  pressure: 0.7,
  zone: 'back',
  // ...
});

// Request video (now creates job via API)
const result = await videoManager.requestVideo(videoParams, 10);

if ('url' in result) {
  // Video ready (from cache or job completed)
  playVideo(result.url);
} else {
  // Fallback (timeout reached)
  handleFallback(result);
}

// Job status updates arrive via WebSocket automatically
```

## Conclusion

This integration leverages the existing, proven infrastructure while preserving the client-side performance optimizations (caching, prediction, progressive loading). The result is a robust, scalable, and maintainable NPC response video generation system.
