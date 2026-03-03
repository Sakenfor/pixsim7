# Sync Synthetic Generation Implementation Plan

## Overview

Make synced assets behave identically to locally-generated assets by creating synthetic Generation records during sync. This enables:
- Full lineage with metadata (sequence_order, time ranges, frames)
- Prompt version linkage and search
- Sibling/variation discovery via reproducible_hash
- Unified audit trail

## Current State Issues

| Issue | Impact |
|-------|--------|
| No Generation record for synced assets | No `source_generation_id`, lineage refresh Strategy 2 never runs |
| Enrichment uses `create_lineage_links()` not `_with_metadata()` | Loses sequence_order, time ranges, frame numbers |
| Pixverse extractor provides `image_index` but unused | sequence_order not set on lineage edges |
| No PromptVersion for synced prompts | Can't search assets by prompt |
| Paused frame uses wrong operation_type | `IMAGE_TO_VIDEO` instead of `FRAME_EXTRACTION` |

## GPT Review Fixes Applied

| Issue | Fix |
|-------|-----|
| SyntheticGenerationService flush without commit | Add explicit `await db.commit()` after creation |
| find_sibling_assets privacy leak | Filter by `user_id` (and optionally workspace_id) |
| Enrichment undefined variables | Define `create_mode`, proper role mapping, stable `operation_type` |
| Enum migration mismatch | Use `native_enum=False` pattern matching existing migrations |
| BillingState not imported | Add to imports in SyntheticGenerationService |
| Paused frame bug not addressed | Add Phase 3.2 to fix `create_asset_from_paused_frame` |
| Sparse metadata hash collisions | Include `provider_asset_id` as discriminator, skip hash when no inputs |

---

## Implementation Steps

### Phase 1: Model Changes

#### 1.1 Add GenerationOrigin enum

**File:** `pixsim7/backend/main/domain/enums.py`

```python
class GenerationOrigin(str, Enum):
    """Origin of generation record"""
    LOCAL = "local"          # Created via UI/API
    SYNC = "sync"            # Imported from provider
    MIGRATION = "migration"  # Backfilled from legacy data
```

#### 1.2 Add origin field to Generation model

**File:** `pixsim7/backend/main/domain/generation/models.py`

```python
from pixsim7.backend.main.domain.enums import GenerationOrigin

class Generation(SQLModel, table=True):
    # ... existing fields ...

    # Origin tracking (for sync vs local)
    origin: GenerationOrigin = Field(
        default=GenerationOrigin.LOCAL,
        sa_column=enum_column(GenerationOrigin, "generation_origin_enum"),
        description="Origin: local (UI/API), sync (imported), migration (backfill)"
    )
```

#### 1.3 Create migration

**File:** `pixsim7/backend/main/infrastructure/database/migrations/versions/YYYYMMDD_add_generation_origin.py`

```python
"""add origin field to generations table

Track whether generation was created locally, synced from provider, or backfilled.

Revision ID: <auto>
Revises: <auto>
Create Date: <auto>
"""
from alembic import op
import sqlalchemy as sa

revision = '<auto>'
down_revision = '<auto>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create generation_origin enum (follows existing pattern)
    generation_origin_enum = sa.Enum(
        'local', 'sync', 'migration',
        name='generation_origin_enum'
    )
    generation_origin_enum.create(op.get_bind(), checkfirst=True)

    # Add column with native_enum=False (matches enum_column pattern)
    op.add_column(
        'generations',
        sa.Column(
            'origin',
            sa.Enum(
                'local', 'sync', 'migration',
                name='generation_origin_enum',
                native_enum=False  # Matches enum_column pattern
            ),
            nullable=False,
            server_default='local'
        )
    )

    # Index for filtering by origin
    op.create_index('ix_generations_origin', 'generations', ['origin'])


def downgrade() -> None:
    op.drop_index('ix_generations_origin', table_name='generations')
    op.drop_column('generations', 'origin')
    sa.Enum(name='generation_origin_enum').drop(op.get_bind(), checkfirst=True)
```

