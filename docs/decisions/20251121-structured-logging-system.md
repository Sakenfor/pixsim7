# ADR: Structured Logging System

- **Date:** 2025-11-21
- **Status:** Accepted
- **Authors:** PixSim7 Team

---

## Context

PixSim7 is a complex system with multiple components (backend API, workers, frontend, game) that need coordinated logging for:

1. **Debugging** - Trace requests across services
2. **Monitoring** - Track job progress, system health
3. **Analytics** - Understand usage patterns, performance
4. **Compliance** - Audit trails for actions

### Problem

Without structured logging:
- ❌ Logs are unstructured text, hard to parse
- ❌ No consistent format across components
- ❌ Can't easily filter by job, user, or provider
- ❌ Difficult to correlate logs across services
- ❌ Sensitive data (API keys, passwords) may leak into logs
- ❌ High-volume events flood logs, hiding important information

### Constraints

- Must work in development (human-readable) and production (machine-parseable)
- Must support multiple services (backend, worker, frontend)
- Must handle high-volume events without overwhelming storage
- Must redact sensitive data automatically
- Must enable real-time log viewing in admin panel
- Must store logs in database for querying and analysis

### Alternatives Considered

1. **Plain Text Logging**
   - Use Python's `logging` module with string formatting
   - ❌ Rejected: Unstructured, hard to parse, no field extraction

2. **Third-Party SaaS (Datadog, Splunk)**
   - Send logs to external service
   - ❌ Rejected: High cost, data privacy concerns, vendor lock-in

3. **ELK Stack (Elasticsearch, Logstash, Kibana)**
   - Self-hosted log aggregation
   - ❌ Rejected: High operational overhead, resource intensive for our scale

4. **Custom Structured JSON Logging (chosen)**
   - JSON output, unified field catalog, database ingestion
   - ✅ Accepted: Full control, low cost, integrated with our stack

---

## Decision

PixSim7 implements a **custom structured logging system** with these components:

### Core Architecture

1. **Unified Logging Package: `pixsim_logging/`**
   - Standalone Python package
   - Provides `get_logger()` function
   - Configurable output format (JSON for prod, human-readable for dev)
   - Automatic sensitive data redaction

2. **Field Catalog**
   Standard fields across all log events:

   **Identity Fields:**
   - `service` - Which service (backend, worker, frontend, game)
   - `logger` - Logger name (module path)
   - `request_id` - Request correlation ID

   **Context Fields:**
   - `user_id` - User performing action
   - `job_id` - Job being processed
   - `asset_id` - Asset being operated on
   - `provider_id` - Provider being used (pixverse, sora, etc.)
   - `account_id` - Provider account being used

   **Event Fields:**
   - `timestamp` - ISO 8601 timestamp
   - `level` - Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
   - `message` - Human-readable message
   - `stage` - Pipeline stage (see taxonomy below)

   **Technical Fields:**
   - `duration_ms` - Operation duration
   - `error` - Error message (if applicable)
   - `stack_trace` - Stack trace (for errors)

3. **Stage Taxonomy**
   Consistent stage naming for pipeline events:

   **Job Submission Pipeline:**
   - `pipeline:start` - Job submission begins
   - `pipeline:artifact` - Artifact preparation
   - `provider:submit` - Submitting to provider
   - `provider:status` - Status polling
   - `provider:complete` - Provider job complete
   - `pipeline:complete` - Job fully complete

   **Asset Operations:**
   - `asset:create` - Asset creation
   - `asset:upload` - Asset upload
   - `asset:download` - Asset download
   - `asset:cache` - Asset caching

   **User Operations:**
   - `auth:login` - User login
   - `auth:register` - User registration
   - `auth:token` - Token operations

4. **Sensitive Data Redaction**
   Automatically redact these field names:
   - `api_key`, `apiKey`, `password`, `jwt_token`, `access_token`
   - `secret`, `credentials`, `cookie`
   - Replace with `***REDACTED***`

5. **Sampling for High-Volume Events**
   - Configurable sampling rate for DEBUG logs
   - Example: Only log 10% of status polling events
   - Critical events (ERROR, CRITICAL) always logged

6. **Database Ingestion**
   - Logs written to files: `data/logs/pixsim7.log`
   - Background worker ingests logs into PostgreSQL
   - `log` table with JSONB column for flexible querying
   - Admin panel provides real-time log viewer

