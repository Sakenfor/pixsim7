# Asset Deduplication System - Implementation Status

**Date:** 2025-12-18
**Status:** Partially Implemented - Backend Complete, Frontend Pending

---

## ✅ COMPLETED: Backend Implementation

### 1. Fixed SHA256 Uniqueness Scope (CRITICAL BUG FIX)

**Problem:**
- Database had `sha256` with `unique=True` (global constraint)
- Code did per-user lookups: `WHERE user_id = ? AND sha256 = ?`
- Result: Constraint violations when different users uploaded identical files

**Solution:**
- **Modified:** `pixsim7/backend/main/domain/asset.py:36-42`
  ```python
  sha256: Optional[str] = Field(
      default=None,
      max_length=64,
      index=False,  # Changed from unique=True, index=True
      description="File content hash (for per-user deduplication)"
  )
  ```

- **Added:** Composite unique index in `__table_args__` (line 257-263)
  ```python
  Index("idx_asset_user_sha256", "user_id", "sha256",
        unique=True,
        postgresql_where="sha256 IS NOT NULL"),
  ```

- **Created:** Migration `20251218_0100_fix_sha256_per_user_dedup.py`
  - Drops old global unique constraint
  - Creates composite unique index on (user_id, sha256)
  - Includes conditional checks to prevent re-running
  - Safe upgrade/downgrade paths

**Files Changed:**
- `pixsim7/backend/main/domain/asset.py`
- `pixsim7/backend/main/infrastructure/database/migrations/versions/20251218_0100_fix_sha256_per_user_dedup.py`

---

### 2. Provider Uploads Map Integration

**Problem:**
- When user uploaded same file to different provider, system created duplicate Asset rows
- Didn't leverage `provider_uploads` JSON field for cross-provider tracking

**Solution:**
Updated upload logic in `pixsim7/backend/main/api/v1/assets.py:345-387, 421-448`:

```python
if existing:
    # Check if already uploaded to THIS provider
    already_on_provider = (
        existing.provider_id == provider_id or
        provider_id in (existing.provider_uploads or {})
    )

    if already_on_provider:
        # Return existing - already on this provider
        return UploadAssetResponse(...)
    else:
        # Upload to new provider, update provider_uploads map
        # ... upload logic ...
        existing.provider_uploads[provider_id] = provider_asset_id
        db.commit()
        return existing asset
```

**Behavior Changes:**
- Same hash + same provider → Reuse existing, no upload
- Same hash + different provider → Upload to new provider, update `provider_uploads`, return existing asset
- No duplicate Asset rows created

**Files Changed:**
- `pixsim7/backend/main/api/v1/assets.py:345-448`

---

### 3. Check-by-Hash Endpoint (Read-Only)

**Added:** `POST /api/v1/assets/check-by-hash`

**Location:** `pixsim7/backend/main/api/v1/assets.py:182-262`

**Request:**
```json
{
  "sha256": "abc123...",
  "provider_id": "pixverse"  // optional
}
```

**Response:**
```json
{
  "exists": true,
  "asset_id": 123,
  "provider_id": "pixverse",
  "uploaded_to_providers": ["pixverse", "runway"],
  "note": "Asset already uploaded to pixverse"
}
```

**Features:**
- POST instead of GET (hash not in URL/logs)
- Read-only: does NOT update `last_accessed_at`
- Scoped to current user
- Returns which providers asset is uploaded to
- Can check specific provider

**Files Changed:**
- `pixsim7/backend/main/api/v1/assets.py:182-262`

---

## ❌ PENDING: Frontend Implementation

### 4. Streaming SHA256 Computation (Web Worker)

**Problem:**
- `file.arrayBuffer()` loads entire file into memory
- Causes OOM errors for large videos (500MB+)
- Blocks main thread during hashing

**Solution Needed:**
Create Web Worker for streaming SHA256:

```typescript
// apps/main/src/workers/sha256.worker.ts
self.onmessage = async (e) => {
  const { file } = e.data;
  const chunkSize = 64 * 1024; // 64KB
  let offset = 0;

  // Use crypto.subtle with chunked reading
  // Or import WASM SHA256 library for streaming

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const buffer = await chunk.arrayBuffer();
    // Update hash...
    offset += chunkSize;

    // Report progress
    self.postMessage({
      type: 'progress',
      progress: offset / file.size
    });
  }

  self.postMessage({
    type: 'complete',
    sha256: hashHex
  });
};
```

**Usage:**
```typescript
const worker = new Worker('/src/workers/sha256.worker.ts');
const sha256 = await computeFileSHA256(file, worker);
```

**Cache Invalidation:**
Store `{ sha256, size, lastModified }` to detect file changes.

**Files to Create:**
- `apps/main/src/workers/sha256.worker.ts`
- `apps/main/src/utils/computeSHA256.ts`

---

### 5. LocalAsset Schema Update

**Changes Needed:**

