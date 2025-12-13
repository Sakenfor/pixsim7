# Content Domain

The Content domain handles asset generation, video provider integration, generation workflows, and asset management for all generated media.

## Entry Module

```python
from pixsim7.backend.content import (
    # Core Models
    Asset, AssetVariant, Generation, ProviderSubmission,
    ProviderAccount, ProviderCredit,
    # Enums
    MediaType, GenerationStatus, OperationType,
    AccountStatus, ProviderStatus, ContentDomain,
    # Generation Services
    GenerationService, GenerationCreationService,
    GenerationLifecycleService, GenerationQueryService,
    GenerationRetryService,
    # Asset Services
    AssetService, AssetCoreService, AssetSyncService,
    AssetEnrichmentService, AssetBranchingService,
)
```

## Architecture

```
pixsim7/backend/main/
├── domain/                    # Domain models (shared)
│   ├── asset.py               # Asset, AssetVariant
│   ├── generation.py          # Generation, ProviderSubmission
│   ├── provider_account.py    # ProviderAccount, ProviderCredit
│   └── enums.py               # MediaType, GenerationStatus, etc.
├── services/generation/       # Generation workflow
│   ├── creation_service.py    # Create generation requests
│   ├── lifecycle_service.py   # Status transitions
│   ├── query_service.py       # Query/filter generations
│   ├── retry_service.py       # Retry failed generations
│   ├── billing_service.py     # Credit/billing integration
│   └── telemetry_service.py   # Usage tracking
├── services/asset/            # Asset management
│   ├── core_service.py        # CRUD operations
│   ├── sync_service.py        # Provider sync
│   ├── enrichment_service.py  # Metadata extraction
│   ├── branching_service.py   # Asset variants
│   └── lineage_service.py     # Asset lineage tracking
├── providers/                 # Provider adapters
│   ├── pixverse/              # Pixverse integration
│   ├── sora/                  # OpenAI Sora
│   ├── anthropic_llm/         # Claude models
│   └── openai_llm/            # OpenAI models
└── workers/                   # Background processing
    ├── job_processor.py       # Process generation jobs
    └── status_poller.py       # Poll provider status
```

## Key Models

### Asset

Represents generated or uploaded media content.

```python
class Asset(SQLModel, table=True):
    id: int
    user_id: int
    media_type: MediaType      # video, image, audio, text, 3d_model
    provider: str              # pixverse, sora, openai, local
    url: str                   # Primary asset URL
    thumbnail_url: str
    metadata: dict             # Provider-specific metadata
    duration: float            # For video/audio
    frame_count: int           # For video
    resolution: str            # e.g., "1024x1024"
    sync_status: SyncStatus    # pending, synced, failed
```

### AssetVariant

Different versions/variants of an asset.

```python
class AssetVariant(SQLModel, table=True):
    id: int
    asset_id: int
    variant_type: str          # upscaled, compressed, cropped, etc.
    url: str
    metadata: dict
```

### Generation

A generation request/job tracking.

```python
class Generation(SQLModel, table=True):
    id: int
    user_id: int
    operation_type: OperationType  # text_to_video, image_to_video, etc.
    status: GenerationStatus       # pending, processing, completed, failed
    prompt: str
    source_image_url: str          # For image-to-video
    provider: str
    result_asset_id: int           # Resulting Asset
    created_at: datetime
    completed_at: datetime
    error_message: str
    retry_count: int
```

**Generation Statuses:**
- `pending` - Queued, waiting to submit
- `submitted` - Submitted to provider
- `processing` - Provider is generating
- `completed` - Successfully completed
- `failed` - Failed (can be retried)
- `cancelled` - User cancelled

### ProviderSubmission

Tracks submission to external providers (Pixverse, Sora, etc.).

```python
class ProviderSubmission(SQLModel, table=True):
    id: int
    generation_id: int
    provider: str
    provider_job_id: str       # Provider's internal job ID
    status: ProviderStatus        # Provider-specific status
    submitted_at: datetime
    polled_at: datetime
    raw_response: dict         # Full provider response
```

