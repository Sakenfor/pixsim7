# Log Filtering and Dynamic Settings

## Problem
Health check endpoints (`/health`) are being logged to the database every 3 seconds by the launcher's health worker, creating thousands of redundant log entries that clutter the database logs.

## Solution Overview

### 1. Path-Based Log Filtering (pixsim_logging)

Add a new processor to `pixsim_logging/config.py` that filters HTTP request logs by path.

#### Changes to `pixsim_logging/config.py`:

**Add new processor function after `_sampling_processor` (around line 124):**

```python
def _path_filter_processor(logger, method_name: str, event_dict: dict[str, Any]):
    """Filter out logs for specific paths (e.g., health checks).

    Environment variables:
        PIXSIM_LOG_EXCLUDE_PATHS: comma-separated list of paths to exclude (default: /health)
        PIXSIM_LOG_SAMPLE_PATHS: comma-separated path:rate pairs (e.g., "/metrics:100" = 1 in 100)

    Examples:
        PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics  # Completely filter out these paths
        PIXSIM_LOG_SAMPLE_PATHS=/status:50          # Sample 1 in 50 for /status path
    """
    event_type = event_dict.get("event")
    path = event_dict.get("path")

    # Only process http_request events with a path
    if event_type != "http_request" or not path:
        return event_dict

    # Default: exclude /health if no explicit configuration
    exclude_paths_env = os.getenv("PIXSIM_LOG_EXCLUDE_PATHS")
    if exclude_paths_env is None:
        # Default behavior: filter out /health
        if path == "/health":
            return {}
    elif exclude_paths_env.strip():
        # Explicit configuration
        excluded = [p.strip() for p in exclude_paths_env.split(",") if p.strip()]
        if path in excluded:
            return {}  # Drop this log

    # Check sampling rules
    sample_paths = os.getenv("PIXSIM_LOG_SAMPLE_PATHS", "").strip()
    if sample_paths:
        import random
        for rule in sample_paths.split(","):
            rule = rule.strip()
            if ":" not in rule:
                continue
            rule_path, rate = rule.split(":", 1)
            rule_path = rule_path.strip()
            try:
                rate = int(rate.strip())
            except ValueError:
                continue

            if path == rule_path and rate > 1:
                if random.randint(1, rate) != 1:
                    return {}  # Drop this log (sampled out)

    return event_dict
```

**Update the processors list in `configure_logging()` (line 37):**

```python
processors = [
    structlog.contextvars.merge_contextvars,
    structlog.processors.TimeStamper(fmt="iso", key="timestamp"),
    structlog.processors.add_log_level,
    _path_filter_processor,  # ADD THIS LINE - Filter BEFORE sampling
    _sampling_processor,
    _redaction_processor,
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
]
```

**Update docstring to mention new env vars (line 23-32):**

Add these lines to the environment vars section:
```python
        PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics               (comma-separated paths to exclude from logging)
        PIXSIM_LOG_SAMPLE_PATHS=/health:100,/status:50          (comma-separated path:rate pairs for sampling)
```

### 2. Environment Variable Configuration

**Default Behavior:**
- `/health` endpoints are automatically filtered out (not logged to database)
- Console logs still show health checks (useful for debugging)

**Custom Configuration:**

Add to `.env` file:
```bash
# Exclude specific paths from database logging
PIXSIM_LOG_EXCLUDE_PATHS=/health,/metrics

# OR sample specific paths (1 in N will be logged)
PIXSIM_LOG_SAMPLE_PATHS=/health:100  # Log 1 in 100 health checks

# Keep health checks visible in console but not database (already the default)
# (no configuration needed)
```

### 3. Verification

After implementing:

1. Restart backend: `python -m uvicorn pixsim7.backend.main.main:app --reload`
2. Check that health checks are filtered:
   ```bash
   # This should NOT create database logs
   curl http://localhost:8000/health
   ```
3. Check database logs tab in launcher - should not see /health entries
4. Check console logs - should still see http_request logs (before DB ingestion)

## Current Status

**Services using pixsim_logging:**
- ✅ Backend API (`pixsim7/backend/main/main.py`)
- ✅ Game Service (`pixsim7_game_service/main.py`)
- ✅ Workers (`pixsim7/backend/main/workers/`)
- ✅ Launcher (`scripts/launcher_gui/logger.py`)

**Log patterns identified:**
- `/health` - Health checks every 3 seconds (HIGH VOLUME)
- `/metrics` - Metrics endpoint (if implemented)
- Provider status logs - Already sampled via `PIXSIM_LOG_SAMPLING_PROVIDER_STATUS`

## Future: Dynamic Per-Service Logging Settings API

###Concept:
Services can expose their logging configuration dynamically via API, similar to how they expose field metadata.

**API Endpoint:** `GET /api/v1/logs/config`

**Response:**
```json
{
  "service": "api",
  "log_settings": {
    "exclude_paths": ["/health", "/metrics"],
    "sample_paths": {
      "/status": 50
    },
    "custom_filters": {
      "provider_status": {
        "type": "sampling",
        "rate": 5,
        "description": "Sample 1 in 5 provider status events"
      }
    }
  },
  "editable_via_env": [
    {
      "env_var": "PIXSIM_LOG_EXCLUDE_PATHS",
      "description": "Comma-separated paths to exclude",
      "current_value": "/health",
      "type": "string"
    },
    {
      "env_var": "PIXSIM_LOG_SAMPLING_PROVIDER_STATUS",
      "description": "Sample rate for provider status (1 in N)",
      "current_value": "1",
      "type": "integer"
    }
  ]
}
```

**Launcher Integration:**
- Add "Logging Settings" button per service in launcher
- Fetch current settings from service API
- Allow editing environment variables
- Restart service to apply changes

**Benefits:**
- Self-documenting logging configuration
- No need to manually maintain launcher UI
- Services can add new filters without launcher changes
- Dynamic discovery like field metadata

## Implementation Order

1. ✅ Identify services using pixsim_logging
2. ✅ Analyze redundant log patterns
3. ⏳ Add `_path_filter_processor` to pixsim_logging/config.py
4. ⏳ Test with backend service
5. ⏳ Add default `/health` exclusion
6. 🔲 Design and implement logging settings API
7. 🔲 Add launcher UI for per-service logging settings

## Testing

```bash
# Test 1: Health checks should NOT appear in database logs
curl http://localhost:8000/health
# Check Database Logs tab - should see NO new entries

# Test 2: Other endpoints SHOULD appear
curl http://localhost:8000/api/v1/auth/me
# Check Database Logs tab - should see this request

# Test 3: Custom exclusion
export PIXSIM_LOG_EXCLUDE_PATHS=/health,/api/v1/auth/me
# Restart backend
curl http://localhost:8000/api/v1/auth/me
# Should NOT appear in database logs

# Test 4: Sampling
export PIXSIM_LOG_SAMPLE_PATHS=/health:10
export PIXSIM_LOG_EXCLUDE_PATHS=  # Clear exclusions
# Restart backend
# Run 100 health checks - should see ~10 in database logs
for i in {1..100}; do curl -s http://localhost:8000/health > /dev/null; done
```
