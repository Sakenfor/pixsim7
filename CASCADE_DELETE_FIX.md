# Fix for Asset Deletion Foreign Key Error

## Problem
When deleting an asset, you get this error:
```
ForeignKeyViolationError: update or delete on table "generations" violates foreign key constraint
"fk_provider_submissions_generation_id" on table "provider_submissions"
```

## Root Cause
The `provider_submissions.generation_id` foreign key doesn't have `CASCADE DELETE`, so when you delete an asset:
1. Asset deletion tries to delete the generation
2. Generation can't be deleted because provider_submissions still reference it
3. Error occurs

## Solution Applied

### 1. Migration Created ✅
Created migration: `20251215_0027_add_cascade_delete_to_provider_submissions.py`

This migration will:
- Drop the old foreign key constraint
- Recreate it with `ON DELETE CASCADE`

### 2. Model Updated ✅
Updated `ProviderSubmission` model to include `ondelete="CASCADE"` for future migrations

## How to Apply the Fix

### Option 1: Auto-migration on Backend Start (Recommended)
The migration will run automatically when you start the backend server.

### Option 2: Use Admin API Endpoint
```bash
curl -X POST http://localhost:5173/api/admin/migrations/upgrade
```

### Option 3: Manual SQL (Quick Fix)
If you need to fix it immediately, run this SQL in your PostgreSQL database:

```sql
-- Drop the old constraint
ALTER TABLE provider_submissions
DROP CONSTRAINT fk_provider_submissions_generation_id;

-- Recreate with CASCADE DELETE
ALTER TABLE provider_submissions
ADD CONSTRAINT fk_provider_submissions_generation_id
FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE;
```

## Verification
After applying the fix, you should be able to delete assets without errors. The cascade will work as follows:
- Delete asset → deletes generation → deletes provider_submissions

## Files Changed
- `pixsim7/backend/main/infrastructure/database/migrations/versions/20251215_0027_add_cascade_delete_to_provider_submissions.py`
- `pixsim7/backend/main/domain/provider_submission.py`
