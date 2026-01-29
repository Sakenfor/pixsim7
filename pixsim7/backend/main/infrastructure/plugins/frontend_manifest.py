"""
Frontend Plugin Manifest Schema

Canonical Pydantic models for frontend_manifest.
These models are used by OpenAPI codegen to generate TypeScript types.

Plugin families supported:
- interactions: NPC/target action plugins
- helpers: Session state mutation helpers
- tools: Interactive gizmo tools
- tool_packs: Grouped tool collections
- gating: Custom gating conditions
- scene_views: Scene rendering modes
- control_centers: Control center UI modes

Usage in plugin manifest.py:
    from pixsim7.backend.main.infrastructure.plugins.frontend_manifest import (
        FrontendPluginManifest,
        FrontendInteractionDef,
    )

    FRONTEND_MANIFEST = FrontendPluginManifest(
        plugin_id="game_stealth",
        plugin_name="Stealth System",
        version="1.0.0",
        interactions=[
            FrontendInteractionDef(
                id="pickpocket",
                name="Pickpocket",
                ...
            )
        ],
    )

    manifest = PluginManifest(
        id="game_stealth",
        frontend_manifest=FRONTEND_MANIFEST,
        ...
    )
"""

from typing import Optional, Any
from pydantic import BaseModel, Field


# =============================================================================
# Interaction Definitions
# =============================================================================


class InteractionCapabilities(BaseModel):
    """Capability hints for interaction plugins."""

    opens_dialogue: bool = Field(default=False, alias="opensDialogue")
    modifies_inventory: bool = Field(default=False, alias="modifiesInventory")
    affects_relationship: bool = Field(default=False, alias="affectsRelationship")
    triggers_events: bool = Field(default=False, alias="triggersEvents")
    has_risk: bool = Field(default=False, alias="hasRisk")
    requires_items: bool = Field(default=False, alias="requiresItems")
    consumes_items: bool = Field(default=False, alias="consumesItems")
    can_be_detected: bool = Field(default=False, alias="canBeDetected")

    model_config = {"populate_by_name": True}


class FrontendInteractionDef(BaseModel):
    """
    Interaction plugin definition for frontend registration.

    The frontend uses this to:
    1. Generate config forms from config_schema
    2. Call api_endpoint to execute
    3. Show capabilities in UI
    """

    id: str
    name: str
    description: str
    icon: str = "⚡"
    category: str = "general"
    version: str = "1.0.0"
    tags: list[str] = Field(default_factory=list)

    # API endpoint (relative to /api/v1)
    api_endpoint: str = Field(alias="apiEndpoint")

    # JSON Schema for config form generation
    config_schema: dict[str, Any] = Field(default_factory=dict, alias="configSchema")

    # Default config values
    default_config: dict[str, Any] = Field(default_factory=dict, alias="defaultConfig")

    # UI behavior
    ui_mode: str = Field(default="notification", alias="uiMode")

    # Capability hints
    capabilities: Optional[InteractionCapabilities] = None

    model_config = {"populate_by_name": True}


# =============================================================================
# Helper Definitions
# =============================================================================


class FrontendHelperDef(BaseModel):
    """
    Session helper definition for frontend registration.

    Helpers are lightweight state mutation functions that don't have
    complex config UIs - they just execute via API.
    """

    id: str
    name: str
    description: str = ""
    category: str = "custom"  # relationships, inventory, quests, arcs, events, custom
    tags: list[str] = Field(default_factory=list)

    # API endpoint (relative to /api/v1)
    api_endpoint: str = Field(alias="apiEndpoint")

    # Optional parameter schema (simpler than interactions)
    param_schema: Optional[dict[str, Any]] = Field(default=None, alias="paramSchema")

    model_config = {"populate_by_name": True}


# =============================================================================
# Gating Definitions
# =============================================================================


class FrontendGatingDef(BaseModel):
    """
    Custom gating condition definition.

    Gating conditions are evaluated by the backend to determine
    interaction availability. Frontend just needs metadata for display.
    """

    id: str
    name: str
    description: str = ""
    gating_type: str = Field(alias="gatingType")  # stat, time, flag, custom

    # Optional config schema for gating parameters
    config_schema: Optional[dict[str, Any]] = Field(default=None, alias="configSchema")

    model_config = {"populate_by_name": True}


# =============================================================================
# Tool Definitions (Gizmo Interactive Tools)
# =============================================================================


