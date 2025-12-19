"""
Cross-cutting API schemas and contracts.

BOUNDARY RULES - Only export schemas from this module if they meet ALL criteria:
1. Used by multiple domains (not domain-specific)
2. Part of external API contracts (request/response DTOs)
3. Cross-cutting infrastructure concerns (telemetry, auth, billing, etc.)

EXAMPLES of what belongs here:
 GenerationRequest/Response - Used by multiple domains for API contracts
 TelemetryEvent - Cross-cutting observability infrastructure
 AuthClaims/TokenPayload - Cross-cutting authentication infrastructure

EXAMPLES of what does NOT belong here:
L NPCPromptContext - Domain-specific to game/NPC domain
L StatDefinition - Domain-specific to stats domain
L NarrativeProgram - Domain-specific to narrative domain

Domain-specific schemas belong in their domain modules:
- Game/NPC schemas -> pixsim7.backend.main.domain.game.schemas
- Stat schemas -> pixsim7.backend.main.domain.stats (no separate schemas submodule)
- Narrative schemas -> pixsim7.backend.main.domain.narrative.schema

When in doubt: Keep it in the domain. Moving to shared/ later is easier than
extracting domain-specific code from shared/.

---

If you do export schemas here, organize by category and document why each
schema is cross-cutting:

# Example (only add if schemas are truly cross-cutting):
# from .generation_schemas import GenerationRequest  # Multi-domain API contract
# from .telemetry_schemas import TelemetryEvent      # Cross-cutting observability
#
# __all__ = [
#     "GenerationRequest",
#     "TelemetryEvent",
# ]
"""

# Cross-cutting entity reference type for all DTOs
from pixsim7.backend.main.shared.schemas.entity_ref import (
    EntityRef,
    AssetRef,
    SceneRef,
    NpcRef,
    LocationRef,
    WorldRef,
    SessionRef,
    UserRef,
    GenerationRef,
    WorkspaceRef,
    AccountRef,
    entity_ref_field,
)

# Standardized error response for all API errors
from pixsim7.backend.main.shared.schemas.error_response import (
    ErrorResponse,
    ErrorCodes,
)

__all__ = [
    # EntityRef - canonical reference type for API boundaries
    "EntityRef",
    "AssetRef",
    "SceneRef",
    "NpcRef",
    "LocationRef",
    "WorldRef",
    "SessionRef",
    "UserRef",
    "GenerationRef",
    "WorkspaceRef",
    "AccountRef",
    "entity_ref_field",
    # ErrorResponse - standardized error format for all API errors
    "ErrorResponse",
    "ErrorCodes",
]
