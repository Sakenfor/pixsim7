# Generation Pipeline Concept Drift Audit Report
**Date:** 2025-12-05
**Scope:** Generation pipeline (generation_type, OperationType, provider mappings)
**Type:** Read-only analysis

---

## Executive Summary

This audit examined the generation pipeline for concept drift across frontend, backend, and provider layers. **Three critical inconsistencies were identified** that could lead to incorrect operation execution and asset misclassification:

1. **Missing frontend mappings:** `text_to_image` and `video_extend` operations have no explicit mapping and incorrectly default to `TEXT_TO_VIDEO`
2. **Media type ambiguity:** `IMAGE_TO_IMAGE` operations may be misclassified as `VIDEO` assets due to field naming inconsistencies
3. **Type definition mismatch:** Frontend UI offers `text_to_image` operation but TypeScript interface doesn't include it

---

## 1. Concept Inventory

### 1.1 Backend: generation_type Values

**Source:** `generation_schemas.py:91`

Allowed `generation_type` strings in `GenerationNodeConfigSchema`:
- `transition`
- `variation`
- `dialogue`
- `environment`
- `npc_response`
- `image_edit`
- `fusion`

### 1.2 Backend: OperationType Enum

**Source:** `enums.py:32-40`

```python
class OperationType(str, Enum):
    TEXT_TO_IMAGE = "text_to_image"
    IMAGE_TO_IMAGE = "image_to_image"
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    VIDEO_EXTEND = "video_extend"
    VIDEO_TRANSITION = "video_transition"
    FUSION = "fusion"
```

### 1.3 Backend: Central Mapping Registry

**Source:** `operation_mapping.py:15-32`

```python
GENERATION_TYPE_OPERATION_MAP = {
    "transition": OperationType.VIDEO_TRANSITION,
    "variation": OperationType.TEXT_TO_VIDEO,
    "dialogue": OperationType.TEXT_TO_VIDEO,
    "environment": OperationType.TEXT_TO_VIDEO,
    "npc_response": OperationType.IMAGE_TO_VIDEO,
    "image_edit": OperationType.IMAGE_TO_IMAGE,
    "fusion": OperationType.FUSION,
}
```

**Fallback behavior:** Unknown `generation_type` defaults to `TEXT_TO_VIDEO` (line 41)

### 1.4 Provider: Pixverse Supported Operations

**Source:** `pixverse.py:116-125`

```python
supported_operations = [
    OperationType.TEXT_TO_IMAGE,
    OperationType.IMAGE_TO_IMAGE,
    OperationType.TEXT_TO_VIDEO,
    OperationType.IMAGE_TO_VIDEO,
    OperationType.VIDEO_EXTEND,
    OperationType.VIDEO_TRANSITION,
    OperationType.FUSION,
]
```

### 1.5 Frontend: Operation Type Mapping

**Source:** `controlCenter.ts:25-44`

```typescript
function mapOperationToGenerationType(operationType?: string) {
  switch (operationType) {
    case 'video_transition': return 'transition';
    case 'image_to_video': return 'npc_response';
    case 'image_to_image': return 'image_edit';
    case 'dialogue': return 'dialogue';
    case 'environment': return 'environment';
    case 'fusion': return 'fusion';
    default: return 'variation';  // ⚠️ Fallback for unmapped operations
  }
}
```

### 1.6 Summary Table

| generation_type | OperationType (registry) | Used in Frontend? | Notes |
|-----------------|-------------------------|-------------------|-------|
| transition | VIDEO_TRANSITION | ✅ Yes (`video_transition`) | Aligned |
| variation | TEXT_TO_VIDEO | ✅ Yes (default fallback) | Used for text_to_video, **also incorrectly for text_to_image and video_extend** |
| dialogue | TEXT_TO_VIDEO | ✅ Yes | Aligned |
| environment | TEXT_TO_VIDEO | ✅ Yes | Aligned |
| npc_response | IMAGE_TO_VIDEO | ✅ Yes (`image_to_video`) | Aligned |
| image_edit | IMAGE_TO_IMAGE | ✅ Yes (`image_to_image`) | Aligned |
| fusion | FUSION | ✅ Yes (`fusion`) | Aligned |
| *(not in registry)* | TEXT_TO_IMAGE | ⚠️ **Missing mapping** | Frontend offers this operation but maps to wrong type |
| *(not in registry)* | VIDEO_EXTEND | ⚠️ **Missing mapping** | Frontend offers this operation but maps to wrong type |