---

### Phase 2: Synthetic Generation Service

#### 2.1 Create service

**File:** `pixsim7/backend/main/services/generation/synthetic.py`

```python
"""
SyntheticGenerationService - Create Generation records from synced assets

Creates synthetic Generation records from provider metadata, enabling:
- Full lineage with proper metadata
- Prompt version linkage
- Sibling discovery via reproducible_hash
- Unified audit trail
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import (
    Generation, GenerationStatus, GenerationOrigin,
    Asset, User, OperationType, BillingState,  # FIX: Added BillingState import
)
from pixsim7.backend.main.domain.assets.lineage import AssetLineage
from pixsim7.backend.main.services.prompt.operations import PromptOperationsService
from pixsim_logging import get_logger

logger = get_logger()


# Map Pixverse create_mode to OperationType
CREATE_MODE_TO_OPERATION = {
    "i2v": OperationType.IMAGE_TO_VIDEO,
    "t2v": OperationType.TEXT_TO_VIDEO,
    "extend": OperationType.VIDEO_EXTEND,
    "transition": OperationType.VIDEO_TRANSITION,
    "fusion": OperationType.FUSION,
}

# Map Pixverse create_mode to input roles
CREATE_MODE_TO_ROLE = {
    "i2v": "source_image",
    "extend": "source_video",
    "transition": "transition_input",
    "fusion": "composition_reference",
}


class SyntheticGenerationService:
    """
    Creates synthetic Generation records from synced asset metadata.

    Unlike normal generation creation:
    - Does NOT check dedup (synced assets already exist separately)
    - Does NOT queue jobs (already completed on provider)
    - Does NOT charge credits (already happened on provider)
    - DOES compute reproducible_hash (for sibling queries)
    - DOES create PromptVersion (for prompt search)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.prompt_service = PromptOperationsService(db)

    async def create_for_asset(
        self,
        asset: Asset,
        user: User,
        media_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Generation]:
        """
        Create synthetic Generation from asset's media_metadata.

        Args:
            asset: The synced asset
            user: Asset owner
            media_metadata: Provider metadata (defaults to asset.media_metadata)

        Returns:
            Created Generation or None if insufficient metadata
        """
        meta = media_metadata or asset.media_metadata or {}

        # Skip if already has generation
        if asset.source_generation_id:
            logger.debug(
                "synthetic_generation_skip_existing",
                asset_id=asset.id,
                existing_generation_id=asset.source_generation_id,
            )
            return None

        # Extract operation type from create_mode
        customer_paths = meta.get("customer_paths", {})
        create_mode = customer_paths.get("create_mode") or meta.get("create_mode", "i2v")
        operation_type = CREATE_MODE_TO_OPERATION.get(create_mode, OperationType.IMAGE_TO_VIDEO)

        # Extract prompt
        prompt_text = (
            customer_paths.get("prompt")
            or meta.get("prompt")
            or customer_paths.get("original_prompt")
            or meta.get("text")
        )

        # Find or create PromptVersion
        prompt_version_id = None
        if prompt_text:
            prompt_version = await self.prompt_service.find_or_create_version_by_text(
                text=prompt_text,
                user_id=user.id,
            )
            if prompt_version:
                prompt_version_id = prompt_version.id

        # Build canonical params from metadata
        canonical_params = self._build_canonical_params(meta, operation_type, asset)

        # Build inputs from existing lineage edges
        inputs = await self._build_inputs_from_lineage(asset.id, create_mode)

        # Compute reproducible hash (for sibling discovery, NOT dedup)
        # FIX: Only compute hash if we have meaningful inputs, otherwise skip
        # to avoid clustering unrelated assets with sparse/empty metadata
        reproducible_hash = None
        if inputs:
            reproducible_hash = Generation.compute_hash(canonical_params, inputs)
        else:
            logger.debug(
                "synthetic_generation_skip_hash",
                asset_id=asset.id,
                reason="no_inputs",
            )

        # Create synthetic generation
        generation = Generation(
            user_id=user.id,
            operation_type=operation_type,
            provider_id=asset.provider_id,
            raw_params={},  # Not available from sync
            canonical_params=canonical_params,
            inputs=inputs,
            reproducible_hash=reproducible_hash,
            prompt_version_id=prompt_version_id,
            final_prompt=prompt_text,
            status=GenerationStatus.COMPLETED,
            started_at=asset.created_at,
            completed_at=asset.created_at,
            asset_id=asset.id,
            account_id=asset.provider_account_id,
            origin=GenerationOrigin.SYNC,
            billing_state=BillingState.SKIPPED,  # Already paid on provider
        )

        self.db.add(generation)
        await self.db.flush()  # Get generation.id

        # Link asset back to generation
        asset.source_generation_id = generation.id

        # FIX: Explicit commit - FastAPI dependency doesn't auto-commit
        await self.db.commit()

        logger.info(
            "synthetic_generation_created",
            generation_id=generation.id,
            asset_id=asset.id,
            operation_type=operation_type.value,
            has_prompt=bool(prompt_text),
            input_count=len(inputs),
            reproducible_hash=reproducible_hash[:16] if reproducible_hash else None,
        )

        return generation

    def _build_canonical_params(
        self,
        meta: Dict[str, Any],
        operation_type: OperationType,
        asset: Asset,  # FIX: Added asset parameter for discriminator
    ) -> Dict[str, Any]:
        """
        Build canonical_params from provider metadata.

        Extracts provider-agnostic params that can be used for hash computation.

        FIX: Includes provider_asset_id as discriminator to prevent hash
        collisions when metadata is sparse.
        """
        customer_paths = meta.get("customer_paths", {})

        params = {
            "operation_type": operation_type.value,
            # FIX: Include provider_asset_id as discriminator for sparse metadata
            # This ensures unique hashes even when other metadata is missing
            "_provider_asset_id": asset.provider_asset_id,
        }

        # Duration
        duration = (
            customer_paths.get("duration")
            or meta.get("duration")
            or meta.get("video_duration")
        )
        if duration:
            params["duration"] = duration

        # Quality/resolution hints
        for key in ["quality", "resolution", "aspect_ratio", "style"]:
            if meta.get(key):
                params[key] = meta[key]
            elif customer_paths.get(key):
                params[key] = customer_paths[key]

        # Negative prompt
        negative_prompt = (
            customer_paths.get("negative_prompt")
            or meta.get("negative_prompt")
        )
        if negative_prompt:
            params["negative_prompt"] = negative_prompt

        # Seed (if available - helps identify exact regenerations)
        seed = meta.get("seed") or customer_paths.get("seed")
        if seed:
            params["seed"] = seed

        return params

    async def _build_inputs_from_lineage(
        self,
        child_asset_id: int,
        create_mode: str,
    ) -> List[Dict[str, Any]]:
        """
        Build Generation.inputs from existing AssetLineage edges.

        Reconstructs the inputs list from lineage, preserving:
        - sequence_order
        - relation_type → role
        - time/frame metadata
        """
        stmt = (
            select(AssetLineage)
            .where(AssetLineage.child_asset_id == child_asset_id)
            .order_by(AssetLineage.sequence_order.asc())
        )
        result = await self.db.execute(stmt)
        edges = result.scalars().all()

        inputs = []
        for edge in edges:
            role = self._relation_type_to_role(edge.relation_type, create_mode)

            input_entry = {
                "role": role,
                "asset": f"asset:{edge.parent_asset_id}",
                "sequence_order": edge.sequence_order,
            }

            # Add time metadata if present
            if edge.parent_start_time is not None or edge.parent_end_time is not None:
                input_entry["time"] = {}
                if edge.parent_start_time is not None:
                    input_entry["time"]["start"] = edge.parent_start_time
                if edge.parent_end_time is not None:
                    input_entry["time"]["end"] = edge.parent_end_time

            # Add frame metadata if present
            if edge.parent_frame is not None:
                input_entry["frame"] = edge.parent_frame

            inputs.append(input_entry)

        return inputs

    def _relation_type_to_role(self, relation_type: str, create_mode: str) -> str:
        """Map relation_type back to input role."""
        from pixsim7.backend.main.domain import relation_types

        RELATION_TO_ROLE = {
            relation_types.SOURCE_IMAGE: "source_image",
            relation_types.SOURCE_VIDEO: "source_video",
            relation_types.TRANSITION_INPUT: "transition_input",
            relation_types.KEYFRAME: "keyframe",
            relation_types.REFERENCE_IMAGE: "reference_image",
            relation_types.PAUSED_FRAME: "paused_frame",
            relation_types.COMPOSITION_MAIN_CHARACTER: "main_character",
            relation_types.COMPOSITION_COMPANION: "companion",
            relation_types.COMPOSITION_ENVIRONMENT: "environment",
            relation_types.COMPOSITION_STYLE_REFERENCE: "style_reference",
        }

        return RELATION_TO_ROLE.get(relation_type, CREATE_MODE_TO_ROLE.get(create_mode, "source"))


async def find_sibling_assets(
    db: AsyncSession,
    asset_id: int,
    user_id: int,  # FIX: Required for privacy - only return same user's assets
    workspace_id: Optional[int] = None,  # Optional workspace filter
) -> List[Asset]:
    """
    Find assets that are variations of the same generation request.

    Siblings share the same reproducible_hash (same inputs + params).

    FIX: Scoped by user_id to prevent privacy leak - hash collisions
    could otherwise surface other users' assets.
    """
    asset = await db.get(Asset, asset_id)
    if not asset or not asset.source_generation_id:
        return []

    # FIX: Verify the requesting user owns this asset
    if asset.user_id != user_id:
        return []

    generation = await db.get(Generation, asset.source_generation_id)
    if not generation or not generation.reproducible_hash:
        return []

    # FIX: Filter by user_id to prevent cross-user leaks
    stmt = (
        select(Asset)
        .join(Generation, Asset.source_generation_id == Generation.id)
        .where(Generation.reproducible_hash == generation.reproducible_hash)
        .where(Asset.user_id == user_id)  # FIX: Privacy filter
        .where(Asset.id != asset_id)
        .order_by(Asset.created_at.desc())
    )

    # Optional workspace filter
    if workspace_id is not None:
        stmt = stmt.where(Generation.workspace_id == workspace_id)

    result = await db.execute(stmt)
    return result.scalars().all()
```

