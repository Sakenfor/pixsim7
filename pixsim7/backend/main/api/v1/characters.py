"""Characters API endpoints

REST API for managing the character registry including:
- CRUD operations
- Character versioning
- Template expansion
- Usage tracking
- Game integration
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.services.characters import (
    CharacterService,
    CharacterTemplateEngine
)
from pixsim7.backend.main.domain.game.entities import Character
from pixsim7.backend.main.domain.user import User

router = APIRouter(tags=["characters"])


# ===== Request/Response Models =====

class CreateCharacterRequest(BaseModel):
    character_id: str = Field(..., description="Unique identifier (e.g., 'gorilla_01')")
    name: Optional[str] = Field(None, description="Character name (e.g., 'Koba')")
    display_name: Optional[str] = Field(None, description="Display name (auto-generated if not provided)")
    category: str = Field(default="creature", description="Category: creature, human, hybrid, fantasy")
    species: Optional[str] = Field(None, description="Species/race (e.g., 'gorilla', 'human')")
    archetype: Optional[str] = Field(None, description="Archetype (e.g., 'warrior', 'dancer')")

    visual_traits: Dict[str, Any] = Field(
        default_factory=dict,
        description="Visual appearance (build, height, skin_fur, eyes, etc.)"
    )
    personality_traits: Dict[str, Any] = Field(
        default_factory=dict,
        description="Personality (demeanor, intelligence, temperament)"
    )
    behavioral_patterns: Dict[str, Any] = Field(
        default_factory=dict,
        description="Behavior patterns (movement_style, social_behavior, quirks)"
    )
    voice_profile: Dict[str, Any] = Field(
        default_factory=dict,
        description="Voice/sound profile"
    )

    render_style: str = Field(default="realistic", description="Rendering style")
    render_instructions: Optional[str] = Field(None, description="Rendering instructions")
    reference_images: List[str] = Field(default_factory=list, description="Reference image URLs")

    game_npc_id: Optional[UUID] = Field(None, description="Link to game NPC")
    sync_with_game: bool = Field(default=False, description="Auto-sync with game")

    tags: Dict[str, Any] = Field(default_factory=dict, description="Custom tags")


class UpdateCharacterRequest(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    visual_traits: Optional[Dict[str, Any]] = None
    personality_traits: Optional[Dict[str, Any]] = None
    behavioral_patterns: Optional[Dict[str, Any]] = None
    voice_profile: Optional[Dict[str, Any]] = None
    render_instructions: Optional[str] = None
    create_version: bool = Field(default=False, description="Create new version instead of updating")
    version_notes: Optional[str] = Field(None, description="Notes about this version")


class ExpandTemplateRequest(BaseModel):
    prompt_text: str = Field(..., description="Prompt with {{character:id}} references")
    track_usage: bool = Field(default=True, description="Track character usage")
    prompt_version_id: Optional[UUID] = None


class CharacterResponse(BaseModel):
    id: UUID
    character_id: str
    name: Optional[str]
    display_name: Optional[str]
    category: str
    species: Optional[str]
    archetype: Optional[str]
    visual_traits: Dict[str, Any]
    personality_traits: Dict[str, Any]
    behavioral_patterns: Dict[str, Any]
    render_style: Optional[str]
    version: int
    usage_count: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class CharacterDetailResponse(CharacterResponse):
    voice_profile: Dict[str, Any]
    render_instructions: Optional[str]
    reference_images: List[str]
    game_npc_id: Optional[UUID]
    sync_with_game: bool
    game_metadata: Dict[str, Any]
    previous_version_id: Optional[UUID]
    version_notes: Optional[str]
    last_used_at: Optional[str]
    tags: Dict[str, Any]
    character_metadata: Dict[str, Any]
    created_by: Optional[str]


# ===== Character CRUD Endpoints =====

@router.post("", response_model=CharacterDetailResponse, status_code=201)
async def create_character(
    request: CreateCharacterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new character in the registry

    Example:
        ```json
        {
            "character_id": "gorilla_01",
            "name": "Koba",
            "category": "creature",
            "species": "gorilla",
            "visual_traits": {
                "build": "tribal, muscular, towering",
                "scars": ["thick scar across left palm"],
                "posture": "wary, deliberate"
            },
            "personality_traits": {
                "demeanor": "cautious",
                "behavior": "primal, instinctual"
            }
        }
        ```
    """
    service = CharacterService(db)

    try:
        character = await service.create_character(
            character_id=request.character_id,
            name=request.name,
            category=request.category,
            species=request.species,
            visual_traits=request.visual_traits,
            personality_traits=request.personality_traits,
            behavioral_patterns=request.behavioral_patterns,
            render_style=request.render_style,
            created_by=current_user.username if current_user else None,
            display_name=request.display_name,
            archetype=request.archetype,
            voice_profile=request.voice_profile,
            render_instructions=request.render_instructions,
            reference_images=request.reference_images,
            game_npc_id=request.game_npc_id,
            sync_with_game=request.sync_with_game,
            tags=request.tags
        )
        return character
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("", response_model=List[CharacterResponse])
async def list_characters(
    category: Optional[str] = Query(None, description="Filter by category"),
    species: Optional[str] = Query(None, description="Filter by species"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """List all characters with optional filters"""
    service = CharacterService(db)
    characters = await service.list_characters(
        category=category,
        species=species,
        limit=limit,
        offset=offset
    )
    return characters


@router.get("/search", response_model=List[CharacterResponse])
async def search_characters(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Search characters by name, species, or traits"""
    service = CharacterService(db)
    characters = await service.search_characters(q, limit)
    return characters


@router.get("/stats", response_model=Dict[str, Any])
async def get_character_stats(
    db: AsyncSession = Depends(get_db)
):
    """Get character registry statistics"""
    service = CharacterService(db)
    stats = await service.get_statistics()
    return stats


@router.get("/{character_id}", response_model=CharacterDetailResponse)
async def get_character(
    character_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get character details by character_id"""
    service = CharacterService(db)
    character = await service.get_character_by_id(character_id)

    if not character:
        raise HTTPException(404, f"Character '{character_id}' not found")

    return character


@router.put("/{character_id}", response_model=CharacterDetailResponse)
async def update_character(
    character_id: str,
    request: UpdateCharacterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a character

    If create_version=True, creates new version instead of updating in place.
    This is useful for tracking character evolution (e.g., after battle scenes).
    """
    service = CharacterService(db)

    try:
        updates = {k: v for k, v in request.model_dump().items() if v is not None and k not in ['create_version', 'version_notes']}
        if request.version_notes:
            updates['version_notes'] = request.version_notes

        character = await service.update_character(
            character_id=character_id,
            updates=updates,
            create_version=request.create_version
        )
        return character
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/{character_id}", status_code=204)
async def delete_character(
    character_id: str,
    soft: bool = Query(True, description="Soft delete (default) or hard delete"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a character"""
    service = CharacterService(db)

    success = await service.delete_character(character_id, soft=soft)
    if not success:
        raise HTTPException(404, f"Character '{character_id}' not found")

    return None


# ===== Character Versioning =====

@router.get("/{character_id}/history", response_model=List[CharacterResponse])
async def get_character_history(
    character_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all versions of a character (evolution history)"""
    service = CharacterService(db)
    history = await service.get_character_history(character_id)

    if not history:
        raise HTTPException(404, f"Character '{character_id}' not found")

    return history


@router.post("/{character_id}/evolve", response_model=CharacterDetailResponse)
async def evolve_character(
    character_id: str,
    request: UpdateCharacterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create new version of character (evolution)

    Example use case: Character gets scars after battle, or changes appearance over time.
    """
    # Force create_version to True
    request.create_version = True

    service = CharacterService(db)

    try:
        updates = {k: v for k, v in request.model_dump().items() if v is not None and k != 'create_version'}
        character = await service.update_character(
            character_id=character_id,
            updates=updates,
            create_version=True
        )
        return character
    except ValueError as e:
        raise HTTPException(404, str(e))


# ===== Template Expansion =====

@router.post("/expand-template", response_model=Dict[str, Any])
async def expand_template(
    request: ExpandTemplateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Expand {{character:id}} references in a prompt

    Example:
        Input:  "{{character:gorilla_01}} approaches {{character:sarah}}"
        Output: "Koba the gorilla—tribal, muscular, towering—approaches Sarah the dancer..."

    Supports detail specifiers:
        - {{character:gorilla_01}} - Full description
        - {{character:gorilla_01:name}} - Just name
        - {{character:gorilla_01:visual}} - Just visual traits
    """
    engine = CharacterTemplateEngine(db)

    result = await engine.expand_prompt(
        prompt_text=request.prompt_text,
        track_usage=request.track_usage,
        prompt_version_id=request.prompt_version_id
    )

    return result


@router.post("/validate-template", response_model=Dict[str, Any])
async def validate_template(
    prompt_text: str = Query(..., description="Prompt to validate"),
    db: AsyncSession = Depends(get_db)
):
    """Validate that all {{character:id}} references exist

    Returns which character references are valid/invalid.
    """
    engine = CharacterTemplateEngine(db)

    result = await engine.validate_character_references(prompt_text)

    return result


@router.get("/{character_id}/template", response_model=Dict[str, Any])
async def get_character_template(
    character_id: str,
    detail_level: str = Query("full", description="full, name, or visual"),
    db: AsyncSession = Depends(get_db)
):
    """Get template reference for a character

    Returns the template string to use in prompts.
    """
    service = CharacterService(db)
    engine = CharacterTemplateEngine(db)

    character = await service.get_character_by_id(character_id)
    if not character:
        raise HTTPException(404, f"Character '{character_id}' not found")

    template = engine.create_character_template(character, detail_level)

    # Also show what it would expand to
    expanded = engine._expand_character(character, detail_level if detail_level != "full" else None)

    return {
        "template": template,
        "preview": expanded,
        "character_id": character_id,
        "detail_level": detail_level
    }


# ===== Usage Tracking =====

@router.get("/{character_id}/usage", response_model=List[Dict[str, Any]])
async def get_character_usage(
    character_id: str,
    usage_type: Optional[str] = Query(None, description="Filter by usage type: prompt, action_block"),
    db: AsyncSession = Depends(get_db)
):
    """Get all usage records for a character

    Shows where this character has been used (prompts, action blocks, etc.)
    """
    service = CharacterService(db)
    usage_records = await service.get_character_usage(
        character_id=character_id,
        usage_type=usage_type
    )

    return [
        {
            "id": str(u.id),
            "usage_type": u.usage_type,
            "prompt_version_id": str(u.prompt_version_id) if u.prompt_version_id else None,
            "action_block_id": str(u.action_block_id) if u.action_block_id else None,
            "template_reference": u.template_reference,
            "used_at": u.used_at.isoformat()
        }
        for u in usage_records
    ]


# ===== Game Integration (Future) =====

@router.post("/{character_id}/sync-from-game", response_model=Dict[str, Any])
async def sync_from_game(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sync character state from game NPC

    TODO: Implement game NPC sync
    """
    # Placeholder for future game integration
    raise HTTPException(501, "Game sync not yet implemented")


@router.post("/{character_id}/sync-to-game", response_model=Dict[str, Any])
async def sync_to_game(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sync character to game NPC

    TODO: Implement game NPC sync
    """
    # Placeholder for future game integration
    raise HTTPException(501, "Game sync not yet implemented")