---

## 2. Mapping Consistency Issues

### 2.1 Critical Issue: Missing Frontend Mappings

**Problem:** Two frontend operation types have no explicit mapping in `mapOperationToGenerationType()` and incorrectly fall through to the default case (`variation` → `TEXT_TO_VIDEO`).

#### Issue A: `text_to_image` Operation

**Flow:**
1. User selects "Text → Img" in UI (`QuickGenerateModule.tsx:207`)
2. Frontend `operationType`: `text_to_image`
3. `mapOperationToGenerationType('text_to_image')` → `'variation'` (default case)
4. Backend receives `generation_type: 'variation'`
5. `resolve_operation_type('variation')` → `OperationType.TEXT_TO_VIDEO` ❌

**Expected:** `OperationType.TEXT_TO_IMAGE`

**Impact:** Attempting to generate an image results in a video generation request, which will fail or produce incorrect results.

**Files affected:**
- `controlCenter.ts:25-44` (missing case)
- `operation_mapping.py:15-32` (no mapping for text_to_image generation_type)

#### Issue B: `video_extend` Operation

**Flow:**
1. User selects "Extend" in UI (`QuickGenerateModule.tsx:211`)
2. Frontend `operationType`: `video_extend`
3. `mapOperationToGenerationType('video_extend')` → `'variation'` (default case)
4. Backend receives `generation_type: 'variation'`
5. `resolve_operation_type('variation')` → `OperationType.TEXT_TO_VIDEO` ❌

**Expected:** `OperationType.VIDEO_EXTEND`

**Impact:** Video extension requests are misrouted as text-to-video operations, causing failures or incorrect behavior.

**Files affected:**
- `controlCenter.ts:25-44` (missing case)
- `operation_mapping.py:15-32` (no mapping for video_extend generation_type)

### 2.2 Type Definition Mismatch

**Source:** `controlCenter.ts:9`

```typescript
operationType?: 'text_to_video' | 'image_to_video' | 'image_to_image' |
                'video_extend' | 'video_transition' | 'fusion';
```

**Issue:** TypeScript interface `GenerateAssetRequest` does not include `'text_to_image'` in the union type, but the UI offers this option (`QuickGenerateModule.tsx:207`).

**Impact:** Type safety is violated; TypeScript won't catch bugs related to text_to_image handling.

---

## 3. IMAGE vs VIDEO Semantics

### 3.1 Canonicalization Logic

**Source:** `creation_service.py:489-522`

| Operation | Input Field(s) | Canonical Field(s) | Notes |
|-----------|---------------|-------------------|-------|
| `IMAGE_TO_VIDEO` | `image_url` | `image_url` (singular) | ✅ Correct |
| `IMAGE_TO_IMAGE` | `image_url` or `image_urls` | `image_urls` (list) | ✅ Converts single URL to list |
| `VIDEO_EXTEND` | `video_url`, `original_video_id` | `video_url`, `original_video_id` | ✅ Correct |
| `VIDEO_TRANSITION` | `image_urls`, `prompts` | `image_urls`, `prompts` | ✅ Correct |
| `FUSION` | `fusion_assets` | `fusion_assets` | ✅ Correct |

### 3.2 Provider Expectations (Pixverse)

**Source:** `pixverse.py:127-215`, `pixverse_operations.py:185-406`

| Operation | Provider Method | Expected Params | Returns |
|-----------|----------------|----------------|---------|
| `IMAGE_TO_VIDEO` | `client.create()` | `prompt`, `image_url`, `model`, `quality`, `duration`, ... | Video object |
| `IMAGE_TO_IMAGE` | `client.api._image_ops.create_image()` | `prompt`, `image_urls`, `model`, `quality`, `aspect_ratio`, ... | Image object |
| `VIDEO_EXTEND` | `client.extend()` | `prompt`, `video_url`, `original_video_id`, `quality`, ... | Video object |
| `VIDEO_TRANSITION` | `client.transition()` | `image_urls`, `prompts`, `quality`, `duration` | Video object |
| `FUSION` | `client.fusion()` | `prompt`, `fusion_assets`, `quality`, `duration`, `seed` | Video object |

