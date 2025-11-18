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
from pixsim7_backend.services.characters.character_service import CharacterService
from pixsim7_backend.services.characters.template_engine import CharacterTemplateEngine
from pixsim7_backend.services.characters.instance_service import CharacterInstanceService
from pixsim7_backend.services.characters.npc_sync_service import CharacterNPCSyncService
from pixsim7_backend.services.characters.capability_service import CharacterCapabilityService
from pixsim7_backend.services.characters.scene_manifest_service import SceneCharacterManifestService

__all__ = [
    'CharacterService',
    'CharacterTemplateEngine',
    'CharacterInstanceService',
    'CharacterNPCSyncService',
    'CharacterCapabilityService',
    'SceneCharacterManifestService',
]
