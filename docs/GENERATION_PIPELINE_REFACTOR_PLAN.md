# PixSim7 Generation Pipeline Refactor Plan

## Executive Summary

After analyzing the current Job + GenerationArtifact architecture, I recommend **unifying them into a single `Generation` model** that serves as the canonical generation record. This eliminates conceptual duplication while preserving all necessary functionality.

---

## 1. Current Architecture Analysis

### Data Flow
```
User Request → Job → GenerationArtifact → ProviderSubmission → Asset
                ↑                              ↓
                └─────── status updates ───────┘
```

### Current Pain Points

1. **Two tables per generation** (Job + GenerationArtifact) with overlapping concerns
2. **Parameter stored 3x**: Job.params (raw), GenerationArtifact.canonical_params (normalized), ProviderSubmission.payload (provider-specific)
3. **Unclear lifecycle ownership**: Job tracks status but GenerationArtifact is the "canonical" record
4. **Indirect Asset→Artifact link**: Must go through Job to connect Asset to its GenerationArtifact
5. **Conceptual confusion**: Docs say Jobs are "ephemeral" but they're actually durable execution records

### What Works Well

1. **Clean provider abstraction**: Canonical params separate from provider-specific payloads
2. **Full audit trail**: ProviderSubmission captures exact provider interactions
3. **Prompt versioning integration**: Links prompt versions to generation artifacts
4. **Reproducibility**: Hash-based deduplication and grouping

---

## 2. Alternative Design Proposals

### Design A: Unified Generation Model (RECOMMENDED)

**Core Concept**: Merge Job + GenerationArtifact into a single `Generation` entity that is both the lifecycle tracker AND the canonical record.

#### Schema

```sql
-- Single canonical generation record
CREATE TABLE generations (
    -- Identity
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,

    -- What was requested
    operation_type VARCHAR NOT NULL,  -- IMAGE_TO_VIDEO, etc.
    provider_id VARCHAR NOT NULL,     -- pixverse, sora, etc.

    -- Parameters (3 levels)
    raw_params JSONB NOT NULL,        -- Original API request params
    canonical_params JSONB NOT NULL,  -- Normalized/canonicalized version
    -- provider_params removed - lives in provider_submission.payload

    -- Inputs tracking
    inputs JSONB,                      -- [{role: "seed_image", asset_id: "..."}, ...]
    reproducible_hash VARCHAR,         -- For deduplication/grouping

    -- Prompt versioning
    prompt_version_id UUID,            -- Link to prompt_versions table
    final_prompt TEXT,                 -- Actual prompt after substitution

    -- Lifecycle tracking
    status VARCHAR NOT NULL,           -- PENDING, PROCESSING, COMPLETED, FAILED
    priority INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    parent_generation_id UUID,         -- For retry chains

    -- Results
    asset_id UUID,                     -- Final output asset

    -- Metadata
    name VARCHAR,                      -- Optional user-friendly name
    description TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,

    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id),
    FOREIGN KEY (parent_generation_id) REFERENCES generations(id)
);

-- Queue for workers (optional, thin)
CREATE TABLE generation_queue (
    generation_id UUID PRIMARY KEY,
    priority INTEGER NOT NULL,
    scheduled_at TIMESTAMP,
    locked_by VARCHAR,                 -- Worker ID holding lock
    locked_at TIMESTAMP,

    FOREIGN KEY (generation_id) REFERENCES generations(id)
);
```

#### Relationships

```
Generation (canonical, durable)
    ├─→ PromptVersion (optional, for prompt tracking)
    ├─→ Asset (output, when completed)
    ├─→ ProviderSubmission[] (audit trail of attempts)
    └─→ Generation (parent, for retries)

ProviderSubmission (unchanged)
    ├─→ Generation (replaced job_id)
    └─→ ProviderAccount (which account used)

Asset (minor change)
    └─→ Generation (source_generation_id replaces source_job_id)
```

#### Benefits

1. **Single source of truth**: No more Job vs Artifact confusion
2. **Simpler queries**: Direct Generation→Asset→Generation lineage
3. **Clear lifecycle**: Generation tracks its own status/timing
4. **Preserves all functionality**: Params evolution, prompt versioning, reproducibility

