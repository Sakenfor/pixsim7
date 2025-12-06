# Real-Time Video Generation for NPC Responses

## Problem

AI video generation typically takes 10-60+ seconds, but gameplay needs responses in 2-5 seconds maximum. This document explains how the system handles this latency.

## Solution Overview

The system uses a **multi-layered strategy** combining:

1. **Quality presets** (2-3s to 20s generation times)
2. **Predictive pre-generation** (AI predicts next states)
3. **Caching** (reuse generated videos)
4. **Fallbacks** (show placeholder while generating)
5. **Progressive loading** (low quality → high quality)
6. **Priority queue** (urgent requests first)

## Quality Presets

### ⚡ Real-time (2-3s)
- Resolution: 256x256
- FPS: 8
- Steps: 4 (LCM/Lightning models)
- CFG: 1.5
- **Use case:** Fast-paced gameplay, instant feedback

###🚀 Fast (3-5s)
- Resolution: 512x512
- FPS: 12
- Steps: 8
- CFG: 3.0
- **Use case:** Normal gameplay (recommended)

### ⚖️ Balanced (5-10s)
- Resolution: 512x512
- FPS: 24
- Steps: 15
- CFG: 5.0
- **Use case:** Cutscenes, important moments

### 💎 Quality (10-20s)
- Resolution: 768x768
- FPS: 30
- Steps: 25
- CFG: 7.5
- **Use case:** Pre-rendered content, galleries

## Integration Example

### 1. Setup Video Generation Manager

```typescript
import {
  VideoGenerationManager,
  NpcResponseEvaluator,
  QUALITY_PRESETS,
  getCommonNpcStates,
} from '@pixsim7/scene-gizmos';
import type { NpcResponseMetadata } from '@pixsim7/types/npcResponseNode';

// Create manager with NPC's settings
const npcMetadata: NpcResponseMetadata = /* from scene node */;

const videoManager = new VideoGenerationManager({
  preset: npcMetadata.videoGen.realtime?.preset || 'fast',
  maxWaitTime: npcMetadata.videoGen.realtime?.maxWaitTime || 5000,
  fallback: npcMetadata.videoGen.realtime?.fallback || 'placeholder',
  predictive: npcMetadata.videoGen.realtime?.predictive ?? true,
  cacheSize: npcMetadata.videoGen.realtime?.cacheSize || 50,
  progressive: npcMetadata.videoGen.realtime?.progressive ?? true,
});

// Set your actual video generation function
videoManager.setGenerationFunction(async (params, quality) => {
  // Call your ComfyUI/Stable Diffusion API
  const response = await fetch('/api/generate-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      width: parseInt(quality.resolution.split('x')[0]),
      height: parseInt(quality.resolution.split('x')[1]),
      fps: quality.fps,
      steps: quality.steps,
      cfg_scale: quality.cfg,
      loras: params.loras,
      seed: params.seed,
    }),
  });

  const data = await response.json();

  return {
    id: data.id,
    url: data.videoUrl, // Or blob URL
    params,
    quality: quality.name as any,
    generatedAt: Date.now(),
    duration: data.duration,
  };
});
```

### 2. Pre-generate Common States (On Scene Load)

```typescript
// When scene loads, pre-generate common states
if (npcMetadata.videoGen.realtime?.preGenerate) {
  const commonStates = getCommonNpcStates({
    prompt: npcMetadata.videoGen.basePrompt,
    loras: npcMetadata.videoGen.style?.loras,
    style: npcMetadata.videoGen.style,
  });

  // Pre-generate in background (low priority)
  await videoManager.preGenerateCommonStates(commonStates);

  console.log('Pre-generated', commonStates.length, 'common NPC states');
}
```

### 3. Handle Tool Interactions in Real-Time