### ProviderAccount

Provider account/credentials for generation.

```python
class ProviderAccount(SQLModel, table=True):
    id: int
    user_id: int
    provider: str              # pixverse, sora, etc.
    account_email: str
    status: AccountStatus      # active, suspended, expired
    credits_remaining: int
    auth_data: dict            # Encrypted credentials/tokens
```

### ProviderCredit

Credit usage tracking.

```python
class ProviderCredit(SQLModel, table=True):
    id: int
    account_id: int
    generation_id: int
    credits_used: int
    operation_type: str
    timestamp: datetime
```

## Generation Workflow

### Creating a Generation

```python
from pixsim7.backend.content import GenerationCreationService, OperationType

service = GenerationCreationService(db)

# Text-to-video generation
generation = await service.create_generation(
    user_id=user.id,
    operation_type=OperationType.text_to_video,
    prompt="A cat playing piano",
    provider="pixverse",
    account_id=account.id,
    parameters={
        "duration": 4.0,
        "aspect_ratio": "16:9",
        "style": "realistic"
    }
)
```

### Lifecycle Management

```python
from pixsim7.backend.content import GenerationLifecycleService

lifecycle = GenerationLifecycleService(db)

# Submit to provider
await lifecycle.submit_generation(generation.id)

# Check status
status = await lifecycle.get_generation_status(generation.id)

# Mark as completed
await lifecycle.mark_completed(
    generation_id=generation.id,
    asset_id=asset.id,
    metadata={"duration": 4.5, "resolution": "1024x576"}
)

# Mark as failed
await lifecycle.mark_failed(
    generation_id=generation.id,
    error="Provider timeout"
)
```

### Querying Generations

```python
from pixsim7.backend.content import GenerationQueryService, GenerationStatus

query = GenerationQueryService(db)

# Get user's generations
generations = await query.get_user_generations(
    user_id=user.id,
    limit=50,
    offset=0
)

# Filter by status
pending = await query.get_by_status(
    user_id=user.id,
    status=GenerationStatus.pending
)

# Get recent completions
recent = await query.get_recent_completed(
    user_id=user.id,
    hours=24
)
```

### Retry Failed Generations

```python
from pixsim7.backend.content import GenerationRetryService

retry_service = GenerationRetryService(db)

# Retry a failed generation
new_generation = await retry_service.retry_generation(
    generation_id=failed_gen.id,
    account_id=account.id  # Optional: use different account
)

# Auto-retry all recent failures
await retry_service.retry_recent_failures(
    user_id=user.id,
    max_age_hours=24,
    max_retries=3
)
```

## Asset Management

### Creating Assets

```python
from pixsim7.backend.content import AssetCoreService, MediaType

asset_service = AssetCoreService(db)

# Create asset from provider response
asset = await asset_service.create_asset(
    user_id=user.id,
    media_type=MediaType.video,
    provider="pixverse",
    url="https://provider.com/video.mp4",
    thumbnail_url="https://provider.com/thumb.jpg",
    metadata={
        "duration": 4.5,
        "fps": 30,
        "resolution": "1024x576"
    }
)

# Create variant
variant = await asset_service.create_variant(
    asset_id=asset.id,
    variant_type="upscaled",
    url="https://provider.com/video_4k.mp4",
    metadata={"resolution": "3840x2160"}
)
```

### Syncing Assets

```python
from pixsim7.backend.content import AssetSyncService

sync_service = AssetSyncService(db, storage)

# Download and sync asset to local storage
await sync_service.sync_asset(asset.id)

# Sync all pending assets
await sync_service.sync_pending_assets(user_id=user.id)

# Check sync status
is_synced = await sync_service.is_asset_synced(asset.id)
```

### Asset Enrichment

```python
from pixsim7.backend.content import AssetEnrichmentService

enrichment = AssetEnrichmentService(db)

# Extract metadata (duration, resolution, frame count)
await enrichment.enrich_asset(asset.id)

# Extract frames for thumbnails
frames = await enrichment.extract_key_frames(
    asset_id=asset.id,
    count=5
)

# Generate embeddings for search
await enrichment.generate_embeddings(asset.id)
```

