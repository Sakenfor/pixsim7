# Prompt Versioning System

**Status**: Phase 3 Complete ✅
**Implementation Date**: Phase 1: 2025-11-17, Phase 2: 2025-11-17, Phase 3: 2025-11-17
**Migration**: `20251117_0550_7ed0db0fe547_add_prompt_versioning_tables`

## Overview

Git-like versioning system for prompts used in visual and narrative generation. Enables tracking, iteration, and performance analysis of prompt variants.

## Architecture Philosophy

**Pragmatic Approach** (based on feedback from design review):
- ✅ Minimal schema changes (one column on `GenerationArtifact`)
- ✅ Loose coupling - no risk to existing job pipeline
- ✅ Optional adoption - existing workflows unaffected
- ✅ Progressive enhancement - complex features deferred until proven necessary

**Design Principles**:
- Families group concepts/scenes
- Versions are immutable snapshots (like Git commits)
- Optional linkage with jobs/artifacts (decoupled)
- Analytics tracked separately for performance

## Schema

### Tables Created

#### `prompt_families`
Groups related prompt versions (e.g., "bench kiss variants")

```sql
CREATE TABLE prompt_families (
    id UUID PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,           -- "bench-kiss-dusk"
    title VARCHAR(255) NOT NULL,                 -- "Bench Kiss at Dusk"
    description TEXT,
    prompt_type VARCHAR(50) NOT NULL,            -- 'visual', 'narrative', 'hybrid'
    category VARCHAR(100),                       -- 'romance', 'action', etc.
    tags JSONB DEFAULT '[]',

    -- Optional game linkage
    game_world_id UUID,
    npc_id UUID,
    scene_id UUID,
    action_concept_id VARCHAR(100),

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    family_metadata JSONB DEFAULT '{}'
);
```

#### `prompt_versions`
Individual versions (Git commit analog)

```sql
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES prompt_families(id),
    version_number INTEGER NOT NULL,             -- Auto-increment within family
    parent_version_id UUID REFERENCES prompt_versions(id),

    -- Core prompt data
    prompt_text TEXT NOT NULL,
    variables JSONB DEFAULT '{}',
    provider_hints JSONB DEFAULT '{}',

    -- Version metadata (Git-like)
    commit_message VARCHAR(500),
    author VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),

    -- Simple metrics
    generation_count INTEGER DEFAULT 0,
    successful_assets INTEGER DEFAULT 0,

    -- Optional versioning metadata
    semantic_version VARCHAR(20),                -- "1.2.3"
    branch_name VARCHAR(100),                    -- "experimental-lighting"
    tags JSONB DEFAULT '[]',
    diff_from_parent TEXT,

    UNIQUE(family_id, version_number)
);
```

### Modified Tables

#### `generation_artifacts`
Added prompt versioning fields:

```sql
ALTER TABLE generation_artifacts ADD COLUMN
    prompt_version_id UUID REFERENCES prompt_versions(id),
    final_prompt TEXT;
```

**Why this approach:**
- `GenerationArtifact` is already the durable record
- Minimal disruption to existing system
- Can purge old jobs while keeping artifact → prompt linkage
- No complex event tracking needed (yet)

## Implementation Files

### Domain Models
**File**: `pixsim7/backend/main/domain/prompt_versioning.py`

```python
class PromptFamily(SQLModel, table=True):
    """Groups related prompt versions"""

class PromptVersion(SQLModel, table=True):
    """Individual version (immutable)"""

class PromptVariantFeedback(SQLModel, table=True):
    """Feedback on prompt+asset combinations"""
```

**Plugin Registration**: `pixsim7/backend/main/domain_models/prompt_models/manifest.py`
- Auto-registers models with SQLModel during app startup
- Declares dependency on `core_models`

### Service Layer
**File**: `pixsim7/backend/main/services/prompts/prompt_version_service.py`