✅ **Alignment:** Canonical params match provider expectations for all operations.

### 3.3 Media Type Classification Issue

**Problem:** Asset creation may misclassify `IMAGE_TO_IMAGE` operations as `VIDEO` assets.

**Root Cause Analysis:**

1. **Provider execution** (`pixverse_operations.py:108-128`):
   - For ALL operations (including `IMAGE_TO_IMAGE`), the result is stored in a variable named `video`
   - Line 114: `video = await self._generate_image_to_image(client, params)`
   - Line 150: `video_url=getattr(video, 'url', None)` extracts URL from image object

2. **Submission storage** (`provider_service.py:96-102`):
   ```python
   submission.response = {
       "provider_job_id": result.provider_job_id,
       "provider_video_id": result.provider_video_id,  # Even for images!
       "status": result.status.value,
       "video_url": result.video_url,  # Image URL stored as "video_url"
       ...
   }
   ```

3. **Asset creation** (`core_service.py:106-116`):
   ```python
   if media_type_str:
       media_type = MediaType(media_type_str)
   elif response.get("image_url") or response.get("provider_image_id"):
       media_type = MediaType.IMAGE  # ✅ Correct path
   elif response.get("video_url") or response.get("provider_video_id"):
       media_type = MediaType.VIDEO  # ⚠️ IMAGE_TO_IMAGE hits this!
   else:
       media_type = MediaType.VIDEO  # Default
   ```

**Issue:** Because `IMAGE_TO_IMAGE` results are stored with field names `video_url` and `provider_video_id` (not `image_url`/`provider_image_id`), they are misclassified as `VIDEO` unless the response includes an explicit `media_type` field.

**Mitigation:** The SDK's image response might include a `media_type` field that prevents misclassification, but this is not guaranteed and creates fragility.

**Files affected:**
- `pixverse_operations.py:72-159` (uses `video_url` for all operations)
- `provider_service.py:96-102` (stores as `video_url` and `provider_video_id`)
- `core_service.py:106-116` (classification logic)

---

## 4. Canonicalization vs Provider Expectations

### 4.1 Provider-Specific Settings Convention

**Convention** (documented in `controlCenter.ts:48-54`):
- Provider-specific settings are nested under `style.<provider_id>`
- Example: `style.pixverse = { model, quality, off_peak, audio }`
- Backend's `_canonicalize_structured_params` extracts these to top-level canonical fields

**Implementation:**
- Frontend: `buildGenerationConfig()` in `controlCenter.ts:55-148`
- Backend: `_canonicalize_structured_params()` in `creation_service.py:412-535`

✅ **Status:** Convention is consistently implemented in both frontend and backend.

### 4.2 Per-Operation Field Coverage

| Operation | Pixverse Expects | Canonicalization Provides | Status |
|-----------|-----------------|--------------------------|--------|
| `TEXT_TO_VIDEO` | `prompt`, `model`, `quality`, `duration`, `aspect_ratio`, `seed`, `motion_mode`, `negative_prompt`, `style`, `template_id`, `multi_shot`, `audio`, `off_peak` | All expected fields | ✅ Complete |
| `IMAGE_TO_VIDEO` | `prompt`, `model`, `quality`, `duration`, `seed`, `motion_mode`, `negative_prompt`, `camera_movement`, `style`, `image_url`, `multi_shot`, `audio`, `off_peak` | All expected fields | ✅ Complete |
| `IMAGE_TO_IMAGE` | `prompt`, `model`, `quality`, `strength`, `seed`, `style`, `negative_prompt`, `image_urls` | All expected fields | ✅ Complete |
| `VIDEO_EXTEND` | `prompt`, `quality`, `seed`, `video_url`, `original_video_id`, `multi_shot`, `audio`, `off_peak` | All expected fields | ✅ Complete |
| `VIDEO_TRANSITION` | `image_urls`, `prompts`, `quality`, `duration` | All expected fields | ✅ Complete |
| `FUSION` | `prompt`, `fusion_assets`, `quality`, `duration`, `seed` | All expected fields | ✅ Complete |

