"""Block Templates API endpoints

REST API for managing block templates and rolling prompts:
- CRUD operations for templates
- Roll: randomly compose a prompt from template slot constraints
- Preview: count/sample matching blocks for a slot definition
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
from pixsim7.backend.main.domain.user import User

router = APIRouter(prefix="/block-templates", tags=["block-templates"])


# ===== Request/Response Models =====

class TemplateSlotInput(BaseModel):
    slot_index: int = Field(0, description="Ordering index")
    label: str = Field("", description="Human-readable slot label")
    role: Optional[str] = Field(None, description="Required block role")
    category: Optional[str] = Field(None, description="Required block category")
    kind: Optional[str] = Field(None, description="Block kind filter")
    intent: Optional[str] = Field(None, description="Block intent filter (generate/preserve/modify/add/remove)")
    complexity_min: Optional[str] = Field(None, description="Min complexity level")
    complexity_max: Optional[str] = Field(None, description="Max complexity level")
    package_name: Optional[str] = Field(None, description="Package filter")
    tag_constraints: Optional[Dict[str, Any]] = Field(None, description="Tag key-value filters")
    min_rating: Optional[float] = Field(None, description="Minimum avg_rating")
    selection_strategy: str = Field("uniform", description="uniform or weighted_rating")
    weight: float = Field(1.0, description="Composition weight")
    optional: bool = Field(False, description="Skip if no matches")
    fallback_text: Optional[str] = Field(None, description="Fallback text if no matches")
    exclude_block_ids: Optional[List[UUID]] = Field(None, description="Block IDs to exclude")


class CreateTemplateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    slots: List[TemplateSlotInput] = Field(default_factory=list)
    composition_strategy: str = Field("sequential")
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    template_metadata: Dict[str, Any] = Field(default_factory=dict)


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    slots: Optional[List[TemplateSlotInput]] = None
    composition_strategy: Optional[str] = None
    package_name: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    template_metadata: Optional[Dict[str, Any]] = None


class RollTemplateRequest(BaseModel):
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    exclude_block_ids: Optional[List[UUID]] = Field(None, description="Block IDs to exclude globally")


class PreviewSlotRequest(BaseModel):
    slot: TemplateSlotInput
    limit: int = Field(5, ge=1, le=20)


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slots: List[Dict[str, Any]] = Field(default_factory=list)
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    created_by: Optional[str] = None
    roll_count: int = 0
    template_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateSummaryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    slot_count: int = 0
    composition_strategy: str = "sequential"
    package_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_public: bool = True
    roll_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== CRUD Endpoints =====

@router.post("", response_model=TemplateResponse)
async def create_template(
    request: CreateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new block template."""
    service = BlockTemplateService(db)

    existing = await service.get_template_by_slug(request.slug)
    if existing:
        raise HTTPException(400, f"Template with slug '{request.slug}' already exists")

    data = request.model_dump()
    # Convert slot models to dicts
    data["slots"] = [s.model_dump() for s in request.slots]

    template = await service.create_template(
        data=data,
        created_by=current_user.username if current_user else None,
    )
    return template


@router.get("", response_model=List[TemplateSummaryResponse])
async def list_templates(
    package_name: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List/search block templates."""
    service = BlockTemplateService(db)
    templates = await service.search_templates(
        package_name=package_name,
        is_public=is_public,
        tag=tag,
        limit=limit,
        offset=offset,
    )
    return [
        TemplateSummaryResponse(
            id=t.id,
            name=t.name,
            slug=t.slug,
            description=t.description,
            slot_count=len(t.slots) if t.slots else 0,
            composition_strategy=t.composition_strategy,
            package_name=t.package_name,
            tags=t.tags or [],
            is_public=t.is_public,
            roll_count=t.roll_count,
            created_at=t.created_at,
        )
        for t in templates
    ]


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get template by ID."""
    service = BlockTemplateService(db)
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.get("/by-slug/{slug}", response_model=TemplateResponse)
async def get_template_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get template by slug."""
    service = BlockTemplateService(db)
    template = await service.get_template_by_slug(slug)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    request: UpdateTemplateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a template."""
    service = BlockTemplateService(db)

    updates = {}
    for key, value in request.model_dump(exclude_unset=True).items():
        if value is not None:
            if key == "slots":
                updates[key] = [s.model_dump() if hasattr(s, "model_dump") else s for s in value]
            else:
                updates[key] = value

    template = await service.update_template(template_id, updates)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a template."""
    service = BlockTemplateService(db)
    success = await service.delete_template(template_id)
    if not success:
        raise HTTPException(404, "Template not found")
    return {"success": True, "message": "Template deleted"}


# ===== Roll & Preview Endpoints =====

@router.post("/{template_id}/roll", response_model=Dict[str, Any])
async def roll_template(
    template_id: UUID,
    request: RollTemplateRequest = RollTemplateRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Roll a template: randomly select blocks per slot and compose a prompt."""
    service = BlockTemplateService(db)
    result = await service.roll_template(
        template_id,
        seed=request.seed,
        exclude_block_ids=request.exclude_block_ids,
    )
    if not result.get("success"):
        raise HTTPException(404, result.get("error", "Roll failed"))
    return result


@router.post("/preview-slot", response_model=Dict[str, Any])
async def preview_slot(
    request: PreviewSlotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Preview matching block count and samples for a slot definition."""
    service = BlockTemplateService(db)
    return await service.preview_slot_matches(
        slot=request.slot.model_dump(),
        limit=request.limit,
    )


@router.get("/meta/packages", response_model=List[str])
async def list_block_packages(
    db: AsyncSession = Depends(get_db),
):
    """List distinct package names from prompt blocks."""
    service = BlockTemplateService(db)
    return await service.list_package_names()
