"""Character domain models

Persistent character registry for reusable characters across prompts and game integration.
Characters are first-class entities that can be referenced in prompts and action blocks.
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Column, JSON, Text, Relationship
from sqlalchemy.dialects.postgresql import JSONB

from pixsim7.backend.main.shared.datetime_utils import utcnow


class Character(SQLModel, table=True):
    """Character registry - reusable character definitions

    Characters can be referenced in prompts/blocks using {{character:character_id}}
    and can sync with game NPCs for consistency.
    """
    __tablename__ = "characters"

    # Identity
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    character_id: str = Field(unique=True, index=True, max_length=200)  # "gorilla_01", "sarah_dancer"
    name: Optional[str] = Field(None, max_length=200)  # "Koba", "Sarah"
    display_name: Optional[str] = Field(None, max_length=200)  # "Koba the Gorilla"

    # Classification
    category: str = Field(index=True, max_length=50)  # "creature", "human", "hybrid", "fantasy"
    species: Optional[str] = Field(None, max_length=100)  # "gorilla", "human", "werewolf"
    archetype: Optional[str] = Field(None, max_length=100)  # "warrior", "dancer", "trickster"

    # Visual definition - JSONB for flexibility
    visual_traits: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "build": "muscular, towering",
    #   "height": "8 feet",
    #   "skin_fur": "dark grey fur",
    #   "distinguishing_marks": ["scar across left palm", "tribal tattoo on chest"],
    #   "eyes": "amber",
    #   "clothing": "tribal loincloth",
    #   "accessories": ["bone necklace"]
    # }

    # Personality and behavior
    personality_traits: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # {
    #   "demeanor": "cautious, primal",
    #   "intelligence": "cunning",
    #   "temperament": "volatile",
    #   "motivations": ["survival", "dominance"]
    # }

    behavioral_patterns: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # {
    #   "movement_style": "deliberate, powerful",
    #   "social_behavior": "territorial",
    #   "combat_style": "aggressive grappler",
    #   "quirks": ["glances side to side when nervous"]
    # }

    # Voice/sound profile
    voice_profile: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # {
    #   "voice_type": "deep, guttural",
    #   "speech_pattern": "minimal grunts",
    #   "breathing": "heavy, panting",
    #   "signature_sounds": ["intimidating growl"]
    # }

    # Rendering instructions
    render_style: Optional[str] = Field(None, max_length=100)  # "realistic", "stylized", "anime"
    render_instructions: Optional[str] = Field(None, sa_column=Column(Text))
    # "Realistic fur rendering. Maintain consistent lighting. Pay attention to muscle definition."

    reference_images: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )  # URLs or file paths

    # Game integration
    game_npc_id: Optional[UUID] = Field(None, foreign_key="npcs.id", index=True)
    sync_with_game: bool = Field(default=False)  # Auto-sync changes with game NPC
    game_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )

    # Version control - character evolution over time
    version: int = Field(default=1)
    previous_version_id: Optional[UUID] = Field(None, foreign_key="characters.id")
    version_notes: Optional[str] = Field(None, sa_column=Column(Text))
    # "Added scar after battle scene in prompt_v3"

    # Usage tracking
    usage_count: int = Field(default=0)  # How many prompts/blocks use this character
    last_used_at: Optional[datetime] = None

    # Metadata
    tags: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))
    character_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    created_by: Optional[str] = Field(None, max_length=200)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    # Soft delete
    is_active: bool = Field(default=True, index=True)
    deleted_at: Optional[datetime] = None


class CharacterRelationship(SQLModel, table=True):
    """Relationships between characters

    Track how characters relate to each other (allies, rivals, strangers, etc.)
    This can influence prompt generation and game interactions.
    """
    __tablename__ = "character_relationships"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Relationship is directional: A feels X toward B
    character_a_id: UUID = Field(foreign_key="characters.id", index=True)
    character_b_id: UUID = Field(foreign_key="characters.id", index=True)

    # Relationship type
    relationship_type: str = Field(max_length=50)  # "allies", "rivals", "strangers", "lovers", "enemies"
    relationship_strength: float = Field(default=0.5)  # 0.0 (weak) to 1.0 (strong)

    # Relationship history/notes
    history: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )
    # [
    #   {"event": "first_meeting", "prompt_version_id": "...", "timestamp": "..."},
    #   {"event": "alliance_formed", "prompt_version_id": "...", "timestamp": "..."}
    # ]

    notes: Optional[str] = Field(None, sa_column=Column(Text))

    # Metadata
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class CharacterUsage(SQLModel, table=True):
    """Track where characters are used

    Links characters to prompts and action blocks for tracking and updates.
    """
    __tablename__ = "character_usage"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    character_id: UUID = Field(foreign_key="characters.id", index=True)

    # What uses this character
    usage_type: str = Field(max_length=50)  # "prompt", "action_block", "composition"
    prompt_version_id: Optional[UUID] = Field(None, foreign_key="prompt_versions.id", index=True)
    action_block_id: Optional[UUID] = Field(None, foreign_key="action_blocks.id", index=True)

    # Template reference that was expanded
    template_reference: Optional[str] = None  # "{{character:gorilla_01}}"

    # Metadata
    used_at: datetime = Field(default_factory=utcnow)
