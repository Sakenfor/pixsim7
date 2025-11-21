# Asset Upload Issues Analysis

## Issue 1: PostgreSQL Cannot Access Windows File Paths ⚠️

**Error**: `asyncpg.exceptions.UndefinedFileError: could not access file`

**Root Cause**:
The backend creates local storage paths using `os.path.join()` which generates Windows-style paths with backslashes (`data\storage\user\1\assets\temp_xxx.jpg`) when running on Windows. However, PostgreSQL is running in Docker/Linux and cannot access Windows paths.

**Location**: `pixsim7/backend/main/api/v1/assets.py:414-483`

**Problematic Code**:
```python
# Line 414
storage_root = os.path.join("data", "storage", "user", str(user.id), "assets")
# This creates: data\storage\user\1\assets on Windows
# But Docker/PostgreSQL needs: data/storage/user/1/assets
```

**Fix**:
Use `pathlib.Path` or explicitly use forward slashes for cross-platform compatibility:

```python
from pathlib import Path

# Use Path for cross-platform compatibility
storage_root = Path("data") / "storage" / "user" / str(user.id) / "assets"
storage_root.mkdir(parents=True, exist_ok=True)

# Convert to string with forward slashes
temp_local_path = str(storage_root / f"temp_{temp_id}{ext}")
```

OR force forward slashes:
```python
storage_root = f"data/storage/user/{user.id}/assets"
os.makedirs(storage_root, exist_ok=True)
```

---

## Issue 2: DBLogHandler Missing request_id Parameter ⚠️

**Error**: `A value is required for bind parameter 'request_id', in parameter group 1`

**Root Cause**:
The DBLogHandler's `_map_event()` method doesn't provide a default value for `request_id` when it's not present in the log event. While the database column is nullable, SQLAlchemy's INSERT statement seems to require all bind parameters to be present.

**Location**: `pixsim_logging/db_handler.py:151-203`

**Problematic Code**:
```python
def _map_event(self, ev: dict[str, Any]) -> dict[str, Any]:
    known = {
        "timestamp", "level", "service", "env", "msg",
        "request_id", ...  # Listed as known but not defaulted
    }
    # ...
    # No default for request_id!
```

**Fix**:
Add explicit None defaults for optional fields:

```python
def _map_event(self, ev: dict[str, Any]) -> dict[str, Any]:
    # ... existing code ...

    # Set defaults for optional nullable fields
    row.setdefault("request_id", None)
    row.setdefault("job_id", None)
    row.setdefault("submission_id", None)
    row.setdefault("artifact_id", None)
    # ... etc for other optional fields

    return row
```

---

## Cascading Effect

The asset upload error triggers logging, which then fails due to the missing `request_id` parameter, creating a cascade of errors:

1. Asset upload fails (PostgreSQL path issue)
2. Error is logged via pixsim_logging
3. Logging fails (missing request_id)
4. HTTP request logging also fails for same reason

---

## Quick Fix Summary

### Fix 1: Asset Upload (assets.py)
Replace `os.path.join` with forward-slash paths or `Path` objects.

### Fix 2: DB Logging (db_handler.py)
Add explicit `None` defaults for all optional fields in `_map_event()`.

---

## Testing

After fixes:
1. Test asset upload via Chrome extension
2. Verify logs are properly written to database
3. Check that asset files are accessible
