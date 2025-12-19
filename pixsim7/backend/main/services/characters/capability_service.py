"""Character Capability Service

Manages character capabilities - skills/abilities that characters can perform.
Like a plugin system for characters, linking them to action blocks.

Use Cases:
- Define what a character can do (combat, seduction, stealth, etc.)
- Link capabilities to action blocks
- Validate scene requirements (does character have required capabilities?)
- Skill-based action block selection
"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from pixsim7.backend.main.domain.game.entities import CharacterCapability
from pixsim7.backend.main.domain.generation.action_block import ActionBlockDB


class CharacterCapabilityService:
    """Service for managing character capabilities"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_capability(
        self,
        capability_type: str,
        skill_level: int = 5,
        character_id: Optional[UUID] = None,
        character_instance_id: Optional[UUID] = None,
        action_blocks: Optional[List[UUID]] = None,
        conditions: Optional[Dict[str, Any]] = None,
        effects: Optional[Dict[str, Any]] = None,
        cooldown_seconds: Optional[int] = None,
        description: Optional[str] = None,
        tags: Optional[Dict[str, Any]] = None
    ) -> CharacterCapability:
        """Add a capability to a character or character instance

        Args:
            capability_type: Type of capability (combat, seduction, etc.)
            skill_level: Skill level 1-10
            character_id: Character template (applies to all instances)
            character_instance_id: Specific instance (overrides template)
            action_blocks: Action blocks this capability enables
            conditions: Conditions for using capability
            effects: Effects when capability is used
            cooldown_seconds: Cooldown between uses
            description: Description
            tags: Additional tags

        Returns:
            Created capability
        """
        if not character_id and not character_instance_id:
            raise ValueError("Must specify either character_id or character_instance_id")

        capability = CharacterCapability(
            id=uuid4(),
            character_id=character_id,
            character_instance_id=character_instance_id,
            capability_type=capability_type,
            skill_level=min(max(skill_level, 1), 10),  # Clamp to 1-10
            action_blocks=action_blocks or [],
            conditions=conditions or {},
            effects=effects or {},
            cooldown_seconds=cooldown_seconds,
            description=description,
            tags=tags or {},
            is_active=True,
            created_at=datetime.utcnow()
        )

        self.db.add(capability)
        await self.db.commit()
        await self.db.refresh(capability)

        return capability

    async def get_capability(self, capability_id: UUID) -> Optional[CharacterCapability]:
        """Get capability by ID"""
        return await self.db.get(CharacterCapability, capability_id)

    async def list_capabilities(
        self,
        character_id: Optional[UUID] = None,
        character_instance_id: Optional[UUID] = None,
        capability_type: Optional[str] = None,
        min_skill_level: Optional[int] = None
    ) -> List[CharacterCapability]:
        """List capabilities with filters"""
        query = select(CharacterCapability).where(
            CharacterCapability.is_active == True
        )

        if character_id:
            query = query.where(CharacterCapability.character_id == character_id)
        if character_instance_id:
            query = query.where(CharacterCapability.character_instance_id == character_instance_id)
        if capability_type:
            query = query.where(CharacterCapability.capability_type == capability_type)
        if min_skill_level:
            query = query.where(CharacterCapability.skill_level >= min_skill_level)

        query = query.order_by(CharacterCapability.skill_level.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_capabilities_for_character(
        self,
        character_id: UUID,
        character_instance_id: Optional[UUID] = None
    ) -> Dict[str, CharacterCapability]:
        """Get all capabilities for a character (template + instance overrides)

        Returns merged capabilities where instance capabilities override template.

        Args:
            character_id: Character template
            character_instance_id: Specific instance (optional)

        Returns:
            Dict of {capability_type: CharacterCapability}
        """
        # Get template capabilities
        template_caps = await self.list_capabilities(character_id=character_id)

        capabilities = {cap.capability_type: cap for cap in template_caps}

        # Get instance capabilities (override template)
        if character_instance_id:
            instance_caps = await self.list_capabilities(
                character_instance_id=character_instance_id
            )
            for cap in instance_caps:
                capabilities[cap.capability_type] = cap  # Instance overrides template

        return capabilities

    async def check_capability(
        self,
        character_id: UUID,
        capability_type: str,
        min_skill_level: int = 1,
        character_instance_id: Optional[UUID] = None
    ) -> Optional[CharacterCapability]:
        """Check if character has a capability at minimum skill level

        Args:
            character_id: Character template
            capability_type: Capability to check
            min_skill_level: Minimum required skill level
            character_instance_id: Specific instance

        Returns:
            Capability if exists and meets min level, else None
        """
        capabilities = await self.get_all_capabilities_for_character(
            character_id=character_id,
            character_instance_id=character_instance_id
        )

        cap = capabilities.get(capability_type)
        if cap and cap.skill_level >= min_skill_level:
            return cap

        return None

    async def get_action_blocks_for_capability(
        self,
        capability_id: UUID
    ) -> List[ActionBlockDB]:
        """Get action blocks enabled by a capability

        Args:
            capability_id: Capability to get blocks for

        Returns:
            List of action blocks
        """
        capability = await self.get_capability(capability_id)
        if not capability or not capability.action_blocks:
            return []

        # Get action blocks
        result = await self.db.execute(
            select(ActionBlockDB).where(
                ActionBlockDB.id.in_(capability.action_blocks)
            )
        )
        return list(result.scalars().all())

    async def get_available_action_blocks(
        self,
        character_id: UUID,
        character_instance_id: Optional[UUID] = None,
        capability_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all action blocks available to a character through capabilities

        Args:
            character_id: Character template
            character_instance_id: Specific instance
            capability_type: Filter by capability type

        Returns:
            List of available action blocks with capability context
        """
        capabilities = await self.get_all_capabilities_for_character(
            character_id=character_id,
            character_instance_id=character_instance_id
        )

        if capability_type:
            capabilities = {k: v for k, v in capabilities.items() if k == capability_type}

        available_blocks = []

        for cap_type, capability in capabilities.items():
            if not capability.action_blocks:
                continue

            # Get blocks for this capability
            blocks = await self.get_action_blocks_for_capability(capability.id)

            for block in blocks:
                available_blocks.append({
                    "action_block_id": str(block.id),
                    "block_id": block.block_id,
                    "capability_type": cap_type,
                    "skill_level": capability.skill_level,
                    "conditions": capability.conditions,
                    "effects": capability.effects,
                    "cooldown_seconds": capability.cooldown_seconds,
                    "block_prompt": block.prompt[:100] + "..." if len(block.prompt) > 100 else block.prompt
                })

        return available_blocks

    async def update_capability(
        self,
        capability_id: UUID,
        skill_level: Optional[int] = None,
        action_blocks: Optional[List[UUID]] = None,
        conditions: Optional[Dict[str, Any]] = None,
        effects: Optional[Dict[str, Any]] = None,
        cooldown_seconds: Optional[int] = None
    ) -> CharacterCapability:
        """Update a capability

        Args:
            capability_id: Capability to update
            skill_level: New skill level
            action_blocks: New action blocks
            conditions: New conditions
            effects: New effects
            cooldown_seconds: New cooldown

        Returns:
            Updated capability
        """
        capability = await self.get_capability(capability_id)
        if not capability:
            raise ValueError(f"Capability {capability_id} not found")

        if skill_level is not None:
            capability.skill_level = min(max(skill_level, 1), 10)
        if action_blocks is not None:
            capability.action_blocks = action_blocks
        if conditions is not None:
            capability.conditions = conditions
        if effects is not None:
            capability.effects = effects
        if cooldown_seconds is not None:
            capability.cooldown_seconds = cooldown_seconds

        await self.db.commit()
        await self.db.refresh(capability)

        return capability

    async def delete_capability(
        self,
        capability_id: UUID,
        soft: bool = True
    ) -> bool:
        """Delete a capability

        Args:
            capability_id: Capability to delete
            soft: Soft delete (set is_active=False)

        Returns:
            Success
        """
        capability = await self.get_capability(capability_id)
        if not capability:
            return False

        if soft:
            capability.is_active = False
            await self.db.commit()
        else:
            await self.db.delete(capability)
            await self.db.commit()

        return True

    async def get_capability_summary(
        self,
        character_id: UUID,
        character_instance_id: Optional[UUID] = None
    ) -> Dict[str, Any]:
        """Get summary of character's capabilities

        Args:
            character_id: Character template
            character_instance_id: Specific instance

        Returns:
            Capability summary with stats
        """
        capabilities = await self.get_all_capabilities_for_character(
            character_id=character_id,
            character_instance_id=character_instance_id
        )

        summary = {
            "total_capabilities": len(capabilities),
            "capabilities_by_type": {},
            "average_skill_level": 0,
            "total_action_blocks": 0
        }

        if capabilities:
            total_skill = 0
            total_blocks = 0

            for cap_type, capability in capabilities.items():
                summary["capabilities_by_type"][cap_type] = {
                    "skill_level": capability.skill_level,
                    "action_blocks_count": len(capability.action_blocks),
                    "has_conditions": len(capability.conditions) > 0,
                    "has_cooldown": capability.cooldown_seconds is not None
                }
                total_skill += capability.skill_level
                total_blocks += len(capability.action_blocks)

            summary["average_skill_level"] = total_skill / len(capabilities)
            summary["total_action_blocks"] = total_blocks

        return summary