**Potential dead weight:** The `pacing` field from `style.pacing` is extracted to `canonical["pacing"]` (`creation_service.py:467`) but Pixverse doesn't use it directly. However, `motion_mode` may be derived from pacing in the frontend (`controlCenter.ts:68-70`), so this is intentional translation, not dead weight.

---

## 5. Quick Generate Flow Trace

### 5.1 Flow Diagram

```
[User selects operation in QuickGenerateModule.tsx]
  ↓ operationType (e.g., 'image_to_video')
[buildGenerationRequest() in quickGenerateLogic.ts]
  ↓ validates params, returns merged params
[generateAsset() in controlCenter.ts]
  ↓ mapOperationToGenerationType()
  ↓ generation_type (e.g., 'npc_response')
  ↓ buildGenerationConfig()
  ↓ GenerationNodeConfig with nested provider settings
[createGeneration() → POST /generations]
  ↓
[Backend: create_generation() in generations.py:43-141]
  ↓ resolve_operation_type(generation_type)
  ↓ OperationType (e.g., IMAGE_TO_VIDEO)
  ↓ _canonicalize_structured_params()
  ↓ canonical_params with top-level provider fields
[GenerationCreationService.create_generation()]
  ↓ validate provider supports operation
  ↓ create Generation record
  ↓ enqueue for processing
```

### 5.2 Example Traces

#### Trace A: image_to_video (✅ Correct)

1. Frontend: `operationType = 'image_to_video'`
2. `mapOperationToGenerationType('image_to_video')` → `'npc_response'`
3. Backend receives: `generation_type = 'npc_response'`
4. `resolve_operation_type('npc_response')` → `OperationType.IMAGE_TO_VIDEO`
5. Pixverse provider executes: `client.create(prompt, image_url, ...)`
6. Result: Video asset created ✅

#### Trace B: text_to_image (❌ Incorrect)

1. Frontend: `operationType = 'text_to_image'`
2. `mapOperationToGenerationType('text_to_image')` → `'variation'` (default fallback)
3. Backend receives: `generation_type = 'variation'`
4. `resolve_operation_type('variation')` → `OperationType.TEXT_TO_VIDEO`
5. Pixverse provider executes: `client.create(prompt, ...)` for **video** generation
6. Result: Attempted video generation instead of image ❌

#### Trace C: video_extend (❌ Incorrect)

1. Frontend: `operationType = 'video_extend'`
2. `mapOperationToGenerationType('video_extend')` → `'variation'` (default fallback)
3. Backend receives: `generation_type = 'variation'`
4. `resolve_operation_type('variation')` → `OperationType.TEXT_TO_VIDEO`
5. Pixverse provider executes: `client.create(prompt, ...)` for **text-to-video** generation
6. Result: Incorrect operation type, missing `video_url` parameter ❌

---

## 6. Invariants and Potential Violations

### 6.1 Defined Invariants

| Invariant | Description | Validation Location | Status |
|-----------|-------------|-------------------|--------|
| **INV-1** | If `operation_type == IMAGE_TO_IMAGE`, then `canonical_params.image_urls` is non-empty | Frontend: `quickGenerateLogic.ts:68-107`<br>Backend: ❌ Missing | ⚠️ Frontend only |
| **INV-2** | If `operation_type == IMAGE_TO_VIDEO`, then inputs contain at least one seed_image | Backend: `creation_service.py:129-131` (legacy params only)<br>Structured params: ❌ Missing | ⚠️ Partial validation |
| **INV-3** | If a generation completes, `MediaType.IMAGE` assets come from image operations, `MediaType.VIDEO` from video operations | `core_service.py:106-116` | ⚠️ **Violatable** (see Section 3.3) |

### 6.2 Violation Paths

#### Violation A: IMAGE_TO_IMAGE → VIDEO Asset

**Path:**
1. User requests `IMAGE_TO_IMAGE` operation
2. Provider returns image object with `url` field
3. `pixverse_operations.py:150` stores as `video_url` in `GenerationResult`
4. `provider_service.py:99` stores as `video_url` in submission response
5. `core_service.py:110-116` checks for `image_url` (not present), then `video_url` (present) → classifies as `VIDEO`

**Result:** Image generation creates a `VIDEO` asset in the database ❌

