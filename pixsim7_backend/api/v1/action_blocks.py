"""Action Blocks API endpoints

REST API for managing database-backed action blocks including:
- CRUD operations
- Search and filtering
- AI extraction from complex prompts
- Block composition
- JSON migration
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.api.dependencies import get_db, get_current_user
from pixsim7_backend.services.action_blocks import (
    ActionBlockService,
    ActionBlockMigrationService,
    AIActionBlockExtractor,
    BlockCompositionEngine,
    ExtractionConfigService,
    ExtractionConfig
)
from pixsim7_backend.services.action_blocks.concept_registry_service import ConceptRegistry
from pixsim7_backend.domain.action_block import ActionBlockDB
from pixsim7_backend.domain.user import User

router = APIRouter(prefix="/action-blocks", tags=["action_blocks"])


# ===== Request/Response Models =====

class CreateActionBlockRequest(BaseModel):
    block_id: str = Field(..., description="Unique block identifier")
    kind: str = Field(..., description="'single_state' or 'transition'")
    prompt: str = Field(..., description="The prompt text")
    negative_prompt: Optional[str] = None
    style: Optional[str] = "soft_cinema"
    duration_sec: float = 6.0
    tags: Dict[str, Any] = Field(default_factory=dict)
    compatible_next: List[str] = Field(default_factory=list)
    compatible_prev: List[str] = Field(default_factory=list)
    package_name: Optional[str] = None
    description: Optional[str] = None


class UpdateActionBlockRequest(BaseModel):
    prompt: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None
    compatible_next: Optional[List[str]] = None
    compatible_prev: Optional[List[str]] = None
    description: Optional[str] = None


class ExtractBlocksRequest(BaseModel):
    prompt_text: str = Field(..., description="Complex prompt to extract blocks from")
    extraction_mode: str = Field(default="auto", description="'auto', 'aggressive', or 'conservative'")
    config_id: Optional[str] = Field(None, description="Extraction config to use (balanced, aggressive, conservative, etc)")
    source_prompt_version_id: Optional[UUID] = None


class ComposeBlocksRequest(BaseModel):
    block_ids: List[UUID] = Field(..., description="Ordered list of block IDs")
    composition_strategy: str = Field(default="sequential", description="'sequential', 'layered', or 'merged'")
    custom_separators: Optional[Dict[int, str]] = None
    validate_compatibility: bool = True


class ConfirmConceptsRequest(BaseModel):
    concepts: List[Dict[str, Any]] = Field(..., description="Concepts to confirm and formalize")
    confirmed_by: Optional[str] = None


class ActionBlockResponse(BaseModel):
    id: UUID
    block_id: str
    kind: str
    prompt: str
    tags: Dict[str, Any]
    complexity_level: str
    char_count: int
    word_count: int
    source_type: str
    package_name: Optional[str]
    usage_count: int
    success_count: int
    avg_rating: Optional[float]
    is_composite: bool
    created_at: str

    class Config:
        from_attributes = True


class ActionBlockDetailResponse(ActionBlockResponse):
    negative_prompt: Optional[str]
    style: Optional[str]
    duration_sec: float
    compatible_next: List[str]
    compatible_prev: List[str]
    reference_image: Optional[Dict[str, Any]]
    camera_movement: Optional[Dict[str, Any]]
    consistency: Optional[Dict[str, Any]]
    description: Optional[str]
    component_blocks: List[UUID]
    block_metadata: Dict[str, Any]
    created_by: Optional[str]
    updated_at: str


# ===== CRUD Endpoints =====

@router.post("", response_model=ActionBlockResponse)
async def create_action_block(
    request: CreateActionBlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new action block"""
    service = ActionBlockService(db)

    # Check if block_id already exists
    existing = await service.get_block_by_block_id(request.block_id)
    if existing:
        raise HTTPException(400, f"Block with block_id '{request.block_id}' already exists")

    block = await service.create_block(
        block_data=request.dict(),
        created_by=current_user.username if current_user else None
    )

    return block


