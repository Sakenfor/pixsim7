# Pixverse Sync and Generation Drift Analysis

Generated: 2025-12-05

## Overview

This document analyzes potential drift between the **Pixverse asset sync workflow** (Task 119) and the **standard generation pipeline** for creating Pixverse videos/images. The goal is to identify inconsistencies that could cause lineage, metadata, or asset management issues.

---

## System Paths Compared

### Path A: Generation Pipeline (Real-time)

```
User triggers generation request
  ↓
POST /api/v1/generations (CreateGenerationRequest)
  ↓
GenerationService.create_generation()
  ↓
PixverseProvider.execute() → provider_job_id
  ↓
StatusPoller monitors until COMPLETED
  ↓
Asset created via Generation completion handler
  ↓
AssetEnrichmentService._extract_and_register_embedded()
  ↓
Lineage created inline (parent images → child video)
```

**Key characteristics:**
- Asset created **after** video is ready (has `video_url`, dimensions)
- `media_metadata` populated from status check result
- Lineage created immediately from embedded asset extraction
- `source_generation_id` links Asset to Generation record
- Provider account association is direct (from generation context)

### Path B: Sync Pipeline (Retrospective Import)

```
User clicks "Scan Library" in Provider Settings
  ↓
GET /providers/pixverse/accounts/{id}/sync-dry-run
  ↓
User clicks "Import Missing Assets"
  ↓
POST /providers/pixverse/accounts/{id}/sync-assets
  ↓
client.list_videos() / client.list_images()
  ↓
Assets created via add_asset() with full provider payload
  ↓
NO LINEAGE CREATED (deferred)
  ↓
User clicks "Rebuild Lineage"
  ↓
POST /lineage/refresh
  ↓
LineageRefreshService.refresh_asset_lineage()
  ↓
AssetEnrichmentService._extract_and_register_embedded()
  ↓
Lineage created from stored media_metadata
```

**Key characteristics:**
- Asset created **before** lineage (two-step process)
- `media_metadata` contains **full Pixverse payload** from list API
- Lineage created **separately** via manual refresh
- NO `source_generation_id` (imported, not generated)
- Provider account association is explicit in sync call

---

## Drift Analysis

### 1. Media Metadata Shape

| Aspect | Generation Pipeline | Sync Pipeline | Risk |
|--------|-------------------|---------------|------|
| **Source** | `check_status()` result | `list_videos()` payload | Different API responses |
| **Fields** | Status-focused (url, dimensions) | Full video metadata | Extra/missing fields |
| **Nesting** | Flat structure | Provider-native nesting | Parser assumptions |

**Finding:** ✅ LOW RISK

The `pixverse_extractor.build_embedded_from_pixverse_metadata()` function is used by **both** paths:
- Generation: Called via `_extract_and_register_embedded()` after asset creation
- Sync: Called via `LineageRefreshService` after manual import

The extractor handles both nested and flat metadata shapes via `normalize_metadata()` and `extract_source_image_urls()`.

**Recommendation:** Ensure any new Pixverse payload fields are handled in the extractor to maintain parity.

### 2. Lineage Creation Timing

| Aspect | Generation Pipeline | Sync Pipeline |
|--------|-------------------|---------------|
| **When** | Immediate (inline) | Deferred (manual) |
| **Idempotency** | Single pass | `clear_existing` option |
| **Parent assets** | Created if missing | Created if missing |

**Finding:** ⚠️ MEDIUM RISK

The two-step sync workflow (import → rebuild lineage) means:
- Users may forget to rebuild lineage after importing
- Assets exist without lineage for a period
- UI may show orphaned videos until lineage is rebuilt

**Mitigation:**
- UI clearly labels "Import Missing Assets" as step 1 of 2
- "Rebuild Lineage" button is prominent and explains its purpose
- Future: Consider optional auto-lineage flag in sync endpoint

### 3. Asset Identity (provider_asset_id)

| Aspect | Generation Pipeline | Sync Pipeline |
|--------|-------------------|---------------|
| **Video ID** | From `execute()` result | From `list_videos()` |
| **ID field** | `video.id` | Extracted via `_extract_video_id()` |
| **Format** | String | String (after extraction) |

**Finding:** ✅ LOW RISK

