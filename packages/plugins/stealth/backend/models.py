"""
Stealth Plugin - Pydantic Models

These models align with the TypeScript types in ../shared/types.ts
Keep them in sync when making changes.
"""

from typing import Optional
from pydantic import BaseModel, Field


# =============================================================================
# Request/Response Models
# =============================================================================


class PickpocketRequest(BaseModel):
    """Request to attempt pickpocketing an NPC."""

    npc_id: int = Field(..., description="Target NPC ID")
    slot_id: str = Field(..., description="Slot ID where the NPC is assigned")
    base_success_chance: float = Field(
        ...,
        ge=0,
        le=1,
        description="Base probability of success (0-1)",
    )
    detection_chance: float = Field(
        ...,
        ge=0,
        le=1,
        description="Probability of being detected (0-1)",
    )
    world_id: Optional[int] = Field(None, description="World ID (optional)")
    session_id: int = Field(..., description="Session ID")


class PickpocketResponse(BaseModel):
    """Response from pickpocket attempt."""

    success: bool = Field(..., description="Whether the pickpocket attempt succeeded")
    detected: bool = Field(..., description="Whether the player was detected")
    updated_flags: dict = Field(
        default_factory=dict, description="Updated session flags"
    )
    message: str = Field(..., description="Human-readable result message")


# =============================================================================
# ECS Component Models
# =============================================================================


class PickpocketAttemptRecord(BaseModel):
    """Record of a pickpocket attempt stored in ECS component."""

    slot_id: str = Field(..., description="Slot ID where attempt was made")
    success: bool = Field(..., description="Whether the attempt succeeded")
    detected: bool = Field(..., description="Whether the player was detected")
    timestamp: int = Field(..., description="Timestamp of the attempt")


class StealthComponent(BaseModel):
    """
    Stealth ECS component stored in session flags.
    Path: GameSession.flags.npcs["npc:{id}"].components.stealth
    """

    suspicion: float = Field(
        default=0.0, ge=0, le=1, description="Suspicion level (0-1)"
    )
    lastCaughtAt: Optional[int] = Field(
        None, description="Timestamp when player was last caught"
    )
    pickpocketAttempts: list[PickpocketAttemptRecord] = Field(
        default_factory=list, description="History of pickpocket attempts"
    )
    detectionCount: int = Field(
        default=0, ge=0, description="Number of times player was detected"
    )
    successfulThefts: int = Field(
        default=0, ge=0, description="Number of successful thefts"
    )


# =============================================================================
# Frontend Manifest Models
# =============================================================================


class JsonSchemaProperty(BaseModel):
    """JSON Schema property definition."""

    type: str
    description: Optional[str] = None
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    default: Optional[object] = None
    enum: Optional[list] = None
    items: Optional["JsonSchemaProperty"] = None


class JsonSchema(BaseModel):
    """JSON Schema object for config validation."""

    type: str = "object"
    properties: dict[str, JsonSchemaProperty]
    required: Optional[list[str]] = None


class InteractionCapabilities(BaseModel):
    """Capabilities/effects for UI hints."""

    opensDialogue: bool = False
    modifiesInventory: bool = False
    affectsRelationship: bool = False
    triggersEvents: bool = False
    hasRisk: bool = False
    requiresItems: bool = False
    consumesItems: bool = False
    canBeDetected: bool = False


class FrontendInteractionManifest(BaseModel):
    """Frontend interaction manifest for dynamic registration."""

    id: str
    name: str
    description: str
    icon: str
    category: str
    version: str
    tags: list[str] = Field(default_factory=list)
    apiEndpoint: str
    configSchema: JsonSchema
    defaultConfig: dict
    uiMode: str = "notification"
    capabilities: Optional[InteractionCapabilities] = None


class FrontendPluginManifest(BaseModel):
    """Frontend plugin manifest describing all interactions."""

    pluginId: str
    pluginName: str
    version: str
    interactions: list[FrontendInteractionManifest]