**Likelihood:** High if SDK's image response doesn't include explicit `media_type` field

#### Violation B: Missing Input Validation (Structured Params)

**Path:**
1. Malformed or malicious client sends `IMAGE_TO_VIDEO` request with no `image_url`
2. Frontend validation bypassed
3. Backend `_canonicalize_structured_params()` does not validate required fields
4. Provider receives request with missing `image_url` → API error

**Result:** Late failure at provider level instead of early validation

**Likelihood:** Low (requires bypassing frontend), but possible

---

## 7. Recommendations

### 7.1 Critical Fixes (High Priority)

1. **Add missing frontend mappings** (`controlCenter.ts:25-44`):
   ```typescript
   case 'text_to_image': return 'image_to_text';  // New generation_type
   case 'video_extend': return 'video_extend_request';  // New generation_type
   ```
   **AND** add corresponding entries to `GENERATION_TYPE_OPERATION_MAP` (`operation_mapping.py`):
   ```python
   "image_to_text": OperationType.TEXT_TO_IMAGE,
   "video_extend_request": OperationType.VIDEO_EXTEND,
   ```

2. **Fix TypeScript interface** (`controlCenter.ts:9`):
   ```typescript
   operationType?: 'text_to_image' | 'text_to_video' | 'image_to_video' |
                   'image_to_image' | 'video_extend' | 'video_transition' | 'fusion';
   ```

3. **Fix media type classification** (`pixverse_operations.py:72-159`, `provider_service.py:96-102`):
   - Option A: Add `media_type` field to `GenerationResult` and set explicitly based on `operation_type`
   - Option B: Use separate `image_url`/`video_url` fields in `GenerationResult` based on operation
   - Option C: Always include explicit `media_type` in submission response metadata

### 7.2 Defensive Improvements (Medium Priority)

4. **Add backend validation for structured params** (`creation_service.py:363-410`):
   - Validate `IMAGE_TO_VIDEO` has `image_url`
   - Validate `IMAGE_TO_IMAGE` has `image_urls`
   - Validate `VIDEO_EXTEND` has `video_url` or `original_video_id`
   - Validate `VIDEO_TRANSITION` has `image_urls` and `prompts` with correct counts

5. **Add operation_type fallback in asset creation** (`core_service.py:106-116`):
   ```python
   # After checking response fields, check metadata.operation_type
   if not media_type_str and not (image_url or provider_image_id or video_url or provider_video_id):
       operation_type = metadata.get("operation_type")
       if operation_type in ["text_to_image", "image_to_image"]:
           media_type = MediaType.IMAGE
       elif operation_type in ["text_to_video", "image_to_video", "video_extend", "video_transition", "fusion"]:
           media_type = MediaType.VIDEO
   ```

### 7.3 Documentation (Low Priority)

6. **Document generation_type mapping** in `operation_mapping.py`:
   - Add comments explaining which frontend operations map to each `generation_type`
   - Document fallback behavior for unknown types

7. **Add schema validation test** to verify:
   - All `generation_type` values in schema have registry entries
   - All OperationType values are in Pixverse `supported_operations` (or explicitly documented as unsupported)
   - All frontend operation types have explicit mappings (no silent fallbacks)

---

## 8. Appendix: File References

### Backend Files
- `operation_mapping.py:15-32` - Central mapping registry
- `generation_schemas.py:91` - generation_type schema constraint
- `enums.py:32-40` - OperationType enum definition
- `generations.py:43-141` - Unified generations API endpoint
- `creation_service.py:51-331` - Generation creation and canonicalization
- `creation_service.py:412-535` - Structured params canonicalization
- `pixverse.py:116-125` - Supported operations
- `pixverse.py:127-215` - Parameter mapping
- `pixverse_operations.py:72-159` - Provider execution
- `core_service.py:49-203` - Asset creation from submission
- `core_service.py:106-116` - Media type classification logic

### Frontend Files
- `controlCenter.ts:25-44` - Operation type mapping
- `controlCenter.ts:55-148` - GenerationNodeConfig builder
- `quickGenerateLogic.ts:46-244` - Request validation and building
- `QuickGenerateModule.tsx:207-213` - UI operation selector

---

**End of Report**