### Design B: Request/Execution Split

**Core Concept**: Keep separation but clarify responsibilities. Rename to `GenerationRequest` (user intent) and `Generation` (execution record).

#### Schema

```sql
-- User's request (thin, queue-focused)
CREATE TABLE generation_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    operation_type VARCHAR NOT NULL,
    provider_id VARCHAR NOT NULL,
    params JSONB NOT NULL,             -- Raw request params only
    priority INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP,
    status VARCHAR NOT NULL,           -- QUEUED, EXECUTING, DONE
    created_at TIMESTAMP NOT NULL
);

-- Canonical execution record
CREATE TABLE generations (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,

    -- Canonical representation
    canonical_params JSONB NOT NULL,
    inputs JSONB,
    reproducible_hash VARCHAR,

    -- Prompt versioning
    prompt_version_id UUID,
    final_prompt TEXT,

    -- Execution tracking
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    error_message TEXT,

    -- Results
    asset_id UUID,

    FOREIGN KEY (request_id) REFERENCES generation_requests(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id)
);
```

#### Trade-offs

**Pros:**
- Clear separation of concerns
- Request can be deleted after execution
- Generation is immutable

**Cons:**
- Still two tables per generation
- More complex queries for full history
- Doesn't really solve the original complaint

---

## 3. Recommendation: Design A (Unified Generation)

### Why This Design Wins

1. **Simplicity without loss**: Merges two concepts that were artificially separated
2. **Better developer experience**: One model to query, understand, and maintain
3. **Preserves architecture principles**: Still has canonical params, provider abstraction, audit trail
4. **Natural lifecycle**: A generation goes from PENDING→PROCESSING→COMPLETED in one record
5. **Future-proof**: Can add preview/test flags, cost tracking, analytics without schema proliferation

### Trade-offs Acknowledged

1. **Mixes mutable and immutable data**: Status changes while params don't
   - **Mitigation**: Document which fields are immutable after creation

2. **Larger single table**: Combines lifecycle + canonical data
   - **Mitigation**: Proper indexing, potential archival strategy for old records

3. **Worker queue complexity**: Need to handle queue operations on main table
   - **Mitigation**: Optional thin `generation_queue` table for active items only

---

## 4. Concrete Refactor Plan

### Phase 1: Schema Migration

**Step 1.1: Create new generations table**

```python
# New migration: 20251118_create_unified_generations.py
def upgrade():
    op.create_table('generations',
        sa.Column('id', sa.UUID(), nullable=False, primary_key=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('workspace_id', sa.UUID(), nullable=False),
        sa.Column('operation_type', sa.String(), nullable=False),
        sa.Column('provider_id', sa.String(), nullable=False),

        # Three-level params
        sa.Column('raw_params', sa.JSON(), nullable=False),
        sa.Column('canonical_params', sa.JSON(), nullable=False),

        # Inputs and hash
        sa.Column('inputs', sa.JSON()),
        sa.Column('reproducible_hash', sa.String()),

        # Prompt versioning
        sa.Column('prompt_version_id', sa.UUID()),
        sa.Column('final_prompt', sa.Text()),

        # Lifecycle
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('priority', sa.Integer(), default=0),
        sa.Column('scheduled_at', sa.DateTime()),
        sa.Column('started_at', sa.DateTime()),
        sa.Column('completed_at', sa.DateTime()),
        sa.Column('error_message', sa.Text()),
        sa.Column('retry_count', sa.Integer(), default=0),
        sa.Column('parent_generation_id', sa.UUID()),

        # Results
        sa.Column('asset_id', sa.UUID()),

        # Metadata
        sa.Column('name', sa.String()),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),

        # Constraints
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id']),
        sa.ForeignKeyConstraint(['prompt_version_id'], ['prompt_versions.id']),
        sa.ForeignKeyConstraint(['parent_generation_id'], ['generations.id']),
    )

    # Indexes for common queries
    op.create_index('idx_generations_user_workspace', 'generations', ['user_id', 'workspace_id'])
    op.create_index('idx_generations_status', 'generations', ['status'])
    op.create_index('idx_generations_reproducible_hash', 'generations', ['reproducible_hash'])
```

**Step 1.2: Update related tables**

