**Task 104: Rejected Upload Tracking & Asset Metadata (Cross-Source)**

> **For Agents**
> - Introduces a consistent way to track upload attempts (success & failure) across *all* sources (Local Folders, browser extension, web uploads, cross‑provider uploads).
> - Adds **metadata**, not schema changes: use existing `Asset.media_metadata` and local caches instead of new tables/columns.
> - Use this task when:
>   - Modifying upload flows (local → provider, web/extension → provider, cross‑provider uploads).
>   - Adding UI badges or filters for “previously failed uploads”.
>   - Extending Local Folders / asset gallery to show upload history per provider.
> - Read first:
>   - `pixsim7/backend/main/domain/asset.py`
>   - `pixsim7/backend/main/domain/enums.py`
>   - `pixsim7/backend/main/services/asset/asset_service.py`
>   - `pixsim7/backend/main/services/provider/adapters/*` (provider upload paths)
>   - `apps/main/src/components/assets/LocalFoldersPanel.tsx`
>   - `apps/main/src/hooks/useLocalFoldersController.ts`
>   - `apps/main/src/types/localSources.ts`

---

## High-Level Problem

Today, upload failures are only visible in *local*, transient state:

- Local Folders:
  - Tracks `uploadStatus[key] ∈ { idle, uploading, success, error }` and `uploadNotes[key]` in `useLocalFoldersController`.
  - This state is **ephemeral** (reset on reload, browser‑local only).
- Backend:
  - `Asset` only exists for successful uploads.
  - There is no first‑class notion of *“upload attempts”* or a durable “rejected for provider X because of Y”.

This limits:

- Cross‑source tracing: we can’t easily see that a Pixverse clip failed to upload to Sora last week.
- Repair flows: we can’t show “this asset was rejected due to safety / size / format, create a fixed variant and retry”.
- Multi‑client UX: Local Folders/extension may know about a failure, but the gallery and other surfaces don’t.

**Goal:** Introduce a consistent, metadata‑based way to track upload attempts (including failures) for `Asset`s and local candidates, without changing DB schema. Use this to power UI badges and future “fix and retry” workflows.

---

## Design Principles

1. **No schema changes**
   - Reuse `Asset.media_metadata` JSON and local IndexedDB where needed.
   - Do **not** add new DB tables or columns unless explicitly updated in this task.

2. **Assets are the canonical place to remember history**
   - Once an `Asset` exists, it should carry its upload history in `media_metadata`.
   - Local/UI state should be thin convenience on top of that.

3. **Provider‑agnostic**
   - The same mechanism must work for:
     - Local Folders → provider uploads.
     - Browser extension / web imports (original source URLs).
     - Cross‑provider uploads (Pixverse → Sora, etc.).

4. **Non‑blocking, best‑effort**
   - Recording upload attempts must not block the main upload path; treat metadata writes as best‑effort.
   - Failure to record metadata must never cause an upload request to be considered failed.

5. **Minimal but explicit structure**
   - Use a small, well‑documented shape for upload attempts so future agents don’t invent incompatible formats.

---

## Target Data Shape

All **durable** upload history should live under `Asset.media_metadata` with a shared schema:

```ts
// Pseudotype; this lives inside Asset.media_metadata (JSON)
type UploadAttemptStatus = 'success' | 'error';

interface AssetUploadAttempt {
  provider_id: string;      // e.g. "pixverse", "runway", "sora"
  status: UploadAttemptStatus;
  error_code?: string;      // provider- or app-specific code, if available
  error_message?: string;   // human-readable reason, safe for UI
  at: string;               // ISO timestamp (UTC)
  method?: string;          // e.g. "extension", "local_folders", "api"
  context?: Record<string, any>; // OPTIONAL free-form context (job id, route, etc.)
}

interface AssetUploadHistory {
  upload_attempts?: AssetUploadAttempt[];
  last_upload_status_by_provider?: Record<string, UploadAttemptStatus>;
}
```

