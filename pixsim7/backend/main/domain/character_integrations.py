"""Character World Instances and NPC Sync

This module handles the complex many-to-many relationship between:
- Characters (templates/archetypes)
- Character Instances (world-specific versions)
- Game NPCs (game entities)

Architecture:
    Character (template)
      ├─ CharacterInstance (world_1, version=evolved)
      │    └─ GameNPC (npc_koba_jungle)
      ├─ CharacterInstance (world_2, version=original)
      │    └─ GameNPC (npc_koba_city)
      └─ CharacterInstance (world_3, version=wounded)
           └─ GameNPC (npc_koba_wasteland)

This allows:
- Same character template in multiple worlds (gorilla_01 appears in 3 worlds)
- Each world can have different character version (evolved/original/wounded)
- Each instance can sync with different NPCs
- Character evolves independently per world
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Column, Relationship
from sqlalchemy.dialects.postgresql import JSONB, JSON


class CharacterInstance(SQLModel, table=True):
    """Character instantiation in a specific world

    Represents a specific version of a character template in a particular world.
    Multiple instances can reference the same character template with different states.

    Example:
        gorilla_01 (Character template)
        ├─ instance_1 (world_1, evolved, has_scars=true)
        ├─ instance_2 (world_2, original, has_scars=false)
        └─ instance_3 (world_3, wounded, status=injured)
    """
    __tablename__ = "character_instances"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Link to character template
    character_id: UUID = Field(foreign_key="characters.id", index=True)

    # World-specific
    world_id: Optional[int] = Field(None, foreign_key="game_worlds.id", index=True)

    # Which version of the character template (from character version history)
    character_version: int = Field(default=1)

    # Instance-specific overrides (override character template values)
    visual_overrides: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example: {"scars": ["battle wound on shoulder"], "clothing": "modern jacket"}

    personality_overrides: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )

    behavioral_overrides: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )

    # Instance-specific state (changes during gameplay)
    current_state: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example: {"health": 75, "mood": "angry", "last_seen": "jungle_temple"}

    # Instance name (can differ from character template)
    instance_name: Optional[str] = Field(None, max_length=200)
    # Example: "Koba the Wounded" vs template name "Koba"

    # Metadata
    instance_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CharacterNPCLink(SQLModel, table=True):
    """Many-to-many link between character instances and NPCs

    Allows:
    - One character instance → multiple NPCs (e.g., Koba controls 2 NPCs in same world)
    - One NPC → multiple character instances (NPC switches appearance based on context)
    - Bidirectional sync configuration per link
    """
    __tablename__ = "character_npc_links"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Links
    character_instance_id: UUID = Field(foreign_key="character_instances.id", index=True)
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)

    # Sync configuration
    sync_enabled: bool = Field(default=True)
    sync_direction: str = Field(default="bidirectional")  # "bidirectional", "character_to_npc", "npc_to_character"

    # Field mapping (which character fields sync to which NPC fields)
    field_mappings: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "visual_traits.scars": "personality.appearance.scars",
    #   "current_state.health": "state.health",
    #   "current_state.location": "current_location_id"
    # }

    # Link priority (if NPC has multiple character links, highest priority wins)
    priority: int = Field(default=0)

    # Context-based activation (when this link is active)
    activation_conditions: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example: {"location_id": 5, "time_of_day": "night"}
    # This link only active when NPC is at location 5 during night

    # Last sync metadata
    last_synced_at: Optional[datetime] = None
    last_sync_direction: Optional[str] = None  # "from_character", "from_npc"

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CharacterCapability(SQLModel, table=True):
    """Character capabilities/skills system

    Defines what a character can do, like a plugin system for characters.
    Links characters to action blocks they can perform.
    """
    __tablename__ = "character_capabilities"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Can be linked to template OR instance
    character_id: Optional[UUID] = Field(None, foreign_key="characters.id", index=True)
    character_instance_id: Optional[UUID] = Field(None, foreign_key="character_instances.id", index=True)

    # Capability definition
    capability_type: str = Field(max_length=100, index=True)
    # Examples: "combat", "seduction", "stealth", "tool_use", "intimidation", "persuasion"

    skill_level: int = Field(default=5)  # 1-10 scale

    # Action blocks this capability enables
    action_blocks: List[UUID] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )

    # Capability metadata
    conditions: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example: {"requires_weapon": true, "min_health": 30}

    effects: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example: {"intimidation_bonus": 2, "success_rate": 0.85}

    cooldown_seconds: Optional[int] = None

    # Metadata
    description: Optional[str] = None
    tags: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB))

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SceneCharacterManifest(SQLModel, table=True):
    """Character requirements and roles for a scene

    Defines which characters are needed for a scene and their roles.
    Validates scene can be generated before attempting.
    """
    __tablename__ = "scene_character_manifests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Link to scene
    scene_id: int = Field(foreign_key="game_scenes.id", index=True)

    # Character requirements
    required_characters: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )
    # List of character_ids that MUST be present: ["gorilla_01", "female_dancer_01"]

    optional_characters: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )
    # Characters that can be in scene but aren't required: ["gorilla_02"]

    # Character roles in this scene
    character_roles: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "gorilla_01": {
    #     "role": "antagonist",
    #     "importance": "primary",
    #     "required_capabilities": ["intimidation", "combat"]
    #   },
    #   "female_dancer_01": {
    #     "role": "protagonist",
    #     "importance": "primary",
    #     "required_capabilities": ["seduction"]
    #   }
    # }

    # Relationship requirements
    required_relationships: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "gorilla_01_x_female_dancer_01": {
    #     "type": "strangers",
    #     "min_strength": 0.0,
    #     "max_strength": 0.3
    #   }
    # }

    # World-specific instances (if scene requires specific world instances)
    instance_requirements: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "gorilla_01": {
    #     "world_id": 1,
    #     "min_version": 2,  # Requires evolved version
    #     "required_state": {"health": ">50"}
    #   }
    # }

    # Validation rules
    validation_rules: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )

    # Metadata
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CharacterDialogueProfile(SQLModel, table=True):
    """Links characters to dialogue trees with personality-driven modifications

    Integrates character system with game_dialogue plugin.
    """
    __tablename__ = "character_dialogue_profiles"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    # Link to character (template or instance)
    character_id: Optional[UUID] = Field(None, foreign_key="characters.id", index=True)
    character_instance_id: Optional[UUID] = Field(None, foreign_key="character_instances.id", index=True)

    # Dialogue configuration
    dialogue_tree_id: Optional[str] = Field(None, max_length=200)
    # Reference to dialogue tree system

    # Voice/speech style from character.voice_profile
    voice_style: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "pitch": "deep",
    #   "speed": "slow",
    #   "accent": "tribal",
    #   "vocabulary": "simple",
    #   "speech_patterns": ["grunts", "short_sentences"]
    # }

    # Personality modifiers affect dialogue choices
    personality_modifiers: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "aggression": 0.8,  # More likely to choose aggressive dialogue
    #   "politeness": 0.2,  # Less likely to choose polite options
    #   "humor": 0.1,       # Rarely uses humor
    #   "honesty": 0.6      # Moderately honest
    # }

    # Dialogue response templates
    response_templates: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "greeting": ["*growl*", "*nod*", "..."],
    #   "agreement": ["*grunt*", "Yes..."],
    #   "disagreement": ["*growl angrily*", "No!"]
    # }

    # Trigger conditions for dialogue
    dialogue_triggers: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB)
    )
    # Example:
    # {
    #   "on_approach": "dialogue_tree_intimidate",
    #   "on_gift_received": "dialogue_tree_grateful",
    #   "on_attacked": "dialogue_tree_combat"
    # }

    # Metadata
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