```python
def upgrade():
    # Update provider_submissions to reference generations
    op.add_column('provider_submissions',
        sa.Column('generation_id', sa.UUID())
    )

    # Update assets to reference generations
    op.add_column('assets',
        sa.Column('source_generation_id', sa.UUID())
    )

    # Update prompt_variant_feedback
    op.add_column('prompt_variant_feedback',
        sa.Column('generation_id', sa.UUID())
    )
```

### Phase 2: Domain Model Updates

**Step 2.1: Create new Generation model**

```python
# pixsim7_backend/domain/generation.py
from sqlalchemy import Column, String, JSON, DateTime, Integer, UUID, Text
from sqlalchemy.orm import relationship

class Generation(Base):
    """
    Unified generation record combining lifecycle tracking and canonical snapshot.

    This model represents a single generation request from creation to completion,
    serving as both the queue item for workers and the permanent record for analytics.

    Immutable fields (set once at creation):
    - operation_type, provider_id
    - raw_params, canonical_params
    - inputs, reproducible_hash
    - prompt_version_id, final_prompt

    Mutable fields (updated during lifecycle):
    - status, started_at, completed_at
    - error_message, retry_count
    - asset_id (set on completion)
    """
    __tablename__ = "generations"

    # Identity
    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, nullable=False)
    workspace_id = Column(UUID, nullable=False)

    # ... (schema from above)

    # Relationships
    asset = relationship("Asset", back_populates="generation")
    submissions = relationship("ProviderSubmission", back_populates="generation")
    prompt_version = relationship("PromptVersion", back_populates="generations")
    parent = relationship("Generation", remote_side=[id])
```

**Step 2.2: Update related models**

```python
# pixsim7_backend/domain/provider_submission.py
class ProviderSubmission(Base):
    # Change job_id to generation_id
    generation_id = Column(UUID, ForeignKey("generations.id"))
    generation = relationship("Generation", back_populates="submissions")

# pixsim7_backend/domain/asset.py
class Asset(Base):
    # Change source_job_id to source_generation_id
    source_generation_id = Column(UUID, ForeignKey("generations.id"))
    generation = relationship("Generation", back_populates="asset")
```

### Phase 3: Service Layer Updates

**Step 3.1: Create GenerationService**

```python
# pixsim7_backend/services/generation/generation_service.py
class GenerationService:
    """
    Unified service for generation lifecycle management.
    Replaces JobService.
    """

    async def create_generation(
        self,
        user_id: str,
        workspace_id: str,
        operation_type: OperationType,
        provider_id: str,
        params: dict,
        prompt_version_id: Optional[str] = None,
    ) -> Generation:
        """Create a new generation request."""

        # Canonicalize params
        canonical_params = canonicalize_parameters(
            params, operation_type, provider_id
        )

        # Derive inputs
        inputs = extract_inputs(params, operation_type)

        # Calculate hash
        reproducible_hash = calculate_generation_hash(
            operation_type, provider_id, canonical_params, inputs
        )

        # Resolve prompt if version provided
        final_prompt = None
        if prompt_version_id:
            prompt_version = await get_prompt_version(prompt_version_id)
            final_prompt = substitute_prompt_variables(
                prompt_version.prompt_text, params
            )

        generation = Generation(
            user_id=user_id,
            workspace_id=workspace_id,
            operation_type=operation_type,
            provider_id=provider_id,
            raw_params=params,
            canonical_params=canonical_params,
            inputs=inputs,
            reproducible_hash=reproducible_hash,
            prompt_version_id=prompt_version_id,
            final_prompt=final_prompt,
            status=GenerationStatus.PENDING,
        )

        await self.db.save(generation)
        return generation

    async def get_next_pending(self) -> Optional[Generation]:
        """Get next generation to process (for workers)."""
        return await self.db.query(Generation).filter(
            Generation.status == GenerationStatus.PENDING
        ).order_by(
            Generation.priority.desc(),
            Generation.created_at
        ).first()
```

**Step 3.2: Update Pipeline**

