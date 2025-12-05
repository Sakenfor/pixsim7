**Task 119: Pixverse Asset Sync & Lineage Refresh Controls**

> **For Agents**
> - Add a first-class, manual workflow for syncing Pixverse videos/images into Assets, and for rebuilding lineage from stored Pixverse metadata.
> - Use this when touching Pixverse provider sync flows, Asset import from Pixverse, or lineage regeneration logic.
> - Target files:
>   - Backend: `pixsim7/backend/main/api/v1/dev_pixverse_sync.py`, new v1 sync/lineage routes, `services/asset/lineage_refresh_service.py`, Pixverse adapter/extractor files.
>   - Frontend: `apps/main/src/components/provider/ProviderSettingsPanel.tsx`, related API client helpers.

---

## Context

We now have:

- A Pixverse provider adapter using `pixverse-py`:
  - `pixsim7/backend/main/services/provider/adapters/pixverse.py`
  - `pixsim7/backend/main/services/provider/adapters/pixverse_operations.py`
  - Session management: `pixverse_session.py`, `pixverse_session_manager.py`

- A **dev-only** Pixverse dry-run endpoint for videos:
  - `pixsim7/backend/main/api/v1/dev_pixverse_sync.py`
  - Uses `PixverseProvider._create_client(account)` and `client.list_videos(...)`
  - Compares remote video IDs against local `Asset.provider_asset_id` for the current user/provider, but does not import or write anything.

- A Pixverse embedded asset extractor that understands Pixverse metadata:
  - `pixsim7/backend/main/services/asset/embedded_extractors/pixverse_extractor.py`
  - Handles:
    - Base cases (image_to_video / text_to_video) via `customer_img_url`, `image_url`, `customer_paths.customer_img_urls`.
    - **Transitions** (`create_mode == "transition"`):
      - Uses `customer_paths.customer_img_urls` as parents.
      - Attaches `pixverse_transition` metadata: `prompts`, `translate_prompts`, `durations`, `first_frame_url`, `last_frame_url`, `image_index`, `source_video_id`.
      - Marks `relation_type="TRANSITION_INPUT"`, `operation_type="video_transition"`.
    - **Fusion** (`create_mode == "fusion"`):
      - Uses `customer_paths.customer_img_urls` as parents.
      - Uses `fusion_name_list`, `fusion_type_list`, `original_prompt` to build `pixverse_fusion` metadata per image, including `fusion_name`, `fusion_entry_type`, `image_index`, `source_video_id`.
      - Marks `relation_type` as `FUSION_CHARACTER` / `FUSION_BACKGROUND` / `FUSION_REFERENCE` based on `fusion_type_list`, and `operation_type="fusion"`.
    - **Extend** (`create_mode == "extend"`):
      - Adds a parent video embedded item using `customer_paths.customer_video_url`, `customer_video_path`, `customer_video_duration`, `customer_video_last_frame_url`, and `original_video_id`.
      - Attaches `pixverse_extend` metadata, and marks `relation_type="SOURCE_VIDEO"`, `operation_type="video_extend"`.

- Asset and lineage domain:
  - `pixsim7/backend/main/domain/asset.py` – core Asset model, with `media_metadata` for provider‑specific payloads.
  - `pixsim7/backend/main/domain/asset_lineage.py` – `AssetLineage` (parent→child edges) with `relation_type` and `operation_type`.
  - `pixsim7/backend/main/domain/relation_types.py` – constants like `SOURCE_IMAGE`, `TRANSITION_INPUT`, `SOURCE_VIDEO`, `FUSION_*`.

- Asset creation and enrichment:
  - `pixsim7/backend/main/services/asset/asset_factory.py`:
    - `add_asset(...)` handles dedup and creation of Assets based on provider tuple / sha256 / remote_url.
    - `create_lineage_links(...)` writes `AssetLineage` rows.
  - `pixsim7/backend/main/services/asset/enrichment_service.py`:
    - `_extract_and_register_embedded(asset, user)`:
      - Looks up provider via registry and calls `provider.extract_embedded_assets(asset.provider_asset_id, asset.media_metadata or None)`.
      - For each embedded item:
        - Creates/upserts parent Assets via `add_asset`, passing through optional `media_metadata` from the item.
        - Determines lineage relation/operation:
          - Uses `item["relation_type"]` if present; otherwise defaults to `SOURCE_IMAGE` for images, `DERIVATION` for videos.
          - Uses `item["operation_type"]` if present (coerced into `OperationType`); otherwise defaults to `IMAGE_TO_VIDEO` for video children, `TEXT_TO_IMAGE` for image children.
        - Writes `AssetLineage` linking parent → child with correct `relation_type` and `operation_type`.

