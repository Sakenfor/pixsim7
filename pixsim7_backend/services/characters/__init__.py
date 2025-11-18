"""Character services

Services for managing the character registry including:
- Character CRUD operations
- Character versioning and evolution
- Template expansion for {{character:id}} references
- Usage tracking
- Game NPC integration
"""
from pixsim7_backend.services.characters.character_service import CharacterService
from pixsim7_backend.services.characters.template_engine import CharacterTemplateEngine

__all__ = [
    'CharacterService',
    'CharacterTemplateEngine',
]
