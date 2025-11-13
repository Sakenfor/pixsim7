# Log Viewer Field Metadata API

The launcher's Database Log Viewer now supports **fully dynamic filters** that adapt based on service-specific field metadata.

## How It Works

The log viewer uses a 3-tier approach to determine which fields to show and how they relate:

1. **API Metadata** (preferred): Fetch explicit metadata from backend
2. **Smart Inference**: Analyze field names using heuristics and patterns
3. **Fallback**: Use discovered fields with sensible defaults

## Optional Backend Endpoint

To provide explicit control over filter behavior, implement this optional endpoint:

### `GET /api/v1/logs/field-metadata`

**Parameters:**
- `service` (string): Service name (e.g., "api", "worker", "game")

**Response Format:**
```json
{
  "primary": [
    "job_id",
    "request_id",
    "provider_id"
  ],
  "contextual": [
    "attempt",
    "stage",
    "operation_type",
    "status",
    "retry_count"
  ],
  "relationships": {
    "job_id": ["attempt", "stage", "operation_type", "status"],
    "request_id": ["stage", "operation_type"],
    "provider_id": ["operation_type", "status"]
  }
}
```

**Field Definitions:**

- **`primary`**: Always-visible filter fields (typically IDs and main identifiers)
- **`contextual`**: Context-dependent fields that appear when primary filters are filled
- **`relationships`**: Maps primary fields to the contextual fields they should reveal

## Smart Inference (Automatic Fallback)

If the endpoint is not implemented, the viewer automatically infers field categories using:

### Primary Field Detection
Fields matching these patterns are considered primary:
- Ends with `_id` (job_id, user_id, asset_id, etc.)
- Exactly `id`

### Contextual Field Detection
Fields matching these patterns are considered contextual:
- `attempt`, `retry*`, `status`, `stage`
- `operation_type`, `method`, `state`

### Relationship Inference
Relationships are inferred based on field name semantics:

| Primary Field Pattern | Auto-linked Contextual Fields |
|-----------------------|-------------------------------|
| Contains "job"        | attempt, stage, operation_type, status, retry_count |
| Contains "artifact"   | retry_count, status, operation_type |
| Contains "asset"      | operation_type, status, stage |
| Contains "request"    | stage, operation_type, status, method |
| Contains "provider"   | attempt, stage, operation_type, status |
| Contains "user"       | operation_type, status, method |
| **Default**           | stage, status, operation_type |

## Example Behavior

**When user selects service "worker":**

1. Viewer calls `/api/v1/logs/field-metadata?service=worker`
   - If endpoint exists → uses returned metadata
   - If 404 → falls back to inference

2. **Primary filters shown:**
   - `job_id`
   - `provider_job_id`
   - `request_id`

3. **Contextual filters (initially hidden):**
   - `attempt`
   - `stage`
   - `operation_type`
   - `status`

4. **When user types in `job_id` field:**
   - → Automatically shows: `attempt`, `stage`, `operation_type`, `status`
   - (Green border indicates context-dependent field)

## Benefits

✅ **Zero Hardcoding**: No field names hardcoded in frontend
✅ **Service-Specific**: Each service defines its own filter behavior
✅ **Auto-Adaptive**: New fields automatically categorized by inference
✅ **Smart UX**: Filters appear only when relevant
✅ **Backend Control**: Optional endpoint for explicit control
✅ **Graceful Degradation**: Works without backend implementation

## Implementation Example (Backend)

```python
from fastapi import APIRouter, Query

router = APIRouter()

@router.get("/logs/field-metadata")
async def get_field_metadata(service: str = Query(...)):
    """Return field metadata for dynamic log filtering."""

    # Define per-service metadata
    metadata_map = {
        "api": {
            "primary": ["request_id", "user_id", "provider_id"],
            "contextual": ["stage", "operation_type", "status", "method"],
            "relationships": {
                "request_id": ["stage", "operation_type", "method"],
                "provider_id": ["operation_type", "status"],
            }
        },
        "worker": {
            "primary": ["job_id", "provider_job_id"],
            "contextual": ["attempt", "stage", "operation_type", "status"],
            "relationships": {
                "job_id": ["attempt", "stage", "operation_type", "status"],
                "provider_job_id": ["attempt", "stage"],
            }
        },
        # Add more services...
    }

    return metadata_map.get(service, {
        "primary": [],
        "contextual": [],
        "relationships": {}
    })
```