@router.get("/{block_id}", response_model=ActionBlockDetailResponse)
async def get_action_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get action block by ID"""
    service = ActionBlockService(db)
    block = await service.get_block(block_id)

    if not block:
        raise HTTPException(404, "Block not found")

    return block


@router.get("/by-block-id/{block_id}", response_model=ActionBlockDetailResponse)
async def get_action_block_by_string_id(
    block_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get action block by block_id (string identifier)"""
    service = ActionBlockService(db)
    block = await service.get_block_by_block_id(block_id)

    if not block:
        raise HTTPException(404, "Block not found")

    return block


@router.patch("/{block_id}", response_model=ActionBlockResponse)
async def update_action_block(
    block_id: UUID,
    request: UpdateActionBlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update action block"""
    service = ActionBlockService(db)

    updates = {k: v for k, v in request.dict().items() if v is not None}
    block = await service.update_block(block_id, updates)

    if not block:
        raise HTTPException(404, "Block not found")

    return block


@router.delete("/{block_id}")
async def delete_action_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete action block"""
    service = ActionBlockService(db)
    success = await service.delete_block(block_id)

    if not success:
        raise HTTPException(404, "Block not found")

    return {"success": True, "message": "Block deleted"}


# ===== Search & Filter Endpoints =====

@router.get("", response_model=List[ActionBlockResponse])
async def search_action_blocks(
    kind: Optional[str] = Query(None, description="Filter by kind"),
    complexity_level: Optional[str] = Query(None, description="Filter by complexity"),
    package_name: Optional[str] = Query(None, description="Filter by package"),
    source_type: Optional[str] = Query(None, description="Filter by source type"),
    is_public: Optional[bool] = Query(None, description="Filter by public/private"),
    location: Optional[str] = Query(None, description="Filter by location tag"),
    mood: Optional[str] = Query(None, description="Filter by mood tag"),
    min_rating: Optional[float] = Query(None, description="Minimum rating"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Search and filter action blocks"""
    service = ActionBlockService(db)

    # Build tag filters
    tag_filters = {}
    if location:
        tag_filters["location"] = location
    if mood:
        tag_filters["mood"] = mood

    blocks = await service.search_blocks(
        kind=kind,
        complexity_level=complexity_level,
        package_name=package_name,
        source_type=source_type,
        is_public=is_public,
        tag_filters=tag_filters if tag_filters else None,
        min_rating=min_rating,
        limit=limit,
        offset=offset
    )

    return blocks


@router.get("/search/text", response_model=List[ActionBlockResponse])
async def search_by_text(
    q: str = Query(..., description="Search text"),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Search blocks by text in prompt or description"""
    service = ActionBlockService(db)
    blocks = await service.search_by_text(q, limit)
    return blocks


@router.get("/{block_id}/compatible", response_model=List[ActionBlockResponse])
async def get_compatible_blocks(
    block_id: str,
    direction: str = Query("next", description="'next' or 'prev'"),
    db: AsyncSession = Depends(get_db)
):
    """Get blocks compatible with given block"""
    service = ActionBlockService(db)
    blocks = await service.find_compatible_blocks(block_id, direction)
    return blocks


# ===== AI Extraction Endpoints =====

@router.post("/extract", response_model=Dict[str, Any])
async def extract_blocks_from_prompt(
    request: ExtractBlocksRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """AI-powered extraction of reusable blocks from complex prompt"""
    try:
        extractor = AIActionBlockExtractor(db)
    except (ImportError, ValueError) as e:
        raise HTTPException(500, f"AI extractor initialization failed: {str(e)}")

    result = await extractor.extract_blocks_from_prompt(
        prompt_text=request.prompt_text,
        extraction_mode=request.extraction_mode,
        source_prompt_version_id=request.source_prompt_version_id,
        created_by=current_user.username if current_user else None
    )

    return result


@router.post("/{block_id}/suggest-variables", response_model=Dict[str, Any])
async def suggest_variables(
    block_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """AI suggests which parts of block could be variables"""
    try:
        extractor = AIActionBlockExtractor(db)
    except (ImportError, ValueError) as e:
        raise HTTPException(500, f"AI extractor initialization failed: {str(e)}")

    result = await extractor.suggest_variables_for_block(block_id)
    return result


@router.post("/extract/with-concepts", response_model=Dict[str, Any])
async def extract_blocks_with_concept_discovery(
    request: ExtractBlocksRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Extract blocks AND discover new concepts interactively

    This enhanced extraction endpoint returns both:
    1. Extracted action blocks (standard extraction result)
    2. Concept discovery analysis with suggestions for user confirmation

    When new concepts are discovered, the user can review them and decide
    which ones to formalize as reusable tags/concepts for future prompts.
    """
    try:
        extractor = AIActionBlockExtractor(db)
    except (ImportError, ValueError) as e:
        raise HTTPException(500, f"AI extractor initialization failed: {str(e)}")

    result = await extractor.extract_blocks_with_concepts(
        prompt_text=request.prompt_text,
        extraction_mode=request.extraction_mode,
        source_prompt_version_id=request.source_prompt_version_id,
        created_by=current_user.username if current_user else None
    )

    return result


# ===== Concept Management Endpoints =====

@router.post("/concepts/confirm", response_model=Dict[str, Any])
async def confirm_concepts(
    request: ConfirmConceptsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Confirm and formalize new concepts discovered during extraction

    After receiving concept suggestions from /extract/with-concepts,
    use this endpoint to confirm which concepts should be formalized
    as reusable tags/concepts in the system.
    """
    registry = ConceptRegistry(db)

    result = await registry.confirm_concepts(
        concepts=request.concepts,
        confirmed_by=current_user.username if current_user else None
    )

    return result


@router.get("/concepts/stats", response_model=Dict[str, Any])
async def get_concept_stats(
    db: AsyncSession = Depends(get_db)
):
    """Get statistics about discovered concepts

    Returns:
    - Total unique block types
    - Total unique tags
    - Top used tags
    - Concept cache size
    """
    registry = ConceptRegistry(db)
    stats = await registry.get_concept_stats()
    return stats


@router.get("/concepts/suggestions", response_model=List[Dict[str, Any]])
async def get_concept_suggestions(
    prompt_text: str = Query(..., description="Prompt to analyze for concept suggestions"),
    db: AsyncSession = Depends(get_db)
):
    """Get concept suggestions for a new prompt based on similar prompts

    Analyzes the given prompt and suggests relevant concepts/tags
    based on similar prompts in the database.
    """
    registry = ConceptRegistry(db)

    suggestions = await registry.get_concept_suggestions(
        prompt_text=prompt_text
    )

    return suggestions


# ===== Extraction Config Endpoints =====

@router.get("/configs", response_model=List[Dict[str, Any]])
async def list_extraction_configs():
    """List all available extraction configurations

    Returns predefined system configs for different extraction strategies:
    - balanced: Default (4-6 blocks)
    - aggressive: Maximum granularity (8-12 blocks)
    - conservative: Minimal extraction (2-4 blocks)
    - narrative: Story-focused
    - technical: Camera/visual-focused
    - mixed: Comprehensive extraction
    """
    config_service = ExtractionConfigService()
    configs = config_service.list_configs()

    return [config.model_dump() for config in configs]


@router.get("/configs/{config_id}", response_model=Dict[str, Any])
async def get_extraction_config(
    config_id: str
):
    """Get details of a specific extraction config"""
    config_service = ExtractionConfigService()
    config = config_service.get_config(config_id)

    if not config:
        raise HTTPException(404, f"Config '{config_id}' not found")

    return config.model_dump()


@router.post("/configs/recommend", response_model=Dict[str, Any])
async def recommend_extraction_config(
    prompt_text: str = Query(..., description="Prompt to analyze"),
    preferred_config: Optional[str] = Query(None, description="Preferred config (optional)")
):
    """Recommend best extraction config for a given prompt

    Analyzes the prompt and suggests the most appropriate extraction
    strategy based on content (narrative vs technical), length, and complexity.
    """
    config_service = ExtractionConfigService()

    config = config_service.get_config_for_prompt(
        prompt_text=prompt_text,
        preferred_config=preferred_config
    )

    return {
        "recommended_config": config.model_dump(),
        "reason": "Based on prompt analysis",
        "prompt_length": len(prompt_text),
        "prompt_preview": prompt_text[:100] + "..." if len(prompt_text) > 100 else prompt_text
    }


# ===== Composition Endpoints =====

@router.post("/compose", response_model=Dict[str, Any])
async def compose_blocks(
    request: ComposeBlocksRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Compose new prompt from multiple blocks"""
    engine = BlockCompositionEngine(db)

    result = await engine.compose_from_blocks(
        block_ids=request.block_ids,
        composition_strategy=request.composition_strategy,
        custom_separators=request.custom_separators,
        validate_compatibility=request.validate_compatibility,
        created_by=current_user.username if current_user else None
    )

    return result


@router.post("/suggest-combinations", response_model=List[Dict[str, Any]])
async def suggest_combinations(
    seed_block_ids: List[UUID],
    target_complexity: Optional[str] = None,
    target_mood: Optional[str] = None,
    max_suggestions: int = Query(5, le=20),
    db: AsyncSession = Depends(get_db)
):
    """Suggest compatible block combinations"""
    engine = BlockCompositionEngine(db)

    suggestions = await engine.suggest_block_combinations(
        seed_block_ids=seed_block_ids,
        target_complexity=target_complexity,
        target_mood=target_mood,
        max_suggestions=max_suggestions
    )

    return suggestions


# ===== Migration Endpoints =====

@router.post("/migrate/json-to-db", response_model=Dict[str, Any])
async def migrate_json_to_database(
    json_file_path: Optional[str] = None,
    package_name: Optional[str] = None,
    clear_existing: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Migrate action blocks from JSON files to database"""
    service = ActionBlockMigrationService(db)

    stats = await service.migrate_json_to_database(
        json_file_path=json_file_path,
        package_name=package_name,
        clear_existing=clear_existing
    )

    return stats


@router.post("/migrate/db-to-json", response_model=Dict[str, Any])
async def export_database_to_json(
    package_name: Optional[str] = None,
    output_dir: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export database blocks to JSON files"""
    service = ActionBlockMigrationService(db)

    stats = await service.export_database_to_json(
        package_name=package_name,
        output_dir=output_dir
    )

    return stats


@router.get("/migrate/status", response_model=Dict[str, Any])
async def get_migration_status(
    db: AsyncSession = Depends(get_db)
):
    """Get sync status between JSON and database"""
    service = ActionBlockMigrationService(db)
    status = await service.get_migration_status()
    return status


# ===== Statistics Endpoints =====

@router.get("/statistics/overview", response_model=Dict[str, Any])
async def get_statistics(
    db: AsyncSession = Depends(get_db)
):
    """Get overall statistics about action blocks"""
    service = ActionBlockService(db)
    stats = await service.get_statistics()
    return stats


@router.get("/packages", response_model=List[str])
async def list_packages(
    db: AsyncSession = Depends(get_db)
):
    """List all package names"""
    service = ActionBlockService(db)
    # Get all unique package names
    from sqlalchemy import select, distinct
    from pixsim7_backend.domain.action_block import ActionBlockDB

    result = await db.execute(
        select(distinct(ActionBlockDB.package_name)).where(
            ActionBlockDB.package_name.isnot(None)
        )
    )
    packages = [p[0] for p in result.all()]
    return packages


@router.get("/packages/{package_name}/blocks", response_model=List[ActionBlockResponse])
async def get_package_blocks(
    package_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all blocks in a package"""
    service = ActionBlockService(db)
    blocks = await service.get_package_blocks(package_name)
    return blocks


# ===== Usage Tracking Endpoints =====

@router.post("/{block_id}/increment-usage")
async def increment_usage(
    block_id: UUID,
    success: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """Increment usage counter for a block"""
    service = ActionBlockService(db)
    await service.increment_usage(block_id, success)
    return {"success": True}


@router.post("/{block_id}/rate")
async def rate_block(
    block_id: UUID,
    rating: float = Query(..., ge=1.0, le=5.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Rate an action block"""
    service = ActionBlockService(db)
    await service.update_rating(block_id, rating)
    return {"success": True, "rating": rating}