```typescript
import { InteractiveTool } from '@pixsim7/scene-gizmos';

// Create NPC response evaluator
const responseEvaluator = new NpcResponseEvaluator(npcMetadata);

// On tool interaction
async function handleToolInteraction(tool: InteractiveTool, pressure: number, zone: string) {
  // Evaluate response graph
  const videoParams = responseEvaluator.evaluate({
    tool,
    pressure,
    speed: 0.5,
    pattern: detectPattern(), // Your pattern detection
    zone,
    duration: Date.now() - interactionStartTime,
    timestamp: Date.now(),
  });

  if (!videoParams) return;

  console.log('NPC reacts with:', videoParams.expression, videoParams.emotion);

  // Request video generation (or get from cache)
  const result = await videoManager.requestVideo(videoParams, 10); // Priority 10 = high

  if ('url' in result) {
    // Generated video ready!
    playVideo(result.url);
    console.log('Video generated in', Date.now() - videoParams.timestamp, 'ms');
  } else {
    // Fallback (timeout reached)
    handleFallback(result);
  }
}
```

### 4. Handle Fallbacks

```typescript
function handleFallback(fallback: FallbackVideo) {
  switch (fallback.type) {
    case 'placeholder':
      // Show text overlay
      showOverlay({
        text: `${fallback.data.emotion}: ${fallback.data.expression}`,
        icon: getEmotionIcon(fallback.data.emotion),
      });
      break;

    case 'procedural':
      // Use animated sprite system
      playProceduralAnimation({
        expression: fallback.data.expression,
        animation: fallback.data.animation,
        intensity: fallback.data.intensity,
      });
      break;

    case 'cached':
      // Find and play similar cached video
      // (Manager will implement similarity search)
      break;

    case 'freeze':
      // Keep current frame
      pauseVideo();
      break;
  }
}
```

### 5. Progressive Loading (Low → High Quality)

```typescript
import { ProgressiveVideoLoader } from '@pixsim7/scene-gizmos';

async function handleToolInteractionProgressive(/* ... */) {
  const videoParams = responseEvaluator.evaluate(/* ... */);

  if (!videoParams) return;

  // Request progressive loading
  await ProgressiveVideoLoader.requestProgressive(
    videoManager,
    videoParams,
    (lowQualityVideo) => {
      // Play low quality immediately (2-3s)
      console.log('Low quality ready:', lowQualityVideo.quality);
      playVideo(lowQualityVideo.url, { quality: 'low' });
    },
    (highQualityVideo) => {
      // Upgrade to high quality when ready (5-10s)
      console.log('High quality ready:', highQualityVideo.quality);
      playVideo(highQualityVideo.url, { quality: 'high', transition: 'crossfade' });
    }
  );
}
```

### 6. Monitor Performance

```typescript
// Get stats
setInterval(() => {
  const stats = videoManager.getStats();
  console.log('Video Manager Stats:', {
    cacheHits: stats.cacheStats.hitRate,
    cacheSize: stats.cacheStats.size,
    queueLength: stats.queueLength,
    processing: stats.processing,
  });
}, 5000);
```

## Predictive Pre-generation

The manager automatically predicts next likely states:

```
Current State: "interested" (intensity: 0.5)
        ↓
   Predictions:
   1. "interested" (intensity: 0.6) ← continuation
   2. "aroused" (intensity: 0.65)   ← progression
   3. "pleased" (intensity: 0.65)   ← alt progression
        ↓
   Queue for pre-generation (low priority)
        ↓
   When player continues, video is already cached!
```

## Caching Strategy

Videos are cached using a key based on:
- Expression
- Emotion
- Animation
- Intensity (rounded to 0.1)
- Style
- Seed

**Cache is LRU** (Least Recently Used):
- Old videos evicted when cache is full
- Blob URLs revoked to free memory

## ComfyUI Integration Example