class ToolVisualConfig(BaseModel):
    """Visual configuration for interactive tools."""

    model: str  # hand, feather, ice, flame, silk, electric, water, banana, candle
    base_color: str = Field(alias="baseColor")
    active_color: str = Field(alias="activeColor")
    glow: bool = False
    trail: bool = False
    distortion: bool = False
    particles: Optional[dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class ToolPhysicsConfig(BaseModel):
    """Physics configuration for interactive tools."""

    pressure: float = 0.5
    speed: float = 0.5
    temperature: Optional[float] = None
    pattern: Optional[str] = None
    vibration: Optional[float] = None
    viscosity: Optional[float] = None
    elasticity: Optional[float] = None
    bend_factor: Optional[float] = Field(default=None, alias="bendFactor")
    heat: Optional[float] = None

    model_config = {"populate_by_name": True}


class ToolFeedbackConfig(BaseModel):
    """Feedback configuration for interactive tools."""

    haptic: Optional[dict[str, Any]] = None
    audio: Optional[dict[str, Any]] = None
    npc_reaction: Optional[dict[str, Any]] = Field(default=None, alias="npcReaction")
    trail: Optional[dict[str, Any]] = None
    impact: Optional[dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class ToolConstraints(BaseModel):
    """Constraints for interactive tools."""

    min_pressure: Optional[float] = Field(default=None, alias="minPressure")
    max_speed: Optional[float] = Field(default=None, alias="maxSpeed")
    allowed_zones: Optional[list[str]] = Field(default=None, alias="allowedZones")
    cooldown: Optional[float] = None

    model_config = {"populate_by_name": True}


class FrontendToolDef(BaseModel):
    """
    Interactive tool definition for gizmo system.

    Tools are visual/physics objects that can be used in scenes.
    """

    id: str
    type: str  # touch, caress, tease, pleasure, temperature, energy, liquid, object
    name: str = ""
    description: str = ""
    unlock_level: Optional[int] = Field(default=None, alias="unlockLevel")

    visual: ToolVisualConfig
    physics: ToolPhysicsConfig
    feedback: ToolFeedbackConfig
    constraints: Optional[ToolConstraints] = None

    model_config = {"populate_by_name": True}


class FrontendToolPack(BaseModel):
    """
    Grouped collection of tools.

    Tool packs allow plugins to provide themed tool sets.
    """

    id: str
    name: str
    description: str = ""
    icon: str = ""
    tools: list[FrontendToolDef] = Field(default_factory=list)


# =============================================================================
# Scene View Definitions
# =============================================================================


class FrontendSceneViewDef(BaseModel):
    """
    Scene view plugin definition for frontend registration.

    Scene views provide different rendering modes for scene content
    (e.g., comic panels, visual novel, etc.).
    """

    id: str
    display_name: str = Field(alias="displayName")
    description: str = ""
    surfaces: list[str] = Field(default_factory=list)  # overlay, hud, panel
    default: bool = False

    # Bundle URL for remote loading (optional)
    bundle_url: Optional[str] = Field(default=None, alias="bundleUrl")

    model_config = {"populate_by_name": True}


# =============================================================================
# Control Center Definitions
# =============================================================================


class FrontendControlCenterDef(BaseModel):
    """
    Control center plugin definition for frontend registration.

    Control centers provide different UI modes for the main application
    (e.g., dock mode, cube mode, etc.).
    """

    id: str
    display_name: str = Field(alias="displayName")
    description: str = ""
    default: bool = False
    features: list[str] = Field(default_factory=list)

    # Bundle URL for remote loading (optional)
    bundle_url: Optional[str] = Field(default=None, alias="bundleUrl")

    model_config = {"populate_by_name": True}


# =============================================================================
# Codegen Task Definition (Escape Hatch - Option A)
# =============================================================================


class CodegenTaskDef(BaseModel):
    """
    Plugin-contributed codegen task.

    Allows plugins to contribute their own type generation scripts.
    Use sparingly - prefer the standard frontend_manifest schema.
    """

    id: str
    description: str
    script: str  # Path to script relative to repo root
    supports_check: bool = Field(default=False, alias="supportsCheck")
    groups: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


# =============================================================================
# Main Frontend Manifest
# =============================================================================


class FrontendPluginManifest(BaseModel):
    """
    Canonical frontend plugin manifest.

    This is the typed schema for frontend_manifest in PluginManifest.
    All fields use camelCase aliases for frontend compatibility.
    """

    plugin_id: str = Field(alias="pluginId")
    plugin_name: str = Field(alias="pluginName")
    version: str
    description: str = ""
    icon: str = ""
    tags: list[str] = Field(default_factory=list)

    # Family-specific components
    interactions: list[FrontendInteractionDef] = Field(default_factory=list)
    helpers: list[FrontendHelperDef] = Field(default_factory=list)
    gating: list[FrontendGatingDef] = Field(default_factory=list)
    tools: list[FrontendToolDef] = Field(default_factory=list)
    tool_packs: list[FrontendToolPack] = Field(default_factory=list, alias="toolPacks")

    # UI plugin families
    scene_views: list[FrontendSceneViewDef] = Field(default_factory=list, alias="sceneViews")
    control_centers: list[FrontendControlCenterDef] = Field(default_factory=list, alias="controlCenters")

    # Escape hatch for custom codegen (Option A)
    codegen_tasks: list[CodegenTaskDef] = Field(default_factory=list, alias="codegenTasks")

    model_config = {"populate_by_name": True}


# =============================================================================
# API Response Models
# =============================================================================


class FrontendManifestEntry(BaseModel):
    """
    Single plugin entry in the frontend manifest list response.

    Wraps FrontendPluginManifest with plugin metadata.
    """

    plugin_id: str = Field(alias="pluginId")
    enabled: bool
    kind: str
    required: bool = False
    origin: str  # builtin, plugin-dir
    author: str = ""
    description: str = ""
    version: str = ""
    tags: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    manifest: FrontendPluginManifest

    model_config = {"populate_by_name": True}


class AllFrontendManifestsResponse(BaseModel):
    """
    Response for /admin/plugins/frontend/all endpoint.

    Contains all enabled plugins with frontend manifests.
    """

    manifests: list[FrontendManifestEntry]
    total: int