- These live inside `Asset.media_metadata`, e.g.:
  - `asset.media_metadata.upload_history.upload_attempts`
  - `asset.media_metadata.upload_history.last_upload_status_by_provider`
- Agents **must not** invent other shapes for this purpose; always extend this object if needed.

---

## Scope

This task covers:

1. Backend helpers to record upload attempts on assets.
2. Wiring those helpers into existing upload flows (where an `Asset` already exists or is created).
3. A small, read‑only projection in asset APIs, so frontends can render badges without parsing raw JSON.
4. Local Folders integration at the *metadata* level (optional but recommended).

This task does **not** require:

- New DB tables.
- New provider endpoints.
- A full UI redesign of gallery/Local Folders (but it should include clear notes for future UI tasks).

---

## Phase 104.1 – Backend Upload History Helper

**Goal**  
Create a single helper on the backend that records upload attempts into `Asset.media_metadata` using the agreed shape.

**Steps**

1. **Add a helper in the asset service layer**
   - File: `pixsim7/backend/main/services/asset/asset_service.py` (or a closely related module).
   - Function signature (suggested):

     ```py
     async def record_upload_attempt(
         self,
         asset: Asset,
         *,
         provider_id: str,
         status: Literal['success', 'error'],
         error_code: Optional[str] = None,
         error_message: Optional[str] = None,
         method: Optional[str] = None,
         context: Optional[dict] = None,
         db: Session,
     ) -> None:
         ...
     ```

   - Responsibilities:
     - Load `asset.media_metadata` (or `{}` if `None`).
     - Ensure `upload_history.upload_attempts` is a list.
     - Append a new `AssetUploadAttempt` with an ISO UTC timestamp.
     - Update `upload_history.last_upload_status_by_provider[provider_id] = status`.
     - Persist the updated `asset.media_metadata` using the existing DB session.

2. **Constraints & behavior**
   - Do **not** raise if metadata update fails; log a warning and continue.
   - This helper is **only** for updating metadata; it must *not* touch other fields (`sync_status`, etc.).

3. **Logging**
   - Log a structured message when recording fails:
     - e.g. `"record_upload_attempt_failed"` with `asset_id`, `provider_id`, `status`, `error_type`.

---

## Phase 104.2 – Wire Into Upload Flows

**Goal**  
Ensure upload attempts (success + failure) are recorded whenever we have an `Asset` to attach them to.

**Target flows (examples, not exhaustive):**

1. **Direct uploads to providers**
   - Asset service / upload service that handles:
     - `POST /api/v1/assets/upload`
     - Cross‑provider transfer (e.g. Pixverse → Sora).
   - After a provider call:
     - On success: `record_upload_attempt(..., status='success', error_code=None, error_message=None)`.
     - On failure: catch the exception, extract any provider error code/message, and call `record_upload_attempt(..., status='error', ...)` before re‑raising or returning an error to the client.

2. **Browser extension / web imports**
   - Wherever we:
     - Create an `Asset` from a provider URL (Pixverse, Runway, etc.), or
     - Upload a user’s local file to a provider from the extension.
   - As soon as an `Asset` exists:
     - Use the helper to record attempts for each provider the asset is sent to.
     - Set `method="extension"` and include relevant context if helpful (e.g., which extension route was used).

**Important:**  
If a particular flow currently uploads a file *without* creating an `Asset`, this task should **not** redesign that flow. Instead:

- Note it clearly in comments and the task doc as “not yet integrated with upload history”.
- Future work can migrate those flows to create `Asset`s earlier.

---

## Phase 104.3 – API Projection for Badges

**Goal**  
Expose a small, read‑only view of upload history in asset APIs so frontends can render badges without parsing raw JSON.

**Steps**

1. **Find the main asset response schemas**
   - File: `pixsim7/backend/main/shared/schemas/asset_schemas.py`
   - Likely `AssetResponse` or similar.