- A new lineage helper for manual rebuilds:
  - `pixsim7/backend/main/services/asset/lineage_refresh_service.py`:
    - `refresh_asset_lineage(asset_id, provider_id=None, clear_existing=True)`:
      - Optionally deletes existing `AssetLineage` edges for the child asset.
      - Calls `AssetEnrichmentService._extract_and_register_embedded(...)` to re-create parents and lineage based on `media_metadata` and provider extractors.
      - Returns a summary `{asset_id, provider_id, removed_edges, new_edges, status}`.
    - `refresh_for_assets(asset_ids, provider_id=None, clear_existing=True)` for bulk refresh.

- Frontend Provider Settings UI:
  - `apps/main/src/components/provider/ProviderSettingsPanel.tsx`:
    - Lists providers and their accounts, with per-provider tabs.
    - Shows account stats (jobs, credits) and supports editing/toggling/deleting accounts.
    - Has a "Refresh" button for reloading account capacity/usage.
  - Core panels plugin registers `ProviderSettingsPanel` under “Provider Settings”:
    - `apps/main/src/lib/panels/corePanelsPlugin.tsx`.

- Pixverse image listing endpoint in SDK:
  - `pixverse.api.image.ImageOperations.list_images(...)` calls `POST /creative_platform/image/list/personal`.
  - `PixverseClient.list_images(...)` exposes it to callers.

The missing piece: a first-class, user-visible way to:

1. **Dry-scan** Pixverse videos/images and show local import coverage.
2. **Import missing** Pixverse assets as `Asset` rows (with metadata), without lineage.
3. **Manually rebuild** lineage for those assets from stored Pixverse payloads.
4. Surface these as manual controls in the Provider Settings UI (Pixverse tab).

---

## Goals

1. **Dry sync for Pixverse library**
   - Provide an API to scan Pixverse videos and images for a given Pixverse account and compare them against local Assets for the current user.
   - Return counts and per-item `already_imported` flags, but do not write anything.

2. **Import missing Pixverse assets (no lineage)**
   - Provide an API to create Asset rows for remote videos/images that are missing locally.
   - Attach the full Pixverse payload as `media_metadata` for each Asset.
   - Do not create lineage in this step – keep it purely an “Asset inventory” operation.

3. **Manual lineage rebuild using stored metadata**
   - Expose `LineageRefreshService` through an API that can:
     - Clear existing lineage (optional) and rebuild it from provider metadata via `extract_embedded_assets`.
     - Operate on specific asset IDs or all Assets for a provider/user.
   - Keep this operation explicitly manual (triggered from UI/admin tools, not a scheduled job by default).

4. **Provider Settings UI for Pixverse sync**
   - Add Pixverse‑specific sync & lineage controls to `ProviderSettingsPanel`:
     - “Scan Library” → dry-run sync, update stats.
     - “Import Missing Assets” → import videos/images.
     - “Rebuild Lineage” → call lineage refresh API.
   - Present clear stats and status to the user, and ensure operations are safe and discoverable.

---

## Deliverables

### 1. Backend: Pixverse library sync APIs

Create a new v1 router, e.g. `pixsim7/backend/main/api/v1/pixverse_sync.py`, and register it in the main API routing.

**Endpoints**