### Asset Branching

```python
from pixsim7.backend.content import AssetBranchingService

branching = AssetBranchingService(db)

# Create a branch (alternate version)
branch = await branching.create_branch(
    parent_asset_id=original_asset.id,
    name="Alternate Ending",
    description="Different conclusion"
)

# Add variants to branch
await branching.add_variant_to_branch(
    branch_id=branch.id,
    asset_id=alternate_asset.id
)

# Get all branches for an asset
branches = await branching.get_asset_branches(original_asset.id)
```

## Provider Integration

### Provider Adapters

Each provider has an adapter implementing common interface:

```python
# Example: Pixverse adapter
from pixsim7.backend.main.providers.pixverse import PixverseAdapter

adapter = PixverseAdapter(account)

# Submit generation
job_id = await adapter.submit_generation(
    prompt="A cat playing piano",
    params={"duration": 4.0}
)

# Check status
status = await adapter.get_job_status(job_id)

# Retrieve result
result = await adapter.get_result(job_id)
```

### Billing Integration

```python
from pixsim7.backend.content import GenerationBillingService

billing = GenerationBillingService(db)

# Check if user has credits
can_generate = await billing.check_credits(
    account_id=account.id,
    operation_type=OperationType.text_to_video,
    estimated_cost=10  # credits
)

# Deduct credits on success
await billing.deduct_credits(
    account_id=account.id,
    generation_id=generation.id,
    credits_used=10
)

# Get credit balance
balance = await billing.get_credit_balance(account.id)
```

## Background Workers

### Job Processor

Processes pending generation jobs:

```python
# workers/job_processor.py
async def process_generation_queue():
    while True:
        # Get next pending generation
        generation = await get_next_pending()

        if generation:
            # Submit to provider
            await submit_to_provider(generation)

        await asyncio.sleep(1)
```

### Status Poller

Polls providers for job status:

```python
# workers/status_poller.py
async def poll_provider_status():
    while True:
        # Get submissions in-progress
        submissions = await get_processing_submissions()

        for submission in submissions:
            # Poll provider
            status = await provider.get_status(submission.provider_job_id)

            if status.completed:
                await mark_completed(submission, status.result_url)
            elif status.failed:
                await mark_failed(submission, status.error)

        await asyncio.sleep(10)
```

## Integration with Other Domains

### With Game Domain

Generate assets for game scenes and NPCs:

```python
from pixsim7.backend.game import GameNPC, get_npc_component
from pixsim7.backend.content import GenerationCreationService

# Generate NPC portrait
npc_appearance = get_npc_component(npc, "appearance")
generation = await gen_service.create_generation(
    user_id=user.id,
    operation_type=OperationType.text_to_image,
    prompt=f"Portrait of {npc.name}: {npc_appearance['description']}",
    content_domain=ContentDomain.game_npc
)
```

### With Narrative Domain

Generate scenes from narrative action blocks:

```python
from pixsim7.backend.narrative import resolve_action_block_node
from pixsim7.backend.content import GenerationCreationService

# Action block triggers generation
sequence = await resolve_action_block_node(
    action_block_id=kiss_scene_block.id,
    npc=npc,
    session=session
)

if sequence.requires_generation:
    generation = await gen_service.create_generation(
        user_id=user.id,
        operation_type=OperationType.text_to_video,
        prompt=sequence.generation_prompt,
        content_domain=ContentDomain.narrative
    )
```

### With Automation Domain

Automation can capture screenshots for generation:

```python
from pixsim7.backend.automation import AutomationExecution
from pixsim7.backend.content import AssetCoreService, MediaType

# Upload screenshot from automation
asset = await asset_service.create_asset(
    user_id=user.id,
    media_type=MediaType.image,
    provider="local",
    url=screenshot_path,
    metadata={"source": "automation_capture"}
)

# Use as generation source
generation = await gen_service.create_generation(
    operation_type=OperationType.image_to_video,
    source_image_url=asset.url,
    prompt="Animate this scene"
)
```