2. **Extend the response with optional fields**

   ```py
   class AssetResponse(BaseModel):
       ...
       # Existing fields
       provider_id: str
       provider_asset_id: str
       ...

       # New (optional) upload history projections
       last_upload_status_by_provider: Optional[Dict[str, Literal['success', 'error']]] = None
       # Optional: to support more detailed UIs later
       # upload_attempts: Optional[List[AssetUploadAttemptSchema]] = None
   ```

   - For now, it’s enough to expose `last_upload_status_by_provider`.
   - The full attempt list can be added later, or guarded behind a flag if needed.

3. **Map from `media_metadata` to the response**
   - In whatever service/factory builds `AssetResponse`:
     - Read `asset.media_metadata` and extract:
       - `upload_history.last_upload_status_by_provider` (if present and well‑formed).
     - Do not crash if `media_metadata` is missing or malformed; just set the field to `None`.

---

## Phase 104.4 – Local Folders Integration (Optional, Recommended)

**Goal**  
Make Local Folders aware of upload history in a way that survives page reloads, while still being consistent with backend logic.

**Steps**

1. **Persist last upload status in local cache**
   - File: `apps/main/src/stores/localFoldersStore.ts`
   - Extend `AssetMeta` to include:

     ```ts
     type AssetMeta = {
       key: string;
       name: string;
       relativePath: string;
       kind: 'image' | 'video' | 'other';
       size?: number;
       lastModified?: number;
       folderId: string;
       lastUploadStatus?: 'success' | 'error';
       lastUploadNote?: string;
       lastUploadAt?: number;
     };
     ```

   - When `cacheAssets` is called after an upload attempt:
     - Merge any updated `lastUploadStatus/lastUploadNote/lastUploadAt` into the cached `AssetMeta` for that key.

2. **Hydrate controller state from cache**
   - File: `apps/main/src/hooks/useLocalFoldersController.ts`
   - On initial load (after `loadPersisted` reconstructs `assetsRecord`):
     - Initialize `uploadStatus` and `uploadNotes` for assets that have `lastUploadStatus` / `lastUploadNote` in their `AssetMeta`.
     - This ensures “failed last time” badges appear immediately on entering Local Folders.

3. **Do not invent a separate “RejectedAsset” type**
   - Local Folders should continue to use `LocalAsset` for *all* files.
   - “Rejected” is a **status** (local + possibly in backend), not a separate entity.

---

## Phase 104.5 – UX Notes for Future Tasks

This task should **not** implement all UI polish, but it must leave clear notes for future work:

1. **Gallery / asset list**
   - Use `last_upload_status_by_provider` in `AssetResponse` to:
     - Show a small “Upload failed” badge per provider (e.g. next to provider icon).
     - Optionally filter by “has failed upload” in gallery views.

2. **Asset detail / inspector**
   - Show the last error message per provider (if any) and a “Retry upload” action where appropriate.

3. **Inpaint / repair flows**
   - When launching inpaint/repair workflows from a rejected asset:
     - Start from the `Asset.id` that has failed history.
     - When a fixed variant succeeds, `record_upload_attempt` will naturally show the transition from `error` → `success`.

Agents implementing UI changes should reference this task and the `AssetUploadHistory` shape rather than inventing new flags or metadata keys.

---

## Non-Goals & Guardrails

- Do **not**:
  - Add new DB tables or columns for “rejected assets”.
  - Introduce separate entities with names like `RejectedAsset` in the backend.
  - Implement provider‑specific branching logic inside `Asset` domain classes.
- Do:
  - Keep all upload attempt tracking in `media_metadata` and/or local caches.
  - Use the helper introduced in Phase 104.1 for all new upload flows.
  - Update this doc if you need to extend the upload history schema.

---

## Acceptance Checklist

- [ ] `Asset.media_metadata` consistently holds upload history under `upload_history`.
- [ ] A `record_upload_attempt` helper exists and is used in at least one provider upload path.
- [ ] Asset API responses expose `last_upload_status_by_provider` in a backward‑compatible way.
- [ ] Local Folders can show “failed last time” badges that survive a page reload (if Phase 104.4 is implemented).
- [ ] No new DB tables/columns were introduced for this feature.
- [ ] This document is kept in sync with the actual field names used in code.