**Core Methods**:
```python
class PromptVersionService:
    # Family management
    async def create_family(title, prompt_type, **kwargs) -> PromptFamily
    async def get_family(family_id) -> PromptFamily
    async def get_family_by_slug(slug) -> PromptFamily
    async def list_families(...) -> List[PromptFamily]

    # Version management
    async def create_version(family_id, prompt_text, ...) -> PromptVersion
    async def get_version(version_id) -> PromptVersion
    async def get_latest_version(family_id) -> PromptVersion
    async def list_versions(family_id) -> List[PromptVersion]

    # Forking & iteration
    async def fork_from_artifact(artifact_id, family_id, ...) -> PromptVersion

    # Metrics & analytics
    async def increment_generation_count(version_id)
    async def increment_success_count(version_id)
    async def get_assets_for_version(version_id) -> List[Asset]
    async def get_version_for_asset(asset_id) -> PromptVersion
```

### API Endpoints
**File**: `pixsim7/backend/main/api/v1/prompts.py`

**Plugin Registration**: `pixsim7/backend/main/routes/prompts/manifest.py`
- Auto-registers routes at `/api/v1/prompts/*` during app startup
- Declares dependencies on `auth` and `assets` routes

**Endpoints**:
```
POST   /api/v1/prompts/families
GET    /api/v1/prompts/families
GET    /api/v1/prompts/families/{family_id}
POST   /api/v1/prompts/families/{family_id}/versions
GET    /api/v1/prompts/families/{family_id}/versions
GET    /api/v1/prompts/versions/{version_id}
POST   /api/v1/prompts/versions/fork-from-artifact
GET    /api/v1/prompts/versions/{version_id}/assets
GET    /api/v1/prompts/assets/{asset_id}/prompt-version
```

### Pipeline Integration
**File**: `pixsim7/backend/main/services/submission/pipeline.py`

**Changes**:
```python
async def run(self, job: Job) -> PipelineResult:
    # Extract versioning info from job params
    prompt_version_id = job.params.get("prompt_version_id")
    final_prompt = job.params.get("prompt") or canonical.get("prompt")

    # Store in artifact
    artifact = GenerationArtifact(
        ...
        prompt_version_id=prompt_version_id,
        final_prompt=final_prompt,
    )

    # Auto-increment usage counter
    if prompt_version_id:
        await PromptVersionService(db).increment_generation_count(prompt_version_id)
```

## Usage Examples

### Creating a Prompt Family & Versions

```python
# 1. Create family
POST /api/v1/prompts/families
{
  "title": "Bench Kiss at Dusk",
  "slug": "bench-kiss-dusk",
  "prompt_type": "visual",
  "category": "romance",
  "tags": ["intimacy:high", "location:park"]
}

# Response: { "id": "uuid-123", ... }

# 2. Create version 1
POST /api/v1/prompts/families/uuid-123/versions
{
  "prompt_text": "Two people kissing on park bench, sunset lighting",
  "commit_message": "Initial version",
  "variables": {},
  "tags": ["tested"]
}

# Response: { "id": "uuid-v1", "version_number": 1, ... }

# 3. Create version 2 (iteration)
POST /api/v1/prompts/families/uuid-123/versions
{
  "prompt_text": "Two people kissing on park bench, golden hour, dramatic lighting, cinematic framing",
  "commit_message": "Improved lighting and composition",
  "parent_version_id": "uuid-v1",
  "tags": ["production"]
}

# Response: { "id": "uuid-v2", "version_number": 2, ... }
```

### Using Versioned Prompt for Generation

```python
# Option 1: Pass version_id in job params
POST /api/v1/jobs
{
  "operation_type": "text_to_video",
  "provider_id": "pixverse",
  "params": {
    "prompt": "Two people kissing on park bench, golden hour...",
    "prompt_version_id": "uuid-v2",  # ← Links to version
    "quality": "720p",
    "duration": 5
  }
}

# The pipeline automatically:
# - Links GenerationArtifact.prompt_version_id → uuid-v2
# - Stores GenerationArtifact.final_prompt = "Two people..."
# - Increments PromptVersion.generation_count
```