## Cost Management

### Credit Deduction

```python
from pixsim7.backend.content import GenerationBillingService

billing = GenerationBillingService(db)

# Pre-check before generation
cost_estimate = await billing.estimate_cost(
    operation_type=OperationType.text_to_video,
    params={"duration": 4.0}
)

if await billing.check_credits(account.id, cost_estimate):
    # Create generation
    generation = await gen_service.create_generation(...)

    # Deduct on success (called by lifecycle service)
    await billing.deduct_credits(
        account_id=account.id,
        generation_id=generation.id,
        credits_used=cost_estimate
    )
else:
    raise InsufficientCreditsError()
```

### Credit Tracking

```python
# Get credit usage history
usage = await billing.get_credit_usage(
    account_id=account.id,
    start_date=datetime.now() - timedelta(days=30)
)

for entry in usage:
    print(f"{entry.timestamp}: {entry.credits_used} credits "
          f"for {entry.operation_type}")

# Get daily usage stats
stats = await billing.get_daily_usage_stats(
    account_id=account.id,
    days=30
)
```

## Extending Content Domain

### Adding New Operation Types

1. Add enum value to `OperationType` in `domain/enums.py`
2. Implement provider adapter method
3. Update cost estimation in `billing_service.py`
4. Add validation in `creation_service.py`

### Adding New Providers

1. Create provider adapter in `providers/<provider_name>/`
2. Implement `submit_generation()`, `get_status()`, `get_result()`
3. Add provider-specific models if needed
4. Update provider routing in `creation_service.py`

### Custom Asset Enrichment

```python
from pixsim7.backend.content import AssetEnrichmentService

class CustomEnrichmentService(AssetEnrichmentService):
    async def enrich_asset(self, asset_id: int):
        # Custom enrichment logic
        await super().enrich_asset(asset_id)

        # Add custom metadata
        await self.add_custom_metadata(asset_id)
```

## Best Practices

1. **Always check credits** before creating generations
2. **Handle retries gracefully** - providers can be flaky
3. **Track lineage** - use AssetBranch for alternate versions
4. **Sync assets** - don't rely solely on provider URLs (they expire)
5. **Monitor costs** - track credit usage per user/operation
6. **Use content domains** - tag assets with their purpose (game, narrative, etc.)
7. **Set timeouts** - generations can take minutes, set appropriate limits
8. **Cache results** - avoid regenerating identical prompts

## Related Domains

- **Game**: Generates assets for game scenes, NPCs, locations
- **Narrative**: Generates content from narrative action blocks
- **Automation**: Uses screenshots from automation as generation sources
- **Simulation**: Can trigger scheduled content generation

## Common Workflows

### Complete Text-to-Video Flow

```python
from pixsim7.backend.content import (
    GenerationCreationService, GenerationLifecycleService,
    AssetCoreService, AssetSyncService
)

# 1. Create generation request
gen_service = GenerationCreationService(db)
generation = await gen_service.create_generation(
    user_id=user.id,
    operation_type=OperationType.text_to_video,
    prompt="A cat playing piano",
    provider="pixverse",
    account_id=account.id
)

# 2. Worker submits to provider (background)
lifecycle = GenerationLifecycleService(db)
await lifecycle.submit_generation(generation.id)

# 3. Worker polls status (background)
# ... wait for completion ...

# 4. On completion, create asset
asset_service = AssetCoreService(db)
asset = await asset_service.create_asset(
    user_id=user.id,
    media_type=MediaType.video,
    provider="pixverse",
    url=result_url,
    metadata=provider_metadata
)

# 5. Link asset to generation
await lifecycle.mark_completed(generation.id, asset.id)

# 6. Sync to local storage
sync_service = AssetSyncService(db, storage)
await sync_service.sync_asset(asset.id)

# 7. Asset ready for use!
```