---

### Phase 3: Fix Enrichment Service

#### 3.1 Update `_extract_and_register_embedded` to use metadata-aware lineage

**File:** `pixsim7/backend/main/services/asset/enrichment.py`

**Changes:**

```python
# Replace create_lineage_links with create_lineage_links_with_metadata

async def _extract_and_register_embedded(self, asset: Asset, user: User) -> None:
    """
    FIX: Use create_lineage_links_with_metadata instead of create_lineage_links
    to preserve sequence_order, time ranges, and frame metadata.
    """
    from pixsim7.backend.main.domain.providers.registry import registry
    from pixsim7.backend.main.services.asset.asset_factory import (
        add_asset,
        create_lineage_links_with_metadata,
    )
    from pixsim7.backend.main.domain.relation_types import SOURCE_IMAGE, DERIVATION, TRANSITION_INPUT
    from pixsim7.backend.main.domain.enums import OperationType, SyncStatus

    provider = registry.get(asset.provider_id)

    try:
        embedded = await provider.extract_embedded_assets(
            asset.provider_asset_id,
            asset.media_metadata or None,
        )
    except (AttributeError, Exception):
        embedded = []

    if not embedded:
        return

    # FIX: Extract create_mode ONCE at the start for stable operation_type
    meta = asset.media_metadata or {}
    customer_paths = meta.get("customer_paths", {})
    create_mode = customer_paths.get("create_mode") or meta.get("create_mode", "i2v")

    # FIX: Determine operation_type ONCE based on create_mode
    CREATE_MODE_TO_OPERATION = {
        "i2v": OperationType.IMAGE_TO_VIDEO,
        "t2v": OperationType.TEXT_TO_VIDEO,
        "extend": OperationType.VIDEO_EXTEND,
        "transition": OperationType.VIDEO_TRANSITION,
        "fusion": OperationType.FUSION,
    }
    operation_type = CREATE_MODE_TO_OPERATION.get(create_mode, OperationType.IMAGE_TO_VIDEO)

    # Collect all inputs for batch lineage creation
    parent_inputs = []

    for idx, item in enumerate(embedded):
        if item.get("type") not in {"image", "video"}:
            continue

        remote_url = item.get("remote_url")
        if not remote_url:
            continue

        provider_asset_id = item.get("provider_asset_id") or f"{asset.provider_asset_id}_emb_{idx}"
        media_type = MediaType.IMAGE if item.get("media_type") == "image" else MediaType.VIDEO

        newly_created = await add_asset(
            self.db,
            user_id=user.id,
            media_type=media_type,
            provider_id=asset.provider_id,
            provider_asset_id=provider_asset_id,
            provider_account_id=asset.provider_account_id,
            remote_url=remote_url,
            width=item.get("width"),
            height=item.get("height"),
            sync_status=SyncStatus.REMOTE,
            media_metadata=item.get("media_metadata"),
        )

        # FIX: Use helper method for role mapping
        role = self._get_role_from_item(item, create_mode)

        # FIX: Extract sequence_order from item metadata
        item_meta = item.get("media_metadata", {})
        transition_meta = item_meta.get("pixverse_transition", {})
        fusion_meta = item_meta.get("pixverse_fusion", {})

        sequence_order = (
            transition_meta.get("image_index")
            or fusion_meta.get("image_index")
            or idx
        )

        input_entry = {
            "role": role,
            "asset": f"asset:{newly_created.id}",
            "sequence_order": sequence_order,
        }

        # Extract time metadata from durations if present
        durations = transition_meta.get("durations", [])
        if durations and idx < len(durations):
            input_entry["time"] = {
                "start": sum(durations[:idx]),
                "end": sum(durations[:idx+1]),
            }

        parent_inputs.append(input_entry)

    # FIX: Create lineage with full metadata in one call
    if parent_inputs:
        await create_lineage_links_with_metadata(
            self.db,
            child_asset_id=asset.id,
            parent_inputs=parent_inputs,
            operation_type=operation_type,  # FIX: Use stable operation_type
        )

    def _get_role_from_item(self, item: Dict[str, Any], create_mode: str) -> str:
        """FIX: Helper to extract role from item or infer from create_mode."""
        # Check explicit relation_type from extractor
        relation_type = item.get("relation_type")
        if relation_type:
            # Map relation_type back to role
            RELATION_TO_ROLE = {
                "SOURCE_IMAGE": "source_image",
                "SOURCE_VIDEO": "source_video",
                "TRANSITION_INPUT": "transition_input",
                "COMPOSITION_MAIN_CHARACTER": "main_character",
                "COMPOSITION_ENVIRONMENT": "environment",
                "COMPOSITION_STYLE_REFERENCE": "style_reference",
            }
            return RELATION_TO_ROLE.get(relation_type, "source")

        # Infer from create_mode
        CREATE_MODE_TO_ROLE = {
            "i2v": "source_image",
            "extend": "source_video",
            "transition": "transition_input",
            "fusion": "composition_reference",
        }
        return CREATE_MODE_TO_ROLE.get(create_mode, "source")
```