### Forking from Existing Asset

```python
# Create new version from an asset's prompt
POST /api/v1/prompts/versions/fork-from-artifact
{
  "artifact_id": 456,
  "family_id": "uuid-123",
  "commit_message": "Forked from successful generation",
  "modifications": "Two people kissing on park bench, golden hour, add soft bokeh"
}

# Response: { "id": "uuid-v3", "version_number": 3, ... }
```

### Tracking Performance

```python
# Get all assets generated from a version
GET /api/v1/prompts/versions/uuid-v2/assets

# Response:
{
  "version_id": "uuid-v2",
  "asset_count": 15,
  "assets": [
    { "id": 789, "remote_url": "...", "created_at": "..." },
    ...
  ]
}

# Find which version created an asset
GET /api/v1/prompts/assets/789/prompt-version

# Response:
{
  "id": "uuid-v2",
  "version_number": 2,
  "prompt_text": "...",
  "generation_count": 15,
  "successful_assets": 12
}
```

### Version History

```python
# List all versions for a family
GET /api/v1/prompts/families/uuid-123/versions

# Response:
[
  {
    "id": "uuid-v3",
    "version_number": 3,
    "commit_message": "Forked from successful generation",
    "generation_count": 2,
    "created_at": "2025-11-17T05:00:00Z"
  },
  {
    "id": "uuid-v2",
    "version_number": 2,
    "commit_message": "Improved lighting and composition",
    "generation_count": 15,
    "created_at": "2025-11-17T04:30:00Z"
  },
  {
    "id": "uuid-v1",
    "version_number": 1,
    "commit_message": "Initial version",
    "generation_count": 3,
    "created_at": "2025-11-17T04:00:00Z"
  }
]
```

## Integration Points

### Phase 1 (Complete)

✅ **JobSubmissionPipeline**: Extracts `prompt_version_id` from job params
✅ **GenerationArtifact**: Stores linkage to prompt version
✅ **Metrics**: Auto-increments generation_count on artifact creation

### Phase 2 (Complete)

✅ **Diff Generation**: Auto-populates `diff_from_parent` when creating versions
✅ **Diff API**: Endpoints for viewing diffs and comparing versions
✅ **Analytics**: Comprehensive performance metrics and success rates
✅ **Top Performers**: Query best performing versions by various metrics

### Phase 3 (Complete)

✅ **Batch Operations**: Create multiple versions at once
✅ **Import/Export**: Portable JSON format with external prompt support
✅ **Template Validation**: Variable substitution with type checking
✅ **Historical Inference**: Backfill versions from existing assets
✅ **Similarity Search**: Find similar prompts across families

### Future (Phase 4+)

⏳ **ActionEngine**: Use versioned prompts in ActionBlocks
⏳ **NarrativeEngine**: Link dialogue prompts to versions
⏳ **Game Integration**: World-specific prompt overrides
⏳ **A/B Testing**: Multi-variant testing framework

## Database Migration

**Migration ID**: `7ed0db0fe547`
**Revision**: `a786922d98aa → 7ed0db0fe547`

```bash
# Apply migration
alembic upgrade head

# Rollback (if needed)
alembic downgrade -1
```

**Migration creates**:
- `prompt_families` table
- `prompt_versions` table
- Adds columns to `generation_artifacts`

**Safe to rollback**: Yes, but loses all prompt versioning data

## Testing

**Verification**:
```bash
# Test imports
PYTHONPATH=G:/code/pixsim7 python -c "
from pixsim7.backend.main.domain import PromptFamily, PromptVersion
from pixsim7.backend.main.services.prompts import PromptVersionService
print('All imports successful!')
"

# Check migration status
alembic current

# Start server
python pixsim7/backend/main/main.py
```

**API Testing**:
```bash
# Create family
curl -X POST http://localhost:8000/api/v1/prompts/families \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Family",
    "prompt_type": "visual",
    "category": "test"
  }'

# List families
curl http://localhost:8000/api/v1/prompts/families \
  -H "Authorization: Bearer <token>"
```