Both paths extract video IDs using consistent logic. The `_extract_video_id()` helper tries `video_id`, `VideoId`, `id` keys, matching SDK behavior.

**Note:** The sync path uses the same extraction logic as `dev_pixverse_sync.py`, ensuring consistency.

### 4. Source Generation ID

| Aspect | Generation Pipeline | Sync Pipeline |
|--------|-------------------|---------------|
| **Has ID** | Yes (from Generation) | No |
| **Traceability** | Full generation history | Provider-only history |

**Finding:** ⚠️ ACCEPTABLE GAP

Synced assets don't have a `source_generation_id` because they weren't created through our generation system. This is intentional - we're importing historical content.

**Consideration:** If analytics need to distinguish "generated here" vs "imported", query by `source_generation_id IS NULL`.

### 5. Embedded Parent Asset Creation

| Aspect | Generation Pipeline | Sync Pipeline |
|--------|-------------------|---------------|
| **Deduplication** | Via `add_asset()` | Via `add_asset()` |
| **Provider ID** | Inherited from child | Inherited from child |
| **Account ID** | Inherited from child | Inherited from child |

**Finding:** ✅ NO DRIFT

Both paths use `add_asset()` from `asset_factory.py` for parent asset creation, ensuring consistent deduplication (by provider_id+provider_asset_id, sha256, or remote_url).

### 6. Operation Type Mapping

| Create Mode | Relation Type | Operation Type | Handled? |
|-------------|---------------|----------------|----------|
| `transition` | TRANSITION_INPUT | video_transition | ✅ Yes |
| `fusion` | FUSION_CHARACTER/BACKGROUND/REFERENCE | fusion | ✅ Yes |
| `extend` | SOURCE_VIDEO | video_extend | ✅ Yes |
| (default) | SOURCE_IMAGE | image_to_video | ✅ Yes |

**Finding:** ✅ NO DRIFT

The `pixverse_extractor.build_embedded_from_pixverse_metadata()` function correctly maps all Pixverse operation modes to our domain types. Both pipelines use this same function.

---

## Identified Gaps

### Gap 1: No Generation Record for Synced Assets

**Status:** By Design

Synced assets represent content created outside our system. Creating synthetic Generation records would:
- Pollute generation analytics
- Create false parameter/prompt history
- Complicate lineage interpretation

**Resolution:** Accept this gap. Query patterns should handle nullable `source_generation_id`.

### Gap 2: Lineage Not Auto-Created on Import

**Status:** By Design (Task 119 Spec)

The task explicitly decoupled import from lineage:
> "Do **not** create lineage in this step – keep it purely an 'Asset inventory' operation."

**Resolution:** UI guides users through the two-step workflow. Consider future enhancement for optional auto-lineage.

### Gap 3: Image Sync Less Tested

**Status:** Minor Gap

The `list_images()` API is newer and less exercised. Image payloads may have different metadata structures than videos.

**Resolution:** Test image sync with real Pixverse accounts. Add error handling for unexpected payload shapes.

---

## Recommendations

### Short-term (No Code Changes)

1. **Document** the two-step sync workflow in user-facing help text
2. **Monitor** lineage rebuild logs for extractor failures
3. **Test** image import with production Pixverse accounts

### Medium-term (Future Tasks)

1. **Optional auto-lineage**: Add `create_lineage: bool` flag to sync-assets endpoint
2. **Sync progress tracking**: For large libraries, consider background job with progress
3. **Incremental sync**: Track last sync timestamp, only fetch newer items

### Long-term (Architecture)

1. **Unified asset ingestion**: Consider a single `AssetIngestionService` that handles both generation completion and external import
2. **Provider-agnostic sync**: Generalize sync workflow for other providers (Sora, etc.)

---

## Conclusion

**Overall Drift Level: LOW**

The Pixverse sync and generation pipelines share critical components:
- ✅ Same `pixverse_extractor` for metadata parsing
- ✅ Same `add_asset()` for deduplication
- ✅ Same `create_lineage_links()` for lineage
- ✅ Same `AssetEnrichmentService._extract_and_register_embedded()` for parent registration

The intentional differences (deferred lineage, no generation record) are documented design decisions, not accidental drift.

**Action Items:**
- [ ] Test image sync with production accounts
- [ ] Consider auto-lineage option for v2
- [ ] Add help text to UI explaining two-step workflow