#### 3.2 Fix paused frame operation_type

**File:** `pixsim7/backend/main/services/asset/enrichment.py`

**Changes to `create_asset_from_paused_frame`:**

```python
# Around line 302-308, change:

# OLD (wrong direction):
# await create_lineage_links(
#     db,
#     child_asset_id=asset.id,
#     parent_asset_ids=[video_asset.id],
#     relation_type=PAUSED_FRAME,
#     operation_type=OperationType.IMAGE_TO_VIDEO,  # WRONG
# )

# NEW (correct):
await create_lineage_links(
    db,
    child_asset_id=asset.id,
    parent_asset_ids=[video_asset.id],
    relation_type=PAUSED_FRAME,
    operation_type=OperationType.FRAME_EXTRACTION,  # FIX: Correct operation type
)
```

**Also add to enums.py if not present:**

```python
class OperationType(str, Enum):
    # ... existing ...
    FRAME_EXTRACTION = "frame_extraction"  # Extract frame from video
```

---

### Phase 4: Update Pixverse Sync Endpoint

#### 4.1 Modify sync to create synthetic generations

**File:** `pixsim7/backend/main/api/v1/pixverse_sync.py`

**Changes:**

```python
from pixsim7.backend.main.services.generation.synthetic import SyntheticGenerationService
from pixsim7.backend.main.services.asset.enrichment import AssetEnrichmentService

@router.post("/accounts/{account_id}/sync-assets")
async def sync_pixverse_assets(...):
    # ... existing code ...

    synthetic_service = SyntheticGenerationService(db)
    enrichment_service = AssetEnrichmentService(db)

    for v in videos:
        # ... existing asset creation ...

        asset = await add_asset(
            db,
            user_id=current_user.id,
            media_type=MediaType.VIDEO,
            provider_id="pixverse",
            provider_asset_id=vid,
            provider_account_id=account.id,
            remote_url=remote_url,
            sync_status=SyncStatus.REMOTE,
            media_metadata=v,
        )

        # NEW: Extract embedded assets and create lineage
        await enrichment_service._extract_and_register_embedded(asset, current_user)

        # NEW: Create synthetic generation
        await synthetic_service.create_for_asset(asset, current_user, v)

        video_stats["created"] += 1
```