```python
# pixsim7_backend/services/submission/pipeline.py
class GenerationSubmissionPipeline:  # Renamed from JobSubmissionPipeline
    """Pipeline for processing generation requests through providers."""

    async def run(self, generation_id: str) -> PipelineResult:
        """Process a generation through provider submission."""

        # Load generation
        generation = await generation_service.get(generation_id)

        # Update status
        await generation_service.update_status(
            generation_id, GenerationStatus.PROCESSING
        )

        # Map to provider params
        provider = provider_registry.get(generation.provider_id)
        provider_params = provider.map_parameters(
            generation.canonical_params,
            generation.operation_type
        )

        # Create submission record
        submission = await submission_service.create(
            generation_id=generation_id,
            provider_id=generation.provider_id,
            operation_type=generation.operation_type,
            payload=provider_params,
        )

        try:
            # Submit to provider
            result = await provider.submit(provider_params)

            # Update submission with response
            await submission_service.update_response(
                submission.id, result
            )

            # Create asset
            asset = await asset_service.create_from_provider_result(
                result, source_generation_id=generation_id
            )

            # Update generation
            await generation_service.complete(
                generation_id, asset_id=asset.id
            )

            # Increment prompt metrics if applicable
            if generation.prompt_version_id:
                await prompt_service.increment_generation_count(
                    generation.prompt_version_id
                )

            return PipelineResult(success=True, asset=asset)

        except Exception as e:
            await generation_service.fail(
                generation_id, error=str(e)
            )
            raise
```

### Phase 4: API Updates

**Step 4.1: Update API endpoints**

```python
# pixsim7_backend/api/v1/generations.py  # Renamed from jobs.py
@router.post("/generations", response_model=GenerationResponse)
async def create_generation(
    request: CreateGenerationRequest,
    user: User = Depends(get_current_user),
):
    """Create a new generation request."""
    generation = await generation_service.create_generation(
        user_id=user.id,
        workspace_id=request.workspace_id,
        operation_type=request.operation_type,
        provider_id=request.provider_id,
        params=request.params,
        prompt_version_id=request.prompt_version_id,
    )

    # Queue for processing
    await generation_worker.enqueue(generation.id)

    return GenerationResponse.from_model(generation)

@router.get("/generations/{generation_id}")
async def get_generation(
    generation_id: str,
    user: User = Depends(get_current_user),
):
    """Get generation details."""
    generation = await generation_service.get(generation_id)

    # Verify access
    if generation.user_id != user.id:
        raise HTTPException(403, "Access denied")

    return GenerationResponse.from_model(generation)
```

### Phase 5: Worker Updates

**Step 5.1: Update automation worker**

```python
# pixsim7_backend/workers/automation.py
async def process_generations():
    """Main worker loop for processing generations."""
    while True:
        # Get next pending generation
        generation = await generation_service.get_next_pending()

        if not generation:
            await asyncio.sleep(1)
            continue

        # Process through pipeline
        logger.info(f"Processing generation {generation.id}")

        try:
            pipeline = GenerationSubmissionPipeline(
                generation_service=generation_service,
                provider_service=provider_service,
                # ...
            )

            result = await pipeline.run(generation.id)
            logger.info(f"Generation {generation.id} completed")

        except Exception as e:
            logger.error(f"Generation {generation.id} failed: {e}")
```

### Phase 6: Data Migration (if needed)

Since you mentioned there's no data in the database, we can skip data migration. But here's what it would look like:

```python
# migration/migrate_jobs_to_generations.py
async def migrate_existing_data():
    """One-time migration of existing jobs/artifacts to generations."""

    # Step 1: Migrate jobs + artifacts to generations
    jobs = await db.query(Job).all()

    for job in jobs:
        artifact = await db.query(GenerationArtifact).filter(
            GenerationArtifact.job_id == job.id
        ).first()

        generation = Generation(
            id=job.id,  # Preserve ID for relationships
            user_id=job.user_id,
            workspace_id=job.workspace_id,
            operation_type=job.operation_type,
            provider_id=job.provider_id,
            raw_params=job.params,
            canonical_params=artifact.canonical_params if artifact else job.params,
            inputs=artifact.inputs if artifact else None,
            reproducible_hash=artifact.reproducible_hash if artifact else None,
            prompt_version_id=artifact.prompt_version_id if artifact else None,
            final_prompt=artifact.final_prompt if artifact else None,
            status=job.status,
            priority=job.priority,
            scheduled_at=job.scheduled_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            error_message=job.error_message,
            retry_count=job.retry_count,
            parent_generation_id=job.parent_job_id,
            asset_id=job.asset_id,
            name=job.name,
            description=job.description,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

        await db.save(generation)

    # Step 2: Update foreign keys in related tables
    await db.execute("""
        UPDATE provider_submissions
        SET generation_id = job_id
    """)

    await db.execute("""
        UPDATE assets
        SET source_generation_id = source_job_id
    """)

    await db.execute("""
        UPDATE prompt_variant_feedback
        SET generation_id = generation_artifact_id
    """)
```

