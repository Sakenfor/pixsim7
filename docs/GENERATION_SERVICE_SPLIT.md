# GenerationService Split Analysis

**Current State**: 1097 lines - God Object mixing multiple responsibilities

## Identified Responsibilities

### 1. Generation Creation (545 lines, 50% of file!)
**Lines**: 52-597
**Methods**:
- `create_generation()` - Main creation with validation, ARQ queueing
- `_canonicalize_params()` - Parameter normalization
- `_extract_inputs()` - Input reference extraction
- `_validate_content_rating()` - Content rating validation/clamping
- `_resolve_prompt()` - Legacy prompt resolution
- `_resolve_prompt_config()` - Structured prompt resolution
- `_substitute_variables()` - Template variable substitution

**Dependencies**: UserService, provider registry, event_bus, ARQ, PromptVersion/Family

### 2. Status Management (165 lines)
**Lines**: 597-762
**Methods**:
- `update_status()` - Generic status updates with event publishing
- `mark_started()` - Mark generation as started
- `mark_completed()` - Mark generation as completed with asset
- `mark_failed()` - Mark generation as failed with error
- `cancel_generation()` - Cancel pending generation

**Dependencies**: event_bus

### 3. Query Operations (166 lines)
**Lines**: 762-928
**Methods**:
- `get_generation()` - Get by ID
- `get_generation_for_user()` - Get with user authorization check
- `list_generations()` - List with filters (user, workspace, status, dates)
- `count_generations()` - Count with same filters
- `get_pending_generations()` - Get all pending generations for worker

**Dependencies**: None (pure queries)

### 4. Retry Logic (149 lines)
**Lines**: 928-1077
**Methods**:
- `increment_retry()` - Increment retry counter
- `retry_generation()` - Create retry generation
- `should_auto_retry()` - Check if generation should auto-retry

**Dependencies**: Event bus, ARQ

### 5. Prompt Integration (20 lines)
**Lines**: 1077-1097
**Methods**:
- `_increment_prompt_metrics()` - Update prompt version metrics

**Dependencies**: PromptVersion

## Proposed Split

### File Structure
```
services/generation/
├── __init__.py                    # Exports (updated)
├── creation_service.py            # ~545 lines
├── lifecycle_service.py           # ~165 lines
├── query_service.py               # ~166 lines
├── retry_service.py               # ~149 lines
└── generation_service.py          # ~100 lines (compatibility layer)
```

### 1. creation_service.py - GenerationCreationService
**Responsibilities**: Generation creation, validation, canonicalization, prompt resolution

**Methods**:
- `create_generation()` - Main creation entry point
- `_canonicalize_params()` - Parameter normalization
- `_extract_inputs()` - Input extraction
- `_validate_content_rating()` - Content validation
- `_resolve_prompt()` - Legacy prompt resolution
- `_resolve_prompt_config()` - Structured prompt resolution
- `_substitute_variables()` - Variable substitution

**Dependencies**:
- UserService - Quota checks
- Provider registry - Provider validation
- Event bus - JOB_CREATED events
- ARQ - Job queueing
- PromptVersion/Family - Prompt resolution

### 2. lifecycle_service.py - GenerationLifecycleService
**Responsibilities**: Generation status transitions and lifecycle management

**Methods**:
- `update_status()` - Generic status updates
- `mark_started()` - Start generation
- `mark_completed()` - Complete generation
- `mark_failed()` - Fail generation
- `cancel_generation()` - Cancel generation

**Dependencies**: Event bus

### 3. query_service.py - GenerationQueryService
**Responsibilities**: Generation retrieval and listing

**Methods**:
- `get_generation()` - Get by ID
- `get_generation_for_user()` - Get with auth check
- `list_generations()` - List with filters
- `count_generations()` - Count with filters
- `get_pending_generations()` - Get pending generations

**Dependencies**: None (pure queries)

### 4. retry_service.py - GenerationRetryService
**Responsibilities**: Generation retry logic

**Methods**:
- `increment_retry()` - Increment counter
- `retry_generation()` - Create retry
- `should_auto_retry()` - Check retry eligibility

**Dependencies**: Event bus, ARQ, GenerationCreationService (for retry creation)

### 5. generation_service.py - GenerationService (Compatibility Layer)
**Purpose**: Backward compatibility for existing code

**Implementation**:
```python
class GenerationService:
    """Backward compatibility layer - composes focused services"""

    def __init__(self, db: AsyncSession, user_service: UserService):
        self.db = db
        self.users = user_service

        # Compose focused services
        self._creation = GenerationCreationService(db, user_service)
        self._lifecycle = GenerationLifecycleService(db)
        self._query = GenerationQueryService(db)
        self._retry = GenerationRetryService(db, self._creation)

    # Delegate all methods to focused services
    async def create_generation(self, *args, **kwargs):
        return await self._creation.create_generation(*args, **kwargs)

    async def mark_started(self, *args, **kwargs):
        return await self._lifecycle.mark_started(*args, **kwargs)

    # ... (all other methods delegated)
```

## Benefits

1. **Focused Responsibilities**: Each service has a single, clear purpose
2. **Easier Navigation**: AI agents can load entire services without truncation
3. **Better Testability**: Can test creation, lifecycle, queries independently
4. **Maintainability**: Changes to retry logic don't affect queries
5. **Zero Breaking Changes**: Compatibility layer maintains all existing APIs

## Implementation Checklist

- [ ] Create creation_service.py
- [ ] Create lifecycle_service.py
- [ ] Create query_service.py
- [ ] Create retry_service.py
- [ ] Update generation_service.py as compatibility layer
- [ ] Update __init__.py exports
- [ ] Verify all existing tests pass
- [ ] Commit and push changes
