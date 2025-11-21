"""
NPC Memory and Emotional State Models

Tracks conversation history and emotional states for NPCs to enable:
- Short-term memory (current session)
- Long-term memory (across sessions)
- Emotional states that affect dialogue
- Topic tracking and recall
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from sqlalchemy import Index


class MemoryType(str, Enum):
    """Type of memory"""
    SHORT_TERM = "short_term"  # Current session, decays quickly
    LONG_TERM = "long_term"    # Persistent across sessions
    WORKING = "working"         # Temporary, used for current conversation


class MemoryImportance(str, Enum):
    """Importance level of a memory"""
    TRIVIAL = "trivial"        # Forget quickly (weather, greetings)
    NORMAL = "normal"          # Standard conversation topics
    IMPORTANT = "important"    # Significant events, player choices
    CRITICAL = "critical"      # Major milestones, relationship changes


class EmotionType(str, Enum):
    """Types of emotions"""
    # Positive
    HAPPY = "happy"
    EXCITED = "excited"
    CONTENT = "content"
    PLAYFUL = "playful"
    AFFECTIONATE = "affectionate"
    GRATEFUL = "grateful"

    # Negative
    SAD = "sad"
    ANGRY = "angry"
    FRUSTRATED = "frustrated"
    ANXIOUS = "anxious"
    HURT = "hurt"
    JEALOUS = "jealous"

    # Neutral/Complex
    CURIOUS = "curious"
    THOUGHTFUL = "thoughtful"
    SURPRISED = "surprised"
    CONFUSED = "confused"
    NERVOUS = "nervous"
    BORED = "bored"
    TIRED = "tired"


class ConversationMemory(SQLModel, table=True):
    """
    Individual memory of a conversation exchange

    Stores what was discussed, when, and how important it is.
    Memories decay over time and can be recalled in future conversations.
    """
    __tablename__ = "npc_conversation_memories"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)  # Player who had this conversation

    # Memory metadata
    memory_type: MemoryType = Field(default=MemoryType.SHORT_TERM)
    importance: MemoryImportance = Field(default=MemoryImportance.NORMAL)

    # Memory content
    topic: str = Field(..., description="Main topic of the memory (e.g., 'player_asked_about_family')")
    summary: str = Field(..., description="Brief summary of what was discussed")
    player_said: Optional[str] = Field(None, description="What the player said")
    npc_said: Optional[str] = Field(None, description="What the NPC responded")

    # Context
    location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")
    world_time: Optional[float] = Field(default=None, description="In-game time when this occurred")

    # Emotional context
    npc_emotion_at_time: Optional[EmotionType] = Field(None, description="NPC's emotion during this exchange")
    relationship_tier_at_time: Optional[str] = Field(None, description="Relationship tier at the time")

    # Memory strength and decay
    strength: float = Field(default=1.0, ge=0.0, le=1.0, description="How strong/vivid the memory is")
    access_count: int = Field(default=0, description="How many times this memory has been recalled")
    last_accessed_at: Optional[datetime] = Field(default=None, description="When this memory was last recalled")

    # Tags for easy retrieval
    tags: List[str] = Field(default_factory=list, sa_column=Column(JSON))

    # Additional metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(None, description="When this memory should be forgotten")

    # Indexes for efficient queries
    __table_args__ = (
        Index("idx_npc_user_memories", "npc_id", "user_id"),
        Index("idx_session_memories", "session_id"),
        Index("idx_memory_type_importance", "memory_type", "importance"),
        Index("idx_topic", "topic"),
    )


class NPCEmotionalState(SQLModel, table=True):
    """
    Current emotional state of an NPC

    Tracks temporary moods and emotions that affect dialogue tone.
    States have intensity and duration, and can be triggered by events.
    """
    __tablename__ = "npc_emotional_states"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id", index=True)

    # Emotional state
    emotion: EmotionType = Field(..., description="Current primary emotion")
    intensity: float = Field(default=0.5, ge=0.0, le=1.0, description="How intense the emotion is")

    # Duration and decay
    duration_seconds: Optional[float] = Field(None, description="How long this emotion lasts (None = indefinite)")
    decay_rate: float = Field(default=0.1, description="How quickly intensity decreases per minute")

    # Trigger
    triggered_by: Optional[str] = Field(None, description="What caused this emotion (event, dialogue, action)")
    trigger_memory_id: Optional[int] = Field(None, foreign_key="npc_conversation_memories.id")

    # Context
    context: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON), description="Additional context about why this emotion exists")

    # State tracking
    is_active: bool = Field(default=True, description="Whether this emotion is currently affecting the NPC")

    # Timestamps
    started_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = Field(None, description="When this emotion expires")
    ended_at: Optional[datetime] = Field(None, description="When this emotion actually ended")

    # Indexes
    __table_args__ = (
        Index("idx_npc_active_emotions", "npc_id", "is_active"),
        Index("idx_session_emotions", "session_id", "is_active"),
    )


class ConversationTopic(SQLModel, table=True):
    """
    Topics that have been discussed with an NPC

    Tracks what topics the player has explored with each NPC,
    enabling the NPC to avoid repeating information or build on previous discussions.
    """
    __tablename__ = "npc_conversation_topics"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    # Topic info
    topic_id: str = Field(..., description="Unique identifier for the topic (e.g., 'backstory', 'family', 'fears')")
    topic_name: str = Field(..., description="Human-readable topic name")

    # Discussion tracking
    times_discussed: int = Field(default=1, description="How many times this topic has come up")
    first_discussed_at: datetime = Field(default_factory=datetime.utcnow)
    last_discussed_at: datetime = Field(default_factory=datetime.utcnow)

    # Depth of knowledge
    depth_level: int = Field(default=1, description="How deeply this topic has been explored (1=surface, 5=very deep)")

    # Unlocks
    unlocked_sub_topics: List[str] = Field(default_factory=list, sa_column=Column(JSON), description="Sub-topics unlocked by discussing this")

    # Context
    relationship_tier_when_first_discussed: Optional[str] = Field(None)

    # Metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Indexes
    __table_args__ = (
        Index("idx_npc_user_topics", "npc_id", "user_id"),
        Index("idx_topic_id", "topic_id"),
    )


class MilestoneType(str, Enum):
    """Types of relationship milestones"""
    FIRST_MEETING = "first_meeting"
    FIRST_CONVERSATION = "first_conversation"
    BECAME_ACQUAINTANCE = "became_acquaintance"
    BECAME_FRIEND = "became_friend"
    BECAME_CLOSE_FRIEND = "became_close_friend"
    FIRST_FLIRT = "first_flirt"
    FIRST_KISS = "first_kiss"
    BECAME_LOVER = "became_lover"
    FIRST_ARGUMENT = "first_argument"
    RECONCILIATION = "reconciliation"
    BETRAYAL = "betrayal"
    FORGIVENESS = "forgiveness"
    TRUST_MILESTONE = "trust_milestone"
    CHEMISTRY_MILESTONE = "chemistry_milestone"
    CUSTOM = "custom"


class RelationshipMilestone(SQLModel, table=True):
    """
    Relationship milestones between player and NPC

    Tracks major events and transitions in the relationship.
    These can trigger special dialogue, emotional responses, or unlock content.
    """
    __tablename__ = "npc_relationship_milestones"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id")

    # Milestone info
    milestone_type: MilestoneType = Field(..., description="Type of milestone")
    milestone_name: str = Field(..., description="Human-readable name")

    # Context at the time
    relationship_values: Dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON), description="Affinity, trust, chemistry, tension at time of milestone")
    relationship_tier: str = Field(..., description="Relationship tier when milestone occurred")

    # Triggers
    triggered_by: Optional[str] = Field(None, description="What caused this milestone")
    trigger_memory_id: Optional[int] = Field(None, foreign_key="npc_conversation_memories.id")

    # Effects
    unlocked_content: List[str] = Field(default_factory=list, sa_column=Column(JSON), description="Content unlocked by this milestone")
    emotional_impact: Optional[EmotionType] = Field(None, description="Emotion triggered by milestone")

    # Metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamp
    achieved_at: datetime = Field(default_factory=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index("idx_npc_user_milestones", "npc_id", "user_id"),
        Index("idx_milestone_type", "milestone_type"),
    )


class WorldEventType(str, Enum):
    """Types of world events"""
    TIME_OF_DAY = "time_of_day"
    WEATHER = "weather"
    LOCATION_CHANGE = "location_change"
    NPC_ACTION = "npc_action"
    STORY_EVENT = "story_event"
    PLAYER_ACTION = "player_action"
    WORLD_STATE_CHANGE = "world_state_change"
    CUSTOM = "custom"


class NPCWorldContext(SQLModel, table=True):
    """
    NPC awareness of world events and context

    Tracks what NPCs know about the world state,
    allowing them to reference recent events in dialogue.
    """
    __tablename__ = "npc_world_context"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    world_id: Optional[int] = Field(default=None, foreign_key="game_worlds.id")
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id")

    # Event info
    event_type: WorldEventType = Field(..., description="Type of event")
    event_name: str = Field(..., description="Event identifier")
    event_description: str = Field(..., description="What happened")

    # NPC awareness
    is_aware: bool = Field(default=True, description="Whether NPC knows about this event")
    awareness_source: Optional[str] = Field(None, description="How NPC learned about it")

    # NPC reaction
    emotional_response: Optional[EmotionType] = Field(None, description="How NPC feels about this")
    opinion: Optional[str] = Field(None, description="NPC's opinion on the event")

    # Relevance
    relevance_score: float = Field(default=0.5, ge=0.0, le=1.0, description="How relevant this is to NPC")
    expires_at: Optional[datetime] = Field(None, description="When this context becomes irrelevant")

    # Metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamps
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    npc_learned_at: datetime = Field(default_factory=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index("idx_npc_world_events", "npc_id", "is_aware"),
        Index("idx_event_type", "event_type"),
    )


class PersonalityTrait(str, Enum):
    """Big Five personality traits"""
    OPENNESS = "openness"
    CONSCIENTIOUSNESS = "conscientiousness"
    EXTRAVERSION = "extraversion"
    AGREEABLENESS = "agreeableness"
    NEUROTICISM = "neuroticism"


class PersonalityEvolutionEvent(SQLModel, table=True):
    """
    Tracks changes to NPC personality over time

    Personalities evolve based on experiences, relationship developments,
    and significant events.
    """
    __tablename__ = "npc_personality_evolution"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id")

    # Personality change
    trait_changed: PersonalityTrait = Field(..., description="Which trait changed")
    old_value: float = Field(..., description="Previous value (0-100)")
    new_value: float = Field(..., description="New value (0-100)")
    change_amount: float = Field(..., description="Amount of change (+/-)")

    # Cause
    triggered_by: str = Field(..., description="What caused this change")
    trigger_event_id: Optional[int] = Field(None, description="ID of related event/memory/milestone")

    # Context
    relationship_tier_at_time: Optional[str] = Field(None)
    world_time: Optional[float] = Field(None)

    # Metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamp
    changed_at: datetime = Field(default_factory=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index("idx_npc_evolution", "npc_id"),
        Index("idx_trait_changed", "trait_changed"),
    )


class DialogueAnalytics(SQLModel, table=True):
    """
    Analytics for dialogue generation

    Tracks what prompts work well, player engagement,
    and helps optimize future dialogue.
    """
    __tablename__ = "npc_dialogue_analytics"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Foreign keys
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    session_id: Optional[int] = Field(default=None, foreign_key="game_sessions.id")
    memory_id: Optional[int] = Field(default=None, foreign_key="npc_conversation_memories.id")

    # Dialogue info
    program_id: str = Field(..., description="Prompt program used")
    prompt_hash: str = Field(..., description="Hash of the prompt for deduplication")

    # Context at generation
    relationship_tier: str = Field(..., description="Relationship tier")
    intimacy_level: Optional[str] = Field(None, description="Intimacy level")
    npc_emotion: Optional[str] = Field(None, description="NPC's emotion at time")

    # LLM info
    model_used: str = Field(..., description="LLM model")
    was_cached: bool = Field(default=False, description="Whether response was cached")
    tokens_used: Optional[int] = Field(None, description="Total tokens")
    generation_time_ms: float = Field(..., description="Generation time")
    estimated_cost: Optional[float] = Field(None, description="Cost in USD")

    # Player engagement metrics
    player_responded: bool = Field(default=False, description="Did player continue conversation")
    response_time_seconds: Optional[float] = Field(None, description="How long until player responded")
    conversation_continued: bool = Field(default=False, description="Did conversation continue beyond this exchange")
    player_sentiment: Optional[str] = Field(None, description="Positive, negative, neutral (if detected)")

    # Quality metrics
    dialogue_length: int = Field(..., description="Character count of NPC response")
    contains_memory_reference: bool = Field(default=False, description="Did dialogue reference past conversations")
    emotional_consistency: bool = Field(default=True, description="Was emotion consistent with state")

    # A/B testing
    variant_id: Optional[str] = Field(None, description="For A/B testing different approaches")

    # Metadata
    model_metadata: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    # Timestamp
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index("idx_npc_user_analytics", "npc_id", "user_id"),
        Index("idx_program_id", "program_id"),
        Index("idx_was_cached", "was_cached"),
        Index("idx_generated_at", "generated_at"),
    )
