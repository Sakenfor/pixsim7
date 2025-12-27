"""Scene Character Manifest Service

Validates that scenes have required characters before generation.
Manages character roles and requirements per scene.

Use Cases:
- Define which characters are needed for a scene
- Validate scene can be generated (all required characters exist)
- Check character capabilities match scene requirements
- Manage character relationships for scene dynamics
"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.game.entities import SceneCharacterManifest
from pixsim7.backend.main.services.characters.character import CharacterService
from pixsim7.backend.main.services.characters.capability import CharacterCapabilityService


class SceneCharacterManifestService:
    """Service for managing scene character manifests"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.character_service = CharacterService(db)
        self.capability_service = CharacterCapabilityService(db)

    async def create_manifest(
        self,
        scene_id: int,
        required_characters: List[str],
        optional_characters: Optional[List[str]] = None,
        character_roles: Optional[Dict[str, Any]] = None,
        required_relationships: Optional[Dict[str, Any]] = None,
        instance_requirements: Optional[Dict[str, Any]] = None,
        validation_rules: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None
    ) -> SceneCharacterManifest:
        """Create a scene character manifest

        Args:
            scene_id: Scene this manifest belongs to
            required_characters: List of character_ids that must be present
            optional_characters: List of character_ids that can be present
            character_roles: Roles for each character
            required_relationships: Required relationship states
            instance_requirements: World-specific instance requirements
            validation_rules: Custom validation rules
            created_by: Creator username

        Returns:
            Created manifest
        """
        manifest = SceneCharacterManifest(
            id=uuid4(),
            scene_id=scene_id,
            required_characters=required_characters,
            optional_characters=optional_characters or [],
            character_roles=character_roles or {},
            required_relationships=required_relationships or {},
            instance_requirements=instance_requirements or {},
            validation_rules=validation_rules or {},
            created_by=created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(manifest)
        await self.db.commit()
        await self.db.refresh(manifest)

        return manifest

    async def get_manifest(self, manifest_id: UUID) -> Optional[SceneCharacterManifest]:
        """Get manifest by ID"""
        return await self.db.get(SceneCharacterManifest, manifest_id)

    async def get_manifest_for_scene(self, scene_id: int) -> Optional[SceneCharacterManifest]:
        """Get manifest for a scene"""
        result = await self.db.execute(
            select(SceneCharacterManifest).where(
                SceneCharacterManifest.scene_id == scene_id
            )
        )
        return result.scalar_one_or_none()

    async def validate_scene(
        self,
        scene_id: int,
        available_characters: Optional[List[str]] = None,
        world_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Validate that a scene can be generated with available characters

        Args:
            scene_id: Scene to validate
            available_characters: List of available character_ids (if None, checks if they exist)
            world_id: World context for instance validation

        Returns:
            Validation result with errors/warnings
        """
        manifest = await self.get_manifest_for_scene(scene_id)
        if not manifest:
            return {
                "valid": True,
                "reason": "No manifest defined for scene"
            }

        errors = []
        warnings = []

        # Check required characters exist
        for char_id in manifest.required_characters:
            character = await self.character_service.get_character_by_id(char_id)
            if not character:
                errors.append(f"Required character '{char_id}' does not exist")
            elif available_characters is not None and char_id not in available_characters:
                errors.append(f"Required character '{char_id}' not available")

        # Check character capabilities
        for char_id, role_info in manifest.character_roles.items():
            if not isinstance(role_info, dict):
                continue

            required_capabilities = role_info.get("required_capabilities", [])
            if not required_capabilities:
                continue

            character = await self.character_service.get_character_by_id(char_id)
            if not character:
                continue

            # Check each required capability
            for cap_type in required_capabilities:
                cap = await self.capability_service.check_capability(
                    character_id=character.id,
                    capability_type=cap_type,
                    min_skill_level=1
                )
                if not cap:
                    errors.append(
                        f"Character '{char_id}' missing required capability '{cap_type}'"
                    )

        # Check instance requirements (if world specified)
        if world_id and manifest.instance_requirements:
            from pixsim7.backend.main.services.characters.instance import CharacterInstanceService
            instance_service = CharacterInstanceService(self.db)

            for char_id, requirements in manifest.instance_requirements.items():
                if not isinstance(requirements, dict):
                    continue

                required_world_id = requirements.get("world_id")
                if required_world_id and required_world_id != world_id:
                    warnings.append(
                        f"Character '{char_id}' instance required for world {required_world_id}, "
                        f"but validating for world {world_id}"
                    )

                min_version = requirements.get("min_version")
                if min_version:
                    character = await self.character_service.get_character_by_id(char_id)
                    if character and character.version < min_version:
                        errors.append(
                            f"Character '{char_id}' version {character.version} < "
                            f"required version {min_version}"
                        )

        # Check relationships if defined
        if manifest.required_relationships:
            # TODO: Implement relationship validation when CharacterRelationship service exists
            warnings.append("Relationship validation not yet implemented")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "required_characters": manifest.required_characters,
            "optional_characters": manifest.optional_characters
        }

    async def get_character_role(
        self,
        scene_id: int,
        character_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a character's role in a scene

        Args:
            scene_id: Scene to check
            character_id: Character to get role for

        Returns:
            Role information or None
        """
        manifest = await self.get_manifest_for_scene(scene_id)
        if not manifest or not manifest.character_roles:
            return None

        return manifest.character_roles.get(character_id)

    async def update_manifest(
        self,
        manifest_id: UUID,
        required_characters: Optional[List[str]] = None,
        optional_characters: Optional[List[str]] = None,
        character_roles: Optional[Dict[str, Any]] = None,
        required_relationships: Optional[Dict[str, Any]] = None
    ) -> SceneCharacterManifest:
        """Update a scene character manifest

        Args:
            manifest_id: Manifest to update
            required_characters: New required characters
            optional_characters: New optional characters
            character_roles: New character roles
            required_relationships: New relationship requirements

        Returns:
            Updated manifest
        """
        manifest = await self.get_manifest(manifest_id)
        if not manifest:
            raise ValueError(f"Manifest {manifest_id} not found")

        if required_characters is not None:
            manifest.required_characters = required_characters
        if optional_characters is not None:
            manifest.optional_characters = optional_characters
        if character_roles is not None:
            manifest.character_roles = character_roles
        if required_relationships is not None:
            manifest.required_relationships = required_relationships

        manifest.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(manifest)

        return manifest

    async def add_required_character(
        self,
        scene_id: int,
        character_id: str,
        role: Optional[Dict[str, Any]] = None
    ) -> SceneCharacterManifest:
        """Add a required character to a scene manifest

        Args:
            scene_id: Scene to update
            character_id: Character to add
            role: Role information

        Returns:
            Updated manifest
        """
        manifest = await self.get_manifest_for_scene(scene_id)
        if not manifest:
            # Create new manifest
            manifest = await self.create_manifest(
                scene_id=scene_id,
                required_characters=[character_id],
                character_roles={character_id: role} if role else {}
            )
        else:
            # Update existing
            if character_id not in manifest.required_characters:
                manifest.required_characters.append(character_id)
            if role:
                roles = manifest.character_roles.copy()
                roles[character_id] = role
                manifest.character_roles = roles
            manifest.updated_at = datetime.utcnow()
            await self.db.commit()
            await self.db.refresh(manifest)

        return manifest

    async def remove_required_character(
        self,
        scene_id: int,
        character_id: str
    ) -> SceneCharacterManifest:
        """Remove a required character from a scene manifest

        Args:
            scene_id: Scene to update
            character_id: Character to remove

        Returns:
            Updated manifest
        """
        manifest = await self.get_manifest_for_scene(scene_id)
        if not manifest:
            raise ValueError(f"No manifest found for scene {scene_id}")

        if character_id in manifest.required_characters:
            manifest.required_characters.remove(character_id)

        if character_id in manifest.character_roles:
            roles = manifest.character_roles.copy()
            del roles[character_id]
            manifest.character_roles = roles

        manifest.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(manifest)

        return manifest

    async def delete_manifest(self, manifest_id: UUID) -> bool:
        """Delete a scene character manifest

        Args:
            manifest_id: Manifest to delete

        Returns:
            Success
        """
        manifest = await self.get_manifest(manifest_id)
        if not manifest:
            return False

        await self.db.delete(manifest)
        await self.db.commit()
        return True