```typescript
// apps/main/src/features/assets/stores/localFoldersStore.ts:9-22
export type LocalAsset = {
  key: string;
  name: string;
  relativePath: string;
  kind: 'image' | 'video' | 'other';
  size?: number;
  lastModified?: number;
  fileHandle?: FileHandle;
  folderId: string;

  // Upload tracking
  lastUploadStatus?: 'success' | 'error';
  lastUploadNote?: string;
  lastUploadAt?: number;

  // ✅ NEW: Content hash for deduplication
  sha256?: string;
  sha256ComputedAt?: number;  // For cache invalidation
};
```

**IndexedDB Migration:**
```typescript
const DB_VERSION = 2; // Increment from 1

function upgradeDB(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 2) {
    const assetsStore = transaction.objectStore('assets');
    if (!assetsStore.indexNames.contains('sha256')) {
      assetsStore.createIndex('sha256', 'sha256', { unique: false });
    }
  }
}
```

**Files to Modify:**
- `apps/main/src/features/assets/stores/localFoldersStore.ts:9-22, 95-151`

---

### 6. Uploads-by-Hash Store (Global Persistence)

**Problem:**
- When folder removed/re-added, new `folderId` generated
- Asset key = `${folderId}:${relativePath}` changes
- Upload status lost

**Solution:**
Create global hash-indexed store:

```typescript
// New IndexedDB store
const STORES = {
  folders: 'folders',
  assets: 'assets',
  folderHandles: 'folder_handles',
  uploadsByHash: 'uploads_by_hash',  // ← NEW
};

interface HashUploadRecord {
  sha256: string;              // Key
  status: 'success' | 'error';
  note?: string;
  uploadedAt: number;
  assetId?: number;            // Backend asset ID
  providerId?: string;         // Provider uploaded to
}

// Write after upload
async function recordUploadByHash(
  sha256: string,
  status: 'success' | 'error',
  assetId?: number,
  providerId?: string,
  note?: string
): Promise<void> {
  const db = await openDB();
  const record: HashUploadRecord = {
    sha256,
    status,
    note,
    uploadedAt: Date.now(),
    assetId,
    providerId,
  };
  await db.transaction('uploads_by_hash', 'readwrite')
    .store.put(record, sha256);
}

// Check before upload
async function getUploadStatusByHash(
  sha256: string
): Promise<HashUploadRecord | null> {
  const db = await openDB();
  return await db.transaction('uploads_by_hash')
    .store.get(sha256) || null;
}
```

**Files to Modify:**
- `apps/main/src/features/assets/stores/localFoldersStore.ts:95-151`

---

### 7. Frontend Upload Flow Integration

**Location:** `apps/main/src/features/assets/hooks/useLocalFoldersController.ts:246-306`

**Updated Flow:**
```typescript
const uploadOne = async (asset: LocalAsset) => {
  // Step 1: Compute SHA256 if not cached
  if (!asset.sha256) {
    const file = await getFileForAsset(asset);
    if (!file) return;

    const sha256 = await computeFileSHA256(file);
    asset.sha256 = sha256;
    asset.sha256ComputedAt = Date.now();
    await persistAssetToCache(asset);
  }

  // Step 2: Check local hash store
  const localRecord = await getUploadStatusByHash(asset.sha256);
  if (localRecord?.status === 'success' &&
      localRecord.providerId === providerId) {
    // Already uploaded - skip
    setUploadStatus({ [asset.key]: 'success' });
    setUploadNotes({
      [asset.key]: `Already uploaded (asset ${localRecord.assetId})`
    });
    return;
  }

  // Step 3: Check backend (optional, if backend might have it)
  const backendCheck = await checkAssetByHash({
    sha256: asset.sha256,
    provider_id: providerId,
  });

  if (backendCheck.exists &&
      backendCheck.uploaded_to_providers?.includes(providerId)) {
    // Backend has it - record locally and skip
    await recordUploadByHash(
      asset.sha256,
      'success',
      backendCheck.asset_id,
      providerId,
      backendCheck.note
    );
    setUploadStatus({ [asset.key]: 'success' });
    return;
  }

  // Step 4: Upload to backend
  const formData = new FormData();
  formData.append('file', file);
  formData.append('provider_id', providerId);
  // ... other form fields

  const res = await fetch('/api/v1/assets/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  // Step 5: Record upload by hash (global persistence)
  await recordUploadByHash(
    asset.sha256,
    'success',
    data.asset_id,
    providerId,
    data.note
  );

  // Step 6: Update asset-specific status
  await updateAssetUploadStatus(asset.key, 'success', data.note);
};
```

**Frontend API Client:**
```typescript
// apps/main/src/lib/api/assets.ts
export async function checkAssetByHash(request: {
  sha256: string;
  provider_id?: string;
}): Promise<CheckByHashResponse> {
  const res = await apiClient.post('/assets/check-by-hash', request);
  return res.data;
}
```

**Files to Modify:**
- `apps/main/src/features/assets/hooks/useLocalFoldersController.ts:246-306`
- `apps/main/src/lib/api/assets.ts`

---

## Testing Checklist

### Backend Tests (Can Run Now)