---

### Phase 5: Update Lineage Refresh

#### 5.1 Handle synthetic generation creation in refresh

**File:** `pixsim7/backend/main/services/asset/lineage_refresh.py`

**Changes:**

```python
async def refresh_asset_lineage(
    self,
    asset_id: int,
    *,
    provider_id: Optional[str] = None,
    clear_existing: bool = True,
    include_generation_inputs: bool = True,
    create_synthetic_generation: bool = True,  # NEW
) -> Dict[str, Any]:
    # ... existing code ...

    # Strategy 1: Extract embedded assets (existing)
    await enrichment._extract_and_register_embedded(asset, user)

    # Strategy 2: Build lineage from Generation.inputs (existing)
    if include_generation_inputs and asset.source_generation_id:
        generation_lineage_count = await self._build_lineage_from_generation(...)

    # NEW Strategy 3: Create synthetic generation if none exists
    if create_synthetic_generation and not asset.source_generation_id:
        from pixsim7.backend.main.services.generation.synthetic import (
            SyntheticGenerationService
        )
        synthetic_service = SyntheticGenerationService(self.db)
        generation = await synthetic_service.create_for_asset(asset, user)
        if generation:
            result["synthetic_generation_id"] = generation.id

    return result
```

---

### Phase 6: Add Sibling Query API