### Phase 7: Cleanup

**Step 7.1: Remove old tables and code**

```python
# Final migration after verification
def upgrade():
    op.drop_table('generation_artifacts')
    op.drop_table('jobs')

    # Drop old foreign key columns
    op.drop_column('provider_submissions', 'job_id')
    op.drop_column('assets', 'source_job_id')
    op.drop_column('prompt_variant_feedback', 'generation_artifact_id')
```

**Step 7.2: Remove old files**
- Delete: `pixsim7_backend/domain/job.py`
- Delete: `pixsim7_backend/domain/generation_artifact.py`
- Delete: `pixsim7_backend/services/job/`
- Delete: old migrations

---

## 5. Future Considerations

### Preview/Test Executions

Add flags to Generation model:

```python
class Generation(Base):
    # ...
    is_preview = Column(Boolean, default=False)  # Don't call provider
    is_test = Column(Boolean, default=False)     # Call provider but flag as test
```

Pipeline checks these flags:
```python
if generation.is_preview:
    # Skip provider, create mock asset
    asset = await create_preview_asset(generation)
elif generation.is_test:
    # Call provider with test flag
    result = await provider.submit(params, test_mode=True)
```

### Cost Tracking & Analytics

Add cost fields to Generation:

```python
class Generation(Base):
    # ...
    estimated_cost = Column(Numeric)  # Pre-execution estimate
    actual_cost = Column(Numeric)     # From provider response
    credits_used = Column(Integer)    # For credit-based systems
```

Analytics queries become simpler:
```sql
-- Total cost by user this month
SELECT user_id, SUM(actual_cost)
FROM generations
WHERE created_at >= '2024-11-01'
GROUP BY user_id;

-- Success rate by prompt version
SELECT prompt_version_id,
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as successful
FROM generations
GROUP BY prompt_version_id;
```

### Archival Strategy

For scaling, old generations can be archived:

```python
# Periodic job
async def archive_old_generations():
    cutoff = datetime.now() - timedelta(days=90)

    # Move to archive table
    await db.execute("""
        INSERT INTO generations_archive
        SELECT * FROM generations
        WHERE created_at < :cutoff
    """, {"cutoff": cutoff})

    # Delete from main table
    await db.execute("""
        DELETE FROM generations
        WHERE created_at < :cutoff
    """, {"cutoff": cutoff})
```

### Event-Driven Extensions

For future plugins/integrations:

```python
class GenerationEvents:
    CREATED = "generation.created"
    STARTED = "generation.started"
    COMPLETED = "generation.completed"
    FAILED = "generation.failed"

# In pipeline
await event_bus.publish(GenerationEvents.COMPLETED, {
    "generation_id": generation.id,
    "asset_id": asset.id,
    "prompt_version_id": generation.prompt_version_id,
})
```

This enables:
- Webhook notifications
- Analytics pipelines
- Cost tracking services
- Quality assessment systems

---

## Summary

The unified Generation model simplifies the architecture by:

1. **Merging Job + GenerationArtifact** into a single canonical record
2. **Preserving all functionality**: lifecycle tracking, canonical params, prompt versioning, audit trail
3. **Improving queries**: Direct Generation↔Asset↔Generation lineage
4. **Maintaining provider abstraction**: Canonical params remain separate from provider payloads
5. **Future-proofing**: Easy to add preview mode, cost tracking, archival

The refactor is straightforward since there's no existing data:
1. Create new schema
2. Update domain models
3. Replace JobService with GenerationService
4. Update pipeline and workers
5. Update APIs
6. Remove old code

This design scales well and provides a cleaner mental model for developers while preserving the good architectural decisions from the original design.