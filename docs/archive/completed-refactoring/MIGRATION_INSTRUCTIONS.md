# Database Migration Instructions

## Migration: Add params and account_id fields

**Migration ID:** `daa977a0bfa9`
**Date:** 2025-11-11
**Description:** Adds `params` JSON field to `jobs` table and `account_id` foreign key to `provider_submissions` table.

## What This Migration Does

### Changes to `jobs` table:
- Adds `params` column (JSON, NOT NULL, default `{}`)
- Stores generation parameters for retry and recreation capability

### Changes to `provider_submissions` table:
- Adds `account_id` column (INTEGER, NOT NULL)
- Links each submission to the provider account used
- For existing records, automatically assigns the first matching provider account
- Creates foreign key constraint to `provider_accounts.id`
- Creates index `ix_provider_submissions_account_id` for performance

## How to Run the Migration

### Option 1: From the database directory (recommended)

```bash
cd pixsim7/backend/main/infrastructure/database
PYTHONPATH=/g/code/pixsim7 alembic upgrade head
```

### Option 2: Using environment variable (Windows PowerShell)

```powershell
cd pixsim7/backend/main/infrastructure/database
$env:PYTHONPATH = "G:/code/pixsim7"
alembic upgrade head
```

### Option 3: Using Python module

```bash
cd /g/code/pixsim7
python -m alembic -c pixsim7/backend/main/infrastructure/database/alembic.ini upgrade head
```

## Verification

After running the migration, verify the changes:

```bash
# Check current migration version
PYTHONPATH=/g/code/pixsim7 alembic current

# Should show: daa977a0bfa9 (head)
```

### Check database schema:

```sql
-- Check jobs table has params column
\d jobs

-- Check provider_submissions has account_id
\d provider_submissions

-- Verify all existing submissions have account_id set
SELECT COUNT(*) FROM provider_submissions WHERE account_id IS NULL;
-- Should return 0
```

## Rollback (if needed)

To rollback this migration:

```bash
cd pixsim7/backend/main/infrastructure/database
PYTHONPATH=/g/code/pixsim7 alembic downgrade -1
```

## Important Notes

1. **Existing Data**: The migration automatically assigns `account_id` to existing `provider_submissions` records by matching on `provider_id`. Review these assignments after migration if you have existing data.

2. **Backup**: Always backup your database before running migrations in production.

3. **Account Requirement**: If you have `provider_submissions` records but no matching `provider_accounts`, the migration will fail. Ensure you have at least one account per provider before running the migration.

## Related Code Changes

This migration accompanies the following code changes:
- Added `params` field to `Job` model
- Added `account_id` field to `ProviderSubmission` model
- Updated `JobService` to save params
- Updated `ProviderService` to store account_id
- Implemented account concurrency tracking
- Added job timeout handling
- Added parameter validation

See the main codebase for details.