## Key Design Decisions

### 1. Loose Coupling with Jobs/Artifacts
**Decision**: Add optional `prompt_version_id` to `GenerationArtifact`
**Rationale**:
- Minimal disruption to existing pipeline
- Jobs can be purged while keeping artifact → prompt linkage
- No complex event tracking needed initially
- Backward compatible

### 2. UUID Primary Keys
**Decision**: Use UUIDs instead of integers
**Rationale**:
- Better for distributed systems
- Cross-platform compatibility
- Reduces collision risk when syncing across environments

### 3. Auto-Incrementing Version Numbers
**Decision**: Family-scoped version numbers (1, 2, 3...)
**Rationale**:
- Easy to understand (like Git tags)
- Better UX than UUIDs for version references
- Enforced via unique constraint

### 4. Simple Metrics First
**Decision**: Just `generation_count` and `successful_assets`
**Rationale**:
- Defer complex analytics until usage patterns emerge
- Easy to extend later
- No premature optimization

### 5. Renamed `metadata` Field
**Decision**: Use `family_metadata` instead of `metadata`
**Rationale**:
- `metadata` is reserved in SQLAlchemy
- Avoids naming conflicts
- More descriptive

## Phase 2: Completed Features ✅

### Diff Generation
- ✅ Automatic `diff_from_parent` population when creating versions
- ✅ Multiple diff formats: inline, unified, summary
- ✅ Compare any two versions
- ✅ Change statistics (additions, deletions, similarity score)

### Analytics
- ✅ Version-level analytics (success rates, usage stats, ratings)
- ✅ Family-level analytics (aggregate metrics, best performers)
- ✅ Top performing versions query (by success_rate, total_generations, avg_rating)
- ✅ Comprehensive metrics dashboard

### New API Endpoints (Phase 2)
```
GET    /api/v1/prompts/versions/{version_id}/diff?format=inline
GET    /api/v1/prompts/versions/compare?from_version_id=X&to_version_id=Y&format=unified
GET    /api/v1/prompts/versions/{version_id}/analytics
GET    /api/v1/prompts/families/{family_id}/analytics
GET    /api/v1/prompts/analytics/top-performing?metric=success_rate&limit=10
```

## Phase 3: Completed Features ✅

### Batch Operations
- ✅ Create multiple versions in a single request
- ✅ Bulk import/migration support
- ✅ Atomic batch creation with rollback on error

### Import/Export
- ✅ Export families to portable JSON format
- ✅ Import structured exports from other systems
- ✅ **Import plain text prompts** from external sources (Midjourney, DALL-E, etc.)
- ✅ Auto-resolve slug conflicts
- ✅ Preserve or override metadata (authors, timestamps)
- ✅ Optional analytics inclusion in exports

### Template Validation
- ✅ Variable extraction from {{template}} syntax
- ✅ Type validation (string, int, float, bool, enum)
- ✅ Required variable checking
- ✅ Default values support
- ✅ Enum value validation
- ✅ Template rendering with substitution
- ✅ Validation errors and warnings

### Historical Inference
- ✅ Backfill prompt versions from existing assets
- ✅ Extract prompts from generation artifacts
- ✅ Link artifacts to new versions
- ✅ Skip already-linked artifacts
- ✅ Batch inference for multiple assets

### Similarity Search
- ✅ Text similarity scoring (combined: sequence + token + n-gram)
- ✅ Configurable threshold filtering
- ✅ Family-scoped search
- ✅ Keyword extraction
- ✅ Duplicate detection

### New API Endpoints (Phase 3)
```
POST   /api/v1/prompts/families/{id}/versions/batch
GET    /api/v1/prompts/families/{id}/export?include_versions=true&include_analytics=false
POST   /api/v1/prompts/families/import
POST   /api/v1/prompts/families/{id}/infer-from-assets
GET    /api/v1/prompts/search/similar?prompt=...&threshold=0.5
POST   /api/v1/prompts/templates/validate
POST   /api/v1/prompts/templates/render
```