### Usage Pattern

```python
from pixsim_logging import get_logger

logger = get_logger()

# Basic logging
logger.info("Job created", job_id=123, user_id=456)

# Stage-based logging
logger.info("Submitting to provider",
    stage="provider:submit",
    job_id=123,
    provider_id="pixverse"
)

# Error logging with context
logger.error("Job failed",
    stage="provider:complete",
    job_id=123,
    error="Provider timeout"
)

# Duration tracking
start = time.time()
# ... do work ...
logger.info("Operation complete",
    stage="pipeline:complete",
    duration_ms=(time.time() - start) * 1000
)
```

### Key Principles

**We ARE:**
- Using JSON for production, human-readable for development
- Enforcing consistent field names across all services
- Automatically redacting sensitive data
- Storing logs in database for querying
- Providing stage taxonomy for pipeline events
- Supporting sampling for high-volume events

**We are NOT:**
- Using third-party logging services
- Logging raw request/response bodies (too large)
- Guaranteeing 100% log delivery (best-effort)
- Keeping logs forever (retention policy needed)

---

## Consequences

### Positive

1. **Queryability**
   - JSON structure enables SQL queries
   - Can filter by any field: `WHERE job_id = 123`
   - Can aggregate: `COUNT(*) GROUP BY provider_id`
   - Can trace requests across services

2. **Consistency**
   - Same field names everywhere
   - Same stage names for similar operations
   - Easier to write log analysis tools

3. **Security**
   - Automatic sensitive data redaction
   - No manual filtering needed
   - Reduces risk of credential leaks

4. **Performance**
   - Sampling prevents log flooding
   - JSONB indexing in PostgreSQL
   - Async file writing

5. **Debugging**
   - Rich context in every log event
   - Easy to filter to specific job/user/provider
   - Human-readable in development

### Trade-offs

1. **Storage**
   - JSON logs are larger than plain text
   - Database storage grows over time
   - Need retention/archival strategy

2. **Complexity**
   - Custom logging package to maintain
   - Need to train developers on field catalog
   - Stage taxonomy must be kept consistent

3. **Performance Overhead**
   - JSON serialization has cost
   - Database ingestion adds latency
   - Field extraction and redaction

4. **Lock-in**
   - Custom format not compatible with standard tools
   - Migrating to third-party service would require adapter

### Risks & Mitigation

**Risk:** Log volume growth
- **Mitigation:** Sampling, retention policy, archival to object storage

**Risk:** Sensitive data leaks
- **Mitigation:** Redaction, regular audits, field name conventions

**Risk:** Database ingestion lag
- **Mitigation:** Async workers, batching, fallback to file-only

**Risk:** Inconsistent field usage
- **Mitigation:** Documentation, linting, code reviews, field catalog

### Migration Strategy

This system was built from the start. Ongoing work:
1. ✅ Implement in backend services (complete)
2. ✅ Implement in workers (complete)
3. ✅ Database ingestion (complete)
4. ✅ Admin panel log viewer (complete)
5. ⏳ Implement in frontend (in progress)
6. ⏳ Add log retention policy (future)
7. ⏳ Add log analytics dashboard (future)

---

## Related Code / Docs

### Code
- **`pixsim_logging/`** - Core logging package
  - `__init__.py` - `get_logger()` implementation
  - `handlers.py` - JSON and file handlers
  - `filters.py` - Sensitive data redaction
- **`pixsim7_backend/main.py`** - Logger initialization
- **`pixsim7_backend/workers/arq_worker.py`** - Worker logging
- **`pixsim7_backend/services/submission/pipeline.py`** - Pipeline stage logging
- **`pixsim7_backend/services/provider/adapters/pixverse.py`** - Provider logging
- **`pixsim7_backend/api/v1/logs.py`** - Log ingestion endpoint
- **`admin/src/routes/logs/`** - Admin log viewer

### Docs
- **`AI_README.md`** (lines 130-135) - Logging system overview
- **`ARCHITECTURE.md`** - Logging in infrastructure layer
- **Tests:** `tests/test_structured_logging.py`

### Related ADRs
- None (foundational system)

### Field Catalog Reference

For complete field catalog and usage examples, see inline documentation in:
- `pixsim_logging/__init__.py` - Field definitions
- `pixsim7_backend/services/submission/pipeline.py` - Stage taxonomy examples
