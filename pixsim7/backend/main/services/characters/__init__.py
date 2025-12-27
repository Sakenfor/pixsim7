"""Character services

Services for managing the character registry including:
- Character CRUD operations
- Character versioning and evolution
- Character instances (world-specific versions)
- Character-NPC synchronization
- Character capabilities (plugin system)
- Scene character manifests (validation)
- Template expansion for {{character:id}} references
- Usage tracking
- Game NPC integration
"""
from pixsim7.backend.main.services.characters.character import CharacterService
from pixsim7.backend.main.services.characters.template_engine import CharacterTemplateEngine
from pixsim7.backend.main.services.characters.instance import CharacterInstanceService
from pixsim7.backend.main.services.characters.npc_sync import CharacterNPCSyncService
from pixsim7.backend.main.services.characters.capability import CharacterCapabilityService
from pixsim7.backend.main.services.characters.scene_manifest import SceneCharacterManifestService
from pixsim7.backend.main.services.characters.prompt_context import (
    EnricherFn,
    PromptContextRequest,
    PromptContextService,
    PromptContextSnapshot,
)

__all__ = [
    'CharacterService',
    'CharacterTemplateEngine',
    'CharacterInstanceService',
    'CharacterNPCSyncService',
    'CharacterCapabilityService',
    'SceneCharacterManifestService',
    'EnricherFn',
    'PromptContextRequest',
    'PromptContextService',
    'PromptContextSnapshot',
]
