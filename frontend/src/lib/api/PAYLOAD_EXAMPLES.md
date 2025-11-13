# Control Center API Payload Examples

This document shows example payloads for each operation type that would be sent to `POST /api/v1/jobs`.

## Text to Video

**User Input:**
- Prompt: "A cat walking on a beach at sunset"
- Provider: pixverse
- Preset: "1080p • 16:9" (quality: 1080p, aspect_ratio: 16:9)

**Payload:**
```json
{
  "operation_type": "text_to_video",
  "provider_id": "pixverse",
  "params": {
    "prompt": "A cat walking on a beach at sunset",
    "preset_id": "preset_1",
    "quality": "1080p",
    "aspect_ratio": "16:9"
  }
}
```

---

## Image to Video

**User Input:**
- Prompt: "Camera zooms into the scene" (optional)
- Image URL: "https://example.com/beach.jpg"
- Provider: pixverse
- Preset: "720p • 16:9"

**Payload:**
```json
{
  "operation_type": "image_to_video",
  "provider_id": "pixverse",
  "params": {
    "prompt": "Camera zooms into the scene",
    "image_url": "https://example.com/beach.jpg",
    "preset_id": "preset_2",
    "quality": "720p",
    "aspect_ratio": "16:9"
  }
}
```

---

## Video Extend

**Scenario 1: Using video_url (external URL)**

**User Input:**
- Prompt: "Continue the scene with more action" (optional)
- Video URL: "https://storage.example.com/videos/original.mp4"
- Provider: pixverse
- Preset: "1080p"

**Payload:**
```json
{
  "operation_type": "video_extend",
  "provider_id": "pixverse",
  "params": {
    "prompt": "Continue the scene with more action",
    "video_url": "https://storage.example.com/videos/original.mp4",
    "preset_id": "preset_3",
    "quality": "1080p"
  }
}
```

**Scenario 2: Using original_video_id (Pixverse's internal ID)**

This is the preferred method for Pixverse because it avoids re-uploading the video.
The `original_video_id` would be obtained from a previous generation job.

**User Input:**
- Prompt: "Add dramatic lighting"
- Provider Video ID: "px_abc123xyz789" (from Pixverse's previous response)
- Provider: pixverse
- Preset: "1080p"

**Payload:**
```json
{
  "operation_type": "video_extend",
  "provider_id": "pixverse",
  "params": {
    "prompt": "Add dramatic lighting",
    "original_video_id": "px_abc123xyz789",
    "preset_id": "preset_3",
    "quality": "1080p"
  }
}
```

**Notes for video_extend:**
- Either `video_url` OR `original_video_id` must be present (validation enforced)
- If both are provided, backend should prefer `original_video_id` for efficiency
- `original_video_id` is provider-specific (Pixverse format vs Sora format)
- Backend stores `original_video_id` in job results for chaining extends

---

## Video Transition

**User Input:**
- Image URLs: ["https://example.com/img1.jpg", "https://example.com/img2.jpg", "https://example.com/img3.jpg"]
- Prompts: ["Scene 1: Beach sunset", "Scene 2: Ocean waves", "Scene 3: Night sky"]
- Provider: pixverse
- Preset: "720p • 16:9"

**Payload:**
```json
{
  "operation_type": "video_transition",
  "provider_id": "pixverse",
  "params": {
    "image_urls": [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
      "https://example.com/img3.jpg"
    ],
    "prompts": [
      "Scene 1: Beach sunset",
      "Scene 2: Ocean waves",
      "Scene 3: Night sky"
    ],
    "preset_id": "preset_4",
    "quality": "720p",
    "aspect_ratio": "16:9"
  }
}
```

**Notes:**
- `image_urls` and `prompts` arrays must have equal length (validation enforced)
- Minimum 2 items per array for a transition
- Each prompt describes the transition from the corresponding image

---

## Fusion

**User Input:**
- Fusion Assets: ["asset_123", "asset_456"] (internal asset IDs)
- Prompt: "Blend these scenes smoothly" (optional)
- Provider: pixverse
- Preset: "1080p"

**Payload:**
```json
{
  "operation_type": "fusion",
  "provider_id": "pixverse",
  "params": {
    "fusion_assets": ["asset_123", "asset_456"],
    "prompt": "Blend these scenes smoothly",
    "preset_id": "preset_5",
    "quality": "1080p"
  }
}
```

---

## Parameter Merging Order

The final `params` object is built by merging (later values override earlier):

1. **Base params**: `{ prompt: "...", preset_id: "..." }`
2. **Preset params**: From selected preset (e.g., `{ quality: "1080p", aspect_ratio: "16:9" }`)
3. **Dynamic params**: From operation_specs-driven form fields
4. **Operation-specific params**: Arrays for video_transition, etc.

**Example merge flow for image_to_video:**

```typescript
// Step 1: Base
{ prompt: "Zoom in", preset_id: "preset_2" }

// Step 2: Merge preset params
{ prompt: "Zoom in", preset_id: "preset_2", quality: "720p", aspect_ratio: "16:9" }

// Step 3: Merge dynamic params (from DynamicParamForm)
{ prompt: "Zoom in", preset_id: "preset_2", quality: "720p", aspect_ratio: "16:9", image_url: "https://..." }

// Final params sent to API
```

---

## Provider-Specific Variations

### Pixverse
- Uses `original_video_id` format: `"px_[alphanumeric]"`
- Supports all 5 operation types
- Typical parameters: quality, aspect_ratio, motion_mode

### Sora (future)
- May use different `original_video_id` format
- May expose model selection: `model: "sora-v1.2"`
- May have dimension params: `width: 1920, height: 1080`

Backend should handle provider-specific param mapping via operation_specs.

---

## How to Simulate in Dev Mode

1. **Enable dev validation:**
   ```bash
   # In .env.local
   VITE_CC_DEV_VALIDATE=1
   ```

2. **Open browser console**

3. **Submit a job** - you'll see:
   ```
   [CC-VALIDATION:generateAsset(video_extend)] {
     operation_type: "video_extend",
     params: {
       prompt: "Continue the scene",
       video_url: "https://...",
       quality: "1080p",
       ...
     },
     paramCount: 4,
     requiredFields: ["prompt", "video_url", "quality"]
   }
   ```

4. **Network tab** shows actual POST to `/api/v1/jobs`

---

## Backend Job Response

When the job is created, backend returns:

```json
{
  "id": 42,
  "user_id": 1,
  "workspace_id": null,
  "operation_type": "video_extend",
  "provider_id": "pixverse",
  "params": {
    "prompt": "Continue the scene",
    "original_video_id": "px_abc123",
    "quality": "1080p"
  },
  "status": "queued",
  "error_message": null,
  "retry_count": 0,
  "priority": 0,
  "parent_job_id": null,
  "scheduled_at": null,
  "created_at": "2025-01-15T10:30:00Z",
  "started_at": null,
  "completed_at": null
}
```

Frontend stores this with `originalParams` for retry capability.