#### 6.1 Add endpoint for finding siblings

**File:** `pixsim7/backend/main/api/v1/assets.py`

```python
from pixsim7.backend.main.services.generation.synthetic import find_sibling_assets

@router.get("/{asset_id}/siblings")
async def get_asset_siblings(
    asset_id: int,
    workspace_id: Optional[int] = Query(None, description="Filter by workspace"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_database),
):
    """
    Find sibling assets - variations generated from the same inputs.

    Siblings share the same reproducible_hash (same prompt + same input assets).

    FIX: Scoped by current_user.id to prevent privacy leaks.
    """
    # FIX: Pass user_id to find_sibling_assets for privacy
    siblings = await find_sibling_assets(
        db,
        asset_id=asset_id,
        user_id=current_user.id,  # FIX: Privacy filter
        workspace_id=workspace_id,
    )

    return {
        "asset_id": asset_id,
        "sibling_count": len(siblings),
        "siblings": [
            {
                "id": s.id,
                "provider_asset_id": s.provider_asset_id,
                "thumbnail_url": s.thumbnail_url,
                "created_at": s.created_at.isoformat(),
            }
            for s in siblings
        ],
    }
```

---

## Migration Strategy

### For Existing Synced Assets

Run a one-time migration to create synthetic generations:

```python
async def backfill_synthetic_generations(db: AsyncSession):
    """
    Create synthetic generations for existing synced assets.
    """
    from pixsim7.backend.main.services.generation.synthetic import SyntheticGenerationService

    # Find synced assets without source_generation_id
    stmt = (
        select(Asset)
        .where(Asset.sync_status == SyncStatus.REMOTE)
        .where(Asset.source_generation_id.is_(None))
        .where(Asset.media_metadata.isnot(None))
    )
    result = await db.execute(stmt)
    assets = result.scalars().all()

    service = SyntheticGenerationService(db)

    for asset in assets:
        user = await db.get(User, asset.user_id)
        if user:
            await service.create_for_asset(asset, user)

    await db.commit()
```