```typescript
// Build ComfyUI workflow from video params
async function generateVideoComfyUI(params, quality) {
  const workflow = {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": params.style?.artStyle === 'anime'
          ? "animagine_xl.safetensors"
          : "realisticVision_v51.safetensors"
      }
    },
    "2": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": params.prompt,
        "clip": ["1", 1]
      }
    },
    "3": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": params.negativePrompt || "low quality, blurry",
        "clip": ["1", 1]
      }
    },
    "4": {
      "class_type": "VideoLinearCFGGuidance",
      "inputs": {
        "model": ["1", 0],
        "min_cfg": 1.0,
        "max_cfg": quality.cfg
      }
    },
    "5": {
      "class_type": "SVD_img2vid_Conditioning",
      "inputs": {
        "width": parseInt(quality.resolution.split('x')[0]),
        "height": parseInt(quality.resolution.split('x')[1]),
        "video_frames": quality.fps * 3, // 3 second clips
        "motion_bucket_id": 127,
        "fps": quality.fps,
        "augmentation_level": 0,
        "clip_vision": ["7", 0],
        "init_image": ["8", 0],
        "vae": ["1", 2]
      }
    },
    "6": {
      "class_type": "KSampler",
      "inputs": {
        "seed": params.seed || Math.floor(Math.random() * 1000000),
        "steps": quality.steps,
        "cfg": quality.cfg,
        "sampler_name": quality.steps <= 8 ? "lcm" : "euler",
        "scheduler": quality.steps <= 8 ? "sgm_uniform" : "normal",
        "denoise": 1,
        "model": ["4", 0],
        "positive": ["5", 0],
        "negative": ["5", 1],
        "latent_image": ["5", 2]
      }
    },
    "7": {
      "class_type": "CLIPVisionLoader",
      "inputs": {
        "clip_name": "SD1.5/pytorch_model.bin"
      }
    },
    "8": {
      "class_type": "LoadImage",
      "inputs": {
        "image": getNpcBaseImage(params) // Your NPC's base image
      }
    },
    "9": {
      "class_type": "VideoDecoder",
      "inputs": {
        "samples": ["6", 0],
        "vae": ["1", 2]
      }
    },
    "10": {
      "class_type": "SaveVideo",
      "inputs": {
        "filename_prefix": `npc_${params.expression}_${params.emotion}`,
        "fps": quality.fps,
        "compress_level": 4,
        "images": ["9", 0]
      }
    }
  };

  // Add LoRAs if specified
  if (params.loras && params.loras.length > 0) {
    workflow["11"] = {
      "class_type": "LoraLoader",
      "inputs": {
        "lora_name": params.loras[0],
        "strength_model": 0.8,
        "strength_clip": 0.8,
        "model": ["1", 0],
        "clip": ["1", 1]
      }
    };
    // Update model references to use LoRA output
    workflow["4"].inputs.model = ["11", 0];
    workflow["2"].inputs.clip = ["11", 1];
  }

  // Submit to ComfyUI
  const response = await fetch('http://localhost:8188/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });

  const { prompt_id } = await response.json();

  // Poll for completion
  return pollForCompletion(prompt_id);
}
```

## Performance Tips

### 1. Use LCM/Lightning Models
For real-time (2-3s) generation, use:
- **LCM (Latent Consistency Models)** - 4-8 steps
- **Lightning** - 2-4 steps
- **SDXL Turbo** - 1-4 steps

### 2. Reduce Resolution for Speed
- 256x256: Very fast (2-3s)
- 512x512: Fast (3-5s)
- 768x768: Moderate (10-15s)
- 1024x1024: Slow (20-30s)

### 3. Lower FPS
- 8 FPS: Acceptable for reactions
- 12 FPS: Smooth enough for gameplay
- 24+ FPS: Cinematic quality

### 4. Pre-generate Aggressively
Pre-generate on:
- Scene load
- Idle time
- During other cutscenes
- Between interactions

### 5. Use Caching Effectively
- Cache size: 50-100 videos = ~500MB-1GB
- Clear cache between scenes if memory constrained

## Troubleshooting

### Videos taking too long?
- Lower quality preset (realtime/fast)
- Reduce resolution/fps
- Check if using LCM/Lightning models
- Increase max wait time and use fallbacks

### Cache not working?
- Check if parameters are too varied (intensity, seed)
- Round intensity values to reduce cache misses
- Monitor cache stats

### Predictions not helping?
- Check if user behavior is unpredictable
- Adjust prediction strategies
- May not help for random/exploratory gameplay

### Out of memory?
- Reduce cache size
- Clear cache between scenes
- Use lower resolution
- Revoke old blob URLs

## Future Enhancements

- [ ] Similarity search for better cached fallbacks
- [ ] Multi-GPU queue distribution
- [ ] Batched generation (multiple NPCs)
- [ ] Adaptive quality based on performance
- [ ] Local vs. cloud generation fallback
- [ ] Video compression/streaming
- [ ] Frame interpolation for FPS boost
- [ ] Background pre-generation worker

---

For more details, see:
- `docs/NPC_RESPONSE_GRAPH_DESIGN.md` - Architecture
- `docs/NPC_RESPONSE_USAGE.md` - Usage guide