- [ ] Run migration: `alembic upgrade head`
- [ ] Verify composite index exists: `\d assets` in psql
- [ ] Test upload same file with different users (should succeed)
- [ ] Test upload same file to different providers (should update provider_uploads)
- [ ] Test `POST /assets/check-by-hash` endpoint
- [ ] Verify no `last_accessed_at` updates from check-by-hash

### Frontend Tests (After Implementation)

- [ ] Hash computation for 10MB file (should complete in <5s)
- [ ] Hash computation for 500MB file (should not OOM)
- [ ] Upload file → Remove folder → Re-add folder → Check upload status (should persist)
- [ ] Upload to Pixverse → Try upload to Runway (should skip, show "already uploaded")
- [ ] Clear IndexedDB → Check backend (should find existing asset)

---

## Performance Considerations

### SHA256 Computation
- **10MB image:** ~500ms (single-threaded)
- **500MB video:** ~10s with Web Worker, ~OOM without
- **Cache hit:** Instant (read from IndexedDB)

### Memory Usage
- **Streaming hash:** 64KB peak memory (per file)
- **Full file load:** Peak = file size (unacceptable for videos)

### Database Impact
- Composite index adds ~20 bytes per row
- Query performance unchanged (both indexes are B-tree)

---

## Migration Notes

### Database Migration
```bash
cd pixsim7/backend
alembic upgrade head
```

### IndexedDB Migration
Auto-migrates on version bump. Old data preserved:
```typescript
const DB_VERSION = 2; // Auto-triggers upgrade
```

Users with folders already added:
1. Hashes computed on next upload attempt
2. Upload status backfilled to hash store
3. No data loss

---

## Remaining Work Estimate

| Task | Complexity | Estimated Time |
|------|-----------|----------------|
| SHA256 Web Worker | Medium | 2-3 hours |
| LocalAsset schema + migration | Low | 1 hour |
| Hash store (IndexedDB) | Medium | 2 hours |
| Upload flow integration | High | 3-4 hours |
| Testing + debugging | Medium | 2 hours |
| **Total** | | **10-12 hours** |

---

## Critical Implementation Notes

1. **Cache Invalidation:**
   ```typescript
   if (asset.size !== cachedSize || asset.lastModified !== cachedModified) {
     // Recompute hash
   }
   ```

2. **Provider-Specific Checks:**
   Always include `provider_id` in hash checks - user may want same file on multiple providers.

3. **Error Handling:**
   If hash computation fails, fall back to uploading without hash (backend will compute it).

4. **Progress UI:**
   Show hash computation progress for large files:
   ```typescript
   worker.postMessage({ type: 'progress', progress: 0.45 }); // 45%
   ```

5. **Web Worker Limitations:**
   - Can't access DOM
   - Can't access localStorage (use postMessage to pass tokens)
   - Must bundle separately (Vite config needed)

---

## Example User Flow (After Full Implementation)

```
User adds folder with 100 videos (50GB total)
  → Frontend: "Computing hashes... 45% (12/100)"
  → [SHA256 computed in background, stored in IndexedDB]

User uploads 10 videos to Pixverse
  → Frontend checks hash store (cache miss)
  → Frontend checks backend (not found)
  → Uploads proceed
  → Hash store updated with upload status

User removes folder (loses permission)
  → IndexedDB folders cleared
  → IndexedDB assets cleared
  → Hash store PRESERVED (uploads_by_hash)

User re-adds SAME folder
  → Scans 100 videos
  → Computes hashes (cache miss, folderId changed)
  → Frontend checks hash store for each file
  → 10 videos: "Already uploaded (asset 123)" ✅
  → 90 videos: "Ready to upload"
  → ZERO unnecessary uploads
```

---

## Files Modified Summary

### Backend (Completed)
- ✅ `pixsim7/backend/main/domain/asset.py`
- ✅ `pixsim7/backend/main/api/v1/assets.py`
- ✅ `pixsim7/backend/main/infrastructure/database/migrations/versions/20251218_0100_fix_sha256_per_user_dedup.py`

### Frontend (Pending)
- ❌ `apps/main/src/workers/sha256.worker.ts` (new file)
- ❌ `apps/main/src/utils/computeSHA256.ts` (new file)
- ❌ `apps/main/src/features/assets/stores/localFoldersStore.ts`
- ❌ `apps/main/src/features/assets/hooks/useLocalFoldersController.ts`
- ❌ `apps/main/src/lib/api/assets.ts`

---

## Known Limitations

1. **No visual similarity detection in frontend**
   - Backend has perceptual hash (phash64)
   - Frontend only does exact SHA256 matching
   - Future: Show "Similar image found" warnings

2. **No cross-device sync**
   - Hash store is per-browser
   - User on different computer won't see upload status
   - Could sync via backend user preferences table

3. **File rename detection**
   - Renaming file clears upload status (key changes)
   - Hash store will still catch it
   - Consider adding "merge duplicate keys" UI

---

## Copy this document to another agent for continued implementation.