### Example: External Prompt Import
```python
# Import a plain text prompt from Midjourney
POST /api/v1/prompts/families/import
{
  "import_data": "cinematic shot of a futuristic city, neon lights, rain, cyberpunk aesthetic, 8k",
  "preserve_metadata": false
}

# System automatically creates:
# - New family "Imported Prompt"
# - Version 1 with the prompt text
# - Auto-resolved slug if conflicts exist
```

### Example: Template Usage
```python
# Create template version
POST /api/v1/prompts/families/{id}/versions
{
  "prompt_text": "{{character}} at {{location}}, {{lighting}} lighting, {{mood}} mood",
  "variables": {
    "character": {"type": "string", "required": true},
    "location": {"type": "string", "required": true},
    "lighting": {"type": "enum", "enum_values": ["golden hour", "dramatic", "soft"], "default": "golden hour"},
    "mood": {"type": "string", "default": "romantic"}
  },
  "commit_message": "Created reusable character scene template"
}

# Render template
POST /api/v1/prompts/templates/render
{
  "prompt_text": "{{character}} at {{location}}, {{lighting}} lighting",
  "variables": {
    "character": "John",
    "location": "park bench",
    "lighting": "golden hour"
  }
}
# Returns: "John at park bench, golden hour lighting"
```

## Future Enhancements

### Phase 4: Game Integration & Advanced Features
- [ ] Per-world prompt overrides (`prompt_world_override` table)
- [ ] ActionEngine integration (use versioned prompts in blocks)
- [ ] NarrativeEngine integration (dialogue prompt versions)
- [ ] Automatic prompt selection based on game context
- [ ] Multi-variant branching (A/B testing for prompts)

### Phase 4: Advanced Features
- [ ] Branching/merging support (Git-like workflows)
- [ ] Semantic similarity search (find similar prompts)
- [ ] A/B testing framework
- [ ] Prompt templates with variable validation
- [ ] Collaborative editing with conflict resolution

### Phase 5: Preview/Test Tracking
- [ ] `prompt_execution` table for non-generation uses
- [ ] Preview mode tracking (test prompts without jobs)
- [ ] Dry run support (validate before spending credits)
- [ ] Historical inference (discover versions for old assets)

## Troubleshooting

### Migration Fails

**Error**: `ValueError: typing.Any has no matching SQLAlchemy type`
**Fix**: Ensure `prompt_version_id` uses `Optional[UUID]` not `Optional[Any]`

**Error**: `Attribute name 'metadata' is reserved`
**Fix**: Use `family_metadata` instead of `metadata` in domain model

### Import Errors

**Error**: `ModuleNotFoundError: No module named 'pixsim7.backend.main'`
**Fix**: Set `PYTHONPATH=G:/code/pixsim7` before running

### Version Number Conflicts

**Error**: `duplicate key value violates unique constraint`
**Fix**: Version numbers auto-increment per family - check if version already exists

## Related Documentation

- [ACTION_PROMPT_ENGINE_SPEC.md](./ACTION_PROMPT_ENGINE_SPEC.md) - Action block prompt system
- [NARRATIVE_PROMPT_ENGINE_SPEC.md](./NARRATIVE_PROMPT_ENGINE_SPEC.md) - Narrative prompt system
- [ACTION_ENGINE_USAGE.md](./ACTION_ENGINE_USAGE.md) - How action prompts are used
- [NARRATIVE_ENGINE_USAGE.md](./NARRATIVE_ENGINE_USAGE.md) - How narrative prompts are used

## Contributors

- Implementation: Claude Sonnet 4.5 (2025-11-17)
- Design: Claude Opus 4 (2025-11-17)
- Architecture Review: Feedback-driven pragmatic approach

---

**Last Updated**: 2025-11-17
**Next Review**: Before Phase 4 implementation
