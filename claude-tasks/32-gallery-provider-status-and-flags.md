**Task: Gallery Provider Status & Flags (Local vs Provider vs Flagged)**

> **For Agents (How to use this file)**
> - This task improves the **Assets/Gallery UI** so it reflects whether an asset:
>   - Was accepted by the provider (Pixverse/OpenAPI),
>   - Was saved locally but provider upload failed,
>   - Or has been flagged / rejected after upload (if available).
> - Use it when you:
>   - Touch asset list APIs or gallery UI.
>   - Work on upload flows (extension, gallery tools).
> - Read these first for context:
>   - `GAMEPLAY_SYSTEMS.md` – asset/quest/inventory conventions
>   - `pixsim7_backend/api/v1/assets.py` – asset list & upload endpoints
>   - `pixsim7_backend/services/upload/upload_service.py` – provider upload behavior and notes
>   - `apps/main/src/routes/Assets.tsx` – main gallery route
>   - `apps/main/src/components/media/MediaCard.tsx` – asset card UI

---

## Context

Currently:

- The Chrome extension badge and some UI surfaces **assumed** that “upload accepted by PixSim7” meant “uploaded to Pixverse/OpenAPI successfully.”
- The backend actually distinguishes:
  - Provider success vs local-only save via `UploadAssetResponse.note`:
    - `"Uploaded to provider successfully"`
    - `"Asset saved locally; provider upload failed: ..."`
- The extension has been updated to use this and now shows:
  - `saved to PixSim7; provider upload failed` when provider upload fails.
- The main gallery UI, however, still only shows provider id (e.g. `pixverse`) and generic status, not whether the provider actually accepted or later flagged the asset.

We want the **Assets/Gallery** view to show a truthful, at-a-glance view of provider status so users are not misled about where media actually lives.

---

## Phase Checklist

- [ ] **Phase 32.1 – Expose Provider Upload Status on Asset DTO**
- [ ] **Phase 32.2 – Add Provider Status Badges in Gallery**
- [ ] **Phase 32.3 – Optional: Flagged/Moderation Status Surfacing**
- [ ] **Phase 32.4 – Filters & Quick-View for Provider Status**
- [ ] **Phase 32.5 – Align Gallery Upload Controls with Extension Semantics**

---

## Phase 32.1 – Expose Provider Upload Status on Asset DTO

**Goal**  
Make backend asset list responses carry a simple, stable provider status that the frontend can render.

**Scope**

- Backend asset API:
  - `pixsim7_backend/api/v1/assets.py`
- Asset schema:
  - `pixsim7_backend/shared/schemas/asset_schemas.py` (or equivalent)

**Key Steps**

1. Add a derived field to the asset response model, e.g.:
   - `provider_status: "ok" | "local_only" | "unknown"` (or similar).
2. Derive it from existing fields:
   - If `asset.provider_asset_id` is present and last upload note did not indicate failure → `"ok"`.
   - If `provider_asset_id` is null but asset exists and note starts with `"Asset saved locally; provider upload failed"` → `"local_only"`.
   - Otherwise → `"unknown"` (or omitted).
3. Make sure `/api/v1/assets` responses include this field for each asset.

**Status:** `[ ]` Not started

---

## Phase 32.2 – Add Provider Status Badges in Gallery

**Goal**  
Visually differentiate local-only assets vs provider-accepted assets in the gallery UI.

**Scope**

- Gallery route and components:
  - `apps/main/src/routes/Assets.tsx`
  - `apps/main/src/components/media/MediaCard.tsx`

**Key Steps**

1. Thread the new `provider_status` field through:
   - From `/api/v1/assets` hook (`useAssets`) into `AssetsRoute`.
   - From `AssetsRoute` into `MediaCard` props.
2. In `MediaCard`, add a small badge or icon:
   - For `"ok"`: e.g. `Provider OK` or a green check.
   - For `"local_only"`: e.g. `Local only` or a warning badge (tooltip: “Provider upload failed; stored locally in PixSim7”).
   - For `"unknown"`: no extra badge, or a neutral icon.
3. Keep the design minimal but clear; avoid cluttering the card:
   - Use existing `Badge` / `StatusBadge` components where possible.
   - Prefer short labels and tooltips over long inline text.

**Status:** `[ ]` Not started

---

## Phase 32.3 – Optional: Flagged / Moderation Status Surfacing

**Goal**  
If the provider later flags or rejects assets (moderation, policy), surface that clearly in the gallery.

**Scope**

- Backend:
  - Any job/status tables where provider moderation/flag status is recorded.
- Frontend:
  - Same gallery components as Phase 32.2.

**Key Steps**

1. Identify where provider “flagged” status is stored (jobs, provider metadata, or asset fields).
2. Expose a simple flag on asset responses, e.g. `provider_flagged: bool` and optional `provider_flag_reason`.
3. Add a distinct badge in the gallery:
   - E.g. `Flagged` (red), with tooltip showing the reason if available.
4. Ensure that this badge is visually distinct from “local only” vs “ok” so users can understand:
   - “Local only” = PixSim7 kept the file, provider never accepted it.
   - “Flagged” = provider accepted but later marked it as problematic.

**Status:** `[ ]` Not started

---

## Phase 32.4 – Filters & Quick-View for Provider Status

**Goal**  
Make it easy to quickly see and filter assets by provider status (e.g. “show me all local-only assets”).

**Scope**

- Asset filters and gallery toolbar:
  - `apps/main/src/hooks/useAssets.ts`
  - `apps/main/src/routes/Assets.tsx`

**Key Steps**

1. Introduce an optional filter for provider status in the hook/filter model, e.g.:
   - `provider_status?: 'ok' | 'local_only' | 'flagged'` (or similar).
2. Thread this through:
   - URL/query parameters → `AssetFilters` → `useAssets` → backend `GET /assets` (if/when backend supports filtering by provider status).
3. As a first step, if backend filtering is not yet implemented:
   - Allow frontend-side quick filter buttons (e.g. small pills in the Assets view) that just visually highlight or group assets by status.
4. Add a simple “Status overview” helper in the toolbar, e.g.:
   - `X Provider OK / Y Local-only / Z Flagged`, computed from the current page of assets.

**Status:** `[ ]` Not started

---

## Phase 32.5 – Align Gallery Upload Controls with Extension Semantics

**Goal**  
Ensure upload controls in the gallery (e.g. `MediaCard` upload button, gallery tools) use the same semantics and messaging as the Chrome extension (local vs provider success).

**Scope**

- Gallery upload controls:
  - `apps/main/src/components/media/MediaCard.tsx`
  - Any gallery tools that trigger uploads (e.g. re-upload, cross-provider copy)

**Key Steps**

1. Review `MediaCard`’s upload button behavior:
   - It currently treats `ok: boolean` from `onUploadClick` as “success” and shows generic “Uploaded (accepted)” in the tooltip.
2. Update upload flows used in gallery to distinguish:
   - **Local-only** vs **provider-accepted**, similar to how the extension now uses `providerSucceeded` and `note` from `UploadAssetResponse`.
3. Adjust `MediaCard` tooltip text and internal state so that:
   - “success” corresponds to provider-accepted or explicit “saved and provider OK” semantics.
   - When only a local save is possible, the tooltip and icon reflect that (e.g. “Saved locally; provider upload failed”). This should match the gallery badges from Phase 32.2.
4. Keep the user experience consistent with the Chrome extension messaging so users see the same interpretation of “success” in both places.

**Status:** `[ ]` Not started