1. `GET /providers/pixverse/accounts/{account_id}/sync-dry-run`

   - Auth: requires logged-in user; `ProviderAccount` must belong to current user and have `provider_id == "pixverse"`.
   - Query params:
     - `limit` (int, default 50, 1–200)
     - `offset` (int, default 0, ≥0)
     - `include_images` (bool, default true)
   - Behavior:
     - Load the `ProviderAccount` as in `dev_pixverse_sync.py`.
     - Initialize `PixverseProvider` and client via `_create_client(account)`.
     - For videos:
       - Call `client.list_videos(limit, offset)` (SDK).
       - Extract `video_id` using the same helper logic as `_extract_video_id` in `dev_pixverse_sync`.
       - Build a list of remote items as `{ video_id, raw }`.
       - Query `Asset` for this user/provider to see which `provider_asset_id` values already exist.
     - For images (if `include_images`):
       - Call `client.list_images(limit, offset)`.
       - Extract `image_id` from the payload (matching SDK tests/docs).
       - Build `{ image_id, raw }` and compute which are already imported.
   - Response (example shape):

     ```jsonc
     {
       "provider_id": "pixverse",
       "account_id": 123,
       "limit": 50,
       "offset": 0,
       "videos": {
         "total_remote": 42,
         "existing_count": 30,
         "items": [
           {
             "video_id": "374351749764234",
             "already_imported": true,
             "raw": { ...pixverse payload... }
           },
           ...
         ]
       },
       "images": {
         "total_remote": 20,
         "existing_count": 10,
         "items": [
           {
             "image_id": "371819823766891",
             "already_imported": false,
             "raw": { ...pixverse payload... }
           }
         ]
       }
     }
     ```

   - No DB writes; purely inspection.

2. `POST /providers/pixverse/accounts/{account_id}/sync-assets`

   - Auth: same as dry-run.
   - Body:

     ```jsonc
     {
       "mode": "videos" | "images" | "both",
       "limit": 100,
       "offset": 0
     }
     ```

   - Behavior:
     - For videos (when mode includes videos):
       - Use the same `list_videos` logic as dry-run.
       - For each remote video without a corresponding `Asset` (`provider_id="pixverse"`, `provider_asset_id == video_id`, same user):
         - Create (or upsert) an `Asset` with:
           - `user_id = current_user.id`
           - `media_type = MediaType.VIDEO`
           - `provider_id = "pixverse"`
           - `provider_asset_id = str(video_id)`
           - `remote_url = video_url` derived from fields like `customer_video_url` / `video_url` / `url`.
           - `thumbnail_url` from `customer_video_last_frame_url` or `first_frame` / `thumbnail`.
           - `media_metadata = raw_pixverse_payload`.
         - Prefer to use `add_asset(...)` from `asset_factory` to reuse dedup logic and default fields.
     - For images (when mode includes images):
       - Same pattern with `client.list_images`:
         - `media_type = MediaType.IMAGE`, `provider_asset_id = str(image_id)`, `remote_url = image_url`, `media_metadata = raw`.
     - Do **not** trigger lineage enrichment here.
   - Response:

     ```jsonc
     {
       "provider_id": "pixverse",
       "account_id": 123,
       "videos": {
         "created": 12,
         "skipped_existing": 30
       },
       "images": {
         "created": 5,
         "skipped_existing": 10
       }
     }
     ```

---

### 2. Backend: Lineage refresh API

Expose `LineageRefreshService` via a small v1 route, e.g. `pixsim7/backend/main/api/v1/asset_lineage.py`.

**Endpoint**

`POST /assets/lineage/refresh`

- Auth: logged-in user.
- Body variants (support at least these two):

1. Explicit asset IDs:

   ```jsonc
   {
     "asset_ids": [123, 456, 789],
     "clear_existing": true
   }
   ```

2. Filter by provider (and current user):

   ```jsonc
   {
     "provider_id": "pixverse",
     "scope": "current_user",
     "clear_existing": true
   }
   ```

- Behavior:
  - If `asset_ids` present:
    - Call `LineageRefreshService.refresh_for_assets(asset_ids, provider_id=provider_id_if_provided, clear_existing={...})`.
  - Else if `provider_id` + `scope == "current_user"`:
    - Query `Asset.id` where `provider_id == provider_id` and `user_id == current_user.id`.
    - Pass that list into `refresh_for_assets`.
  - Return:

    ```jsonc
    {
      "count": N,
      "results": [
        {
          "asset_id": 123,
          "provider_id": "pixverse",
          "removed_edges": 2,
          "new_edges": 3,
          "status": "ok"
        },
        ...
      ]
    }
    ```