---

## Testing Checklist

- [ ] Sync creates Asset with synthetic Generation
- [ ] Generation.origin = "sync" for synced assets
- [ ] Generation.reproducible_hash computed correctly (includes provider_asset_id discriminator)
- [ ] Hash is NULL when no inputs (sparse metadata protection)
- [ ] Lineage edges have sequence_order from image_index
- [ ] PromptVersion created for synced prompts
- [ ] find_sibling_assets returns variations correctly
- [ ] find_sibling_assets filters by user_id (privacy test)
- [ ] Lineage refresh creates synthetic generation if missing
- [ ] Backfill migration works for existing assets
- [ ] Local generation still works (no regression)
- [ ] force_new=True still bypasses dedup for local
- [ ] Paused frame uses FRAME_EXTRACTION operation_type
- [ ] Transaction commits properly (no rollback at request end)

---

## File Summary

| File | Action |
|------|--------|
| `domain/enums.py` | Add GenerationOrigin enum + FRAME_EXTRACTION to OperationType |
| `domain/generation/models.py` | Add origin field |
| `migrations/YYYYMMDD_add_generation_origin.py` | Create migration (native_enum=False pattern) |
| `services/generation/synthetic.py` | NEW: SyntheticGenerationService + find_sibling_assets |
| `services/asset/enrichment.py` | Update to use create_lineage_links_with_metadata, fix paused frame op_type |
| `api/v1/pixverse_sync.py` | Call enrichment + synthetic generation, add commit |
| `services/asset/lineage_refresh.py` | Add synthetic generation creation option |
| `api/v1/assets.py` | Add siblings endpoint with user_id privacy filter |

## GPT Review Issues - Resolution Summary

| Issue | Resolution |
|-------|------------|
| flush without commit | Added `await self.db.commit()` after generation creation |
| Privacy leak in find_sibling_assets | Added `user_id` required parameter, filter in query |
| Undefined variables in enrichment | Defined `create_mode`, `operation_type`, `_get_role_from_item` |
| Enum migration mismatch | Use `native_enum=False` matching existing pattern |
| BillingState not imported | Added to imports in synthetic.py |
| Paused frame bug not addressed | Added Phase 3.2 with FRAME_EXTRACTION op_type |
| Sparse metadata hash collisions | Added `_provider_asset_id` discriminator, skip hash when no inputs |
