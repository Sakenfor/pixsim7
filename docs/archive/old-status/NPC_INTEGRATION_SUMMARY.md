# NPC Response Video Generation - Integration Summary

## What Was Done

Successfully integrated the NPC Response video generation system with your existing generation infrastructure (Jobs API, GenerationService, provider plugin system).

## Files Modified

### 1. **packages/types/src/generation.ts** ✅
Added NPC response support to generation types:

```typescript
// Added new NPC response params interface
export interface NpcResponseParams {
  npc_id: string
  npc_name: string
  npc_base_image?: string
  expression: string
  emotion: string
  animation: string
  intensity: number
  art_style?: 'anime' | 'realistic' | 'semi-realistic'
  loras?: string[]
  prompt?: string
  negative_prompt?: string
  quality_preset?: 'realtime' | 'fast' | 'balanced' | 'quality'
  width?: number
  height?: number
  fps?: number
  steps?: number
  cfg?: number
  seed?: number
}

// Extended existing types to include 'npc_response'
GenerationNodeConfig.generationType: ... | 'npc_response'
GenerateContentRequest.type: ... | 'npc_response'
GeneratedContentPayload.type: ... | 'npc_response'
```

### 2. **packages/scene-gizmos/src/videoGenerationManager.ts** ✅
Refactored to use Jobs API instead of custom generation function:

**Before:**
```typescript
class VideoGenerationManager {
  private generateVideoFn?: (params, quality) => Promise<GeneratedVideo>;

  setGenerationFunction(fn) { ... }

  private async processQueue() {
    // Custom processing logic
    const video = await this.generateVideoFn(params, quality);
  }
}
```

**After:**
```typescript
class VideoGenerationManager {
  private wsConnection: WebSocket | null = null;
  private pendingJobs = new Map<number, GenerationRequest>();
  private apiBaseUrl: string;

  constructor(config) {
    // Connect to WebSocket for real-time updates
    this.connectWebSocket();
  }

  async requestVideo(params, priority) {
    // Create job via API
    const response = await fetch(`${this.apiBaseUrl}/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        operation_type: 'npc_response',
        provider_id: 'comfyui',
        params: npcParams,
        priority,
      }),
    });

    const job = await response.json();
    this.pendingJobs.set(job.id, request);

    // Wait for WebSocket update or timeout
    return this.waitForGeneration(request);
  }

  private handleJobUpdate(data) {
    // Real-time updates from WebSocket
    if (data.type === 'job:completed') {
      // Cache and complete
    }
  }

  disconnect() {
    // Clean up WebSocket connection
  }
}
```

**Key Changes:**
- ✅ Removed `setGenerationFunction()` and `processQueue()` methods
- ✅ Added WebSocket connection for real-time job updates
- ✅ Jobs created immediately via `/api/v1/jobs` endpoint
- ✅ Jobs tracked in `pendingJobs` map
- ✅ Client-side caching, predictive generation, and fallbacks preserved
- ✅ Progressive loading updated to work with API
- ✅ Added `disconnect()` method for cleanup

### 3. **docs/NPC_RESPONSE_VIDEO_INTEGRATION.md** ✅
Comprehensive integration guide with:
- Existing infrastructure summary
- Integration strategy (4 phases)
- Migration path
- Example provider plugin code
- Example UI plugin code
- Usage examples

## How It Works Now

### Client-Side Flow

```typescript
// 1. Create manager (connects to WebSocket)
const videoManager = new VideoGenerationManager({
  preset: 'fast',
  maxWaitTime: 5000,
  predictive: true,
  apiBaseUrl: '/api/v1',
});

// 2. Request video (creates job via API)
const result = await videoManager.requestVideo(videoParams, priority);

// 3. WebSocket sends real-time updates
//    - job:created → queued
//    - job:processing → processing
//    - job:completed → video ready!

// 4. Video returned (from cache or job completion)
if ('url' in result) {
  playVideo(result.url);  // Job completed
} else {
  handleFallback(result);  // Timeout reached
}
```

### Backend Flow (TODO - Next Steps)

```
1. POST /api/v1/jobs (operation_type: 'npc_response')
   ↓
2. GenerationService.create_generation()
   ↓
3. ARQ worker picks up job
   ↓
4. NpcResponseProvider.generate()
   ↓
5. Delegates to ComfyUI provider
   ↓
6. Video generated and stored
   ↓
7. WebSocket broadcasts job:completed
   ↓
8. Client receives video URL
```

## Client-Side Features Preserved ✅

1. **LRU Cache**: Reduces API calls for repeated requests
2. **Predictive Pre-generation**: Predicts next states and queues them
3. **Progressive Loading**: Request low quality first, upgrade later
4. **Fallback Strategies**: Show placeholder/procedural/freeze when slow
5. **Priority Queue**: High-priority requests processed first
6. **Real-time Updates**: WebSocket for instant status notifications

## New Benefits from Integration ✅

1. **Unified Architecture**: All generation through same Jobs API
2. **Database Persistence**: All NPC videos stored with metadata
3. **Quota Management**: NPC generation respects user quotas
4. **Rate Limiting**: Prevents abuse (10 req/60s per user)
5. **WebSocket Updates**: Real-time status in UI
6. **Prompt Versioning**: Can use versioned prompts
7. **Provider Abstraction**: Easy to switch backends
8. **Job History**: Track all generations
9. **Retry Support**: Built-in retry logic
10. **Cost Tracking**: Monitor generation costs

## Next Steps (Backend)

To complete the integration, you need to:

### 1. Add `npc_response` to backend operation types

**File: `pixsim7/backend/main/domain/enums.py`**
```python
class OperationType(str, Enum):
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    VIDEO_EXTEND = "video_extend"
    VIDEO_TRANSITION = "video_transition"
    FUSION = "fusion"
    NPC_RESPONSE = "npc_response"  # ADD THIS
```

### 2. Create NPC Response Provider (Optional)

**File: `pixsim7/backend/main/services/provider/npc_provider.py`**

See `docs/NPC_RESPONSE_VIDEO_INTEGRATION.md` for full example code.

OR just use existing ComfyUI provider directly (simpler approach).

### 3. Update GenerationService validation (Optional)

Add NPC-specific parameter validation in `create_generation()`.

### 4. Create UI Plugin (Frontend)

**File: `apps/main/src/lib/providers/plugins/npcResponsePlugin.tsx`**

See `docs/NPC_RESPONSE_VIDEO_INTEGRATION.md` for full example code.

## Testing the Integration

Once backend is updated:

```typescript
import { VideoGenerationManager, NpcResponseEvaluator } from '@pixsim7/scene-gizmos';

// Setup
const manager = new VideoGenerationManager({
  preset: 'fast',
  apiBaseUrl: '/api/v1',
});

const evaluator = new NpcResponseEvaluator(npcMetadata);

// Evaluate response
const videoParams = evaluator.evaluate({
  tool: 'feather',
  pressure: 0.7,
  zone: 'back',
});

// Request generation
const result = await manager.requestVideo(videoParams, 10);

// Check result
console.log('Job created:', result);

// Monitor jobs
console.log('Stats:', manager.getStats());
// { cacheStats, queueLength, pendingJobs, config }
```

## Summary

✅ **Frontend integration complete** - VideoGenerationManager now uses Jobs API
✅ **Type system extended** - NpcResponseParams added to generation types
✅ **Documentation created** - Comprehensive integration guide
⏳ **Backend integration pending** - Need to add NPC_RESPONSE operation type and optionally create provider plugin

The client-side is ready to go! Once you add `NPC_RESPONSE` to the backend enum and optionally create a provider plugin, the entire system will work end-to-end.