- Do not schedule this automatically; it should only run when explicitly invoked.

---

### 3. Frontend: Provider Settings Pixverse sync controls

Enhance `ProviderSettingsPanel` to surface Pixverse sync & lineage controls.

**API helpers**

Create a small API helper module, e.g. `apps/main/src/lib/api/pixverseSync.ts`:

- `getPixverseSyncDryRun(accountId: number, params?: { limit?: number; offset?: number; includeImages?: boolean })`
  - Calls `GET /providers/pixverse/accounts/{accountId}/sync-dry-run`.

- `syncPixverseAssets(accountId: number, body: { mode: 'videos' | 'images' | 'both'; limit?: number; offset?: number })`
  - Calls `POST /providers/pixverse/accounts/{accountId}/sync-assets`.

- `refreshAssetLineage(params: { assetIds?: number[]; providerId?: string; clearExisting?: boolean })`
  - Calls `POST /assets/lineage/refresh`.

**UI wiring in ProviderSettingsPanel**

File: `apps/main/src/components/provider/ProviderSettingsPanel.tsx`

When `activeProvider === 'pixverse'`:

- For the selected Pixverse provider tab (and possibly per-account row):
  - Add a sub-section, e.g.:

    ```tsx
    {activeProvider === 'pixverse' && providerData && (
      <PixverseSyncSection providerData={providerData} />
    )}
    ```

  - In `PixverseSyncSection`:
    - Let the user pick an account from `providerData.accounts` (or default to the first account).
    - Show stats from the dry-run response:

      - `Videos: {videos.total_remote} remote / {videos.existing_count} imported`
      - `Images: {images.total_remote} remote / {images.existing_count} imported`

    - Provide manual buttons:

      1. **Scan Library**
         - Calls `getPixverseSyncDryRun(account.id, { limit: 100, includeImages: true })`.
         - Stores stats in local component state and shows them.

      2. **Import Missing Assets**
         - Calls `syncPixverseAssets(account.id, { mode: 'both', limit: 100 })`.
         - On success, shows a toast (“Imported X videos, Y images”) and re-runs Scan Library.

      3. **Rebuild Lineage**
         - Calls `refreshAssetLineage({ providerId: 'pixverse', clearExisting: true })`.
         - On success, shows a toast summarizing `count` and total `new_edges`.

- UX guidelines:
  - Label the section clearly, e.g. “Pixverse Library & Lineage (Manual Tools)”.
  - Use small explanatory text: “These operations do not run automatically; trigger them manually when you’ve added new Pixverse content or want to repair lineage.”
  - Use existing `useToast` or similar for non-intrusive status feedback.

---

## Non-Goals / Constraints

- Do **not** add scheduled or background jobs for sync/lineage; everything should be manually invoked for now.
- Do not change Pixverse generation flows or existing job creation APIs as part of this task.
- Avoid duplicating Pixverse parsing logic; rely on:
  - `pixverse_extractor.build_embedded_from_pixverse_metadata` for transition/fusion/extend.
  - Provider‑agnostic `add_asset` and `create_lineage_links` helpers.

---

## Acceptance Criteria

- Hitting `GET /providers/pixverse/accounts/{id}/sync-dry-run` returns accurate counts and `already_imported` flags for videos and images without modifying the database.
- Hitting `POST /providers/pixverse/accounts/{id}/sync-assets` creates Assets for missing Pixverse videos/images and attaches the full Pixverse payload into `media_metadata`, without creating lineage.
- Hitting `POST /assets/lineage/refresh` triggers `LineageRefreshService` to rebuild lineage for the requested assets, using Pixverse metadata via `extract_embedded_assets`, and reports back per-asset results.
- In the Provider Settings UI, the Pixverse tab exposes:
  - A “Scan Library” button that updates stats from the dry-run API.
  - An “Import Missing Assets” button that imports videos/images and reflects updated stats.
  - A “Rebuild Lineage” button that calls the lineage refresh API and reports a concise summary.
- All new endpoints enforce proper ownership checks (current user must own the ProviderAccount and Assets they operate on).
*** End Patch***!*\
