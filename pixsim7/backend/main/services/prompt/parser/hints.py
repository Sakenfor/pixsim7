"""
Parser Hint Provider for Semantic Packs

Merges parser hints from active semantic packs to customize parser behavior
without modifying core parser code.
"""

from typing import Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry


class ParserHintProvider:
    """
    Provides merged parser hints from semantic packs.

    Parser hints allow packs to extend the parser's vocabulary with custom
    keywords and synonyms for roles, attributes, and actions.
    """

    @staticmethod
    async def get_active_packs(
        db: AsyncSession,
        pack_ids: Optional[List[str]] = None,
        status: str = "published"
    ) -> List[SemanticPackDB]:
        """
        Fetch active semantic packs from the database.

        Args:
            db: Database session
            pack_ids: Optional list of specific pack IDs to load
            status: Pack status filter (default: published)

        Returns:
            List of SemanticPackDB instances
        """
        query = select(SemanticPackDB)

        if pack_ids:
            query = query.where(SemanticPackDB.id.in_(pack_ids))
        else:
            query = query.where(SemanticPackDB.status == status)

        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    def build_role_keyword_map(
        packs: List[SemanticPackDB]
    ) -> Dict[str, List[str]]:
        """
        Merge parser_hints from all active packs into a unified map.

        Args:
            packs: List of semantic packs to merge

        Returns:
            Dictionary mapping role/attribute keys to lists of keywords
            Format: { 'role:character': ['minotaur', 'werecow'], ... }
        """
        merged: Dict[str, List[str]] = {}

        for pack in packs:
            for key, words in pack.parser_hints.items():
                if key not in merged:
                    merged[key] = []

                for word in words:
                    word_lower = word.lower()
                    if word_lower not in [w.lower() for w in merged[key]]:
                        merged[key].append(word)

        return merged

    @staticmethod
    def extract_role_definitions(packs: List[SemanticPackDB]) -> List[Dict[str, object]]:
        """Extract role definitions from semantic pack extra metadata."""
        roles: List[Dict[str, object]] = []
        for pack in packs:
            extra = pack.extra or {}
            pack_roles = extra.get("roles")
            if isinstance(pack_roles, list):
                roles.extend([r for r in pack_roles if isinstance(r, dict)])
        return roles

    @staticmethod
    def build_role_registry(
        packs: List[SemanticPackDB],
        base_registry: Optional[PromptRoleRegistry] = None,
    ) -> PromptRoleRegistry:
        """Build a role registry from semantic packs (roles + parser hints)."""
        registry = base_registry.clone() if base_registry else PromptRoleRegistry.default()

        for pack in packs:
            registry.register_roles_from_pack(pack)
            registry.apply_hints(pack.parser_hints or {})

        return registry

    @staticmethod
    def build_keyword_map_sync(
        packs: List[SemanticPackDB]
    ) -> Dict[str, List[str]]:
        """Synchronous version of build_role_keyword_map."""
        return ParserHintProvider.build_role_keyword_map(packs)

    @staticmethod
    def extract_role_hints(
        hint_map: Dict[str, List[str]],
        role: str
    ) -> List[str]:
        """
        Extract keywords for a specific role from the hint map.

        Args:
            hint_map: Merged hint map from build_role_keyword_map
            role: Role to extract (e.g., 'role:character', 'mood', 'setting')

        Returns:
            List of keywords for that role
        """
        prefixed = f"role:{role}" if not role.startswith("role:") else role
        unprefixed = role.replace("role:", "") if role.startswith("role:") else role

        keywords = []

        if prefixed in hint_map:
            keywords.extend(hint_map[prefixed])
        if unprefixed in hint_map:
            keywords.extend(hint_map[unprefixed])

        return list(set(keywords))

    @staticmethod
    async def get_hints_for_packs(
        db: AsyncSession,
        pack_ids: Optional[List[str]] = None,
        status: str = "published"
    ) -> Dict[str, List[str]]:
        """
        Convenience method: Load packs and build hint map in one call.
        """
        packs = await ParserHintProvider.get_active_packs(db, pack_ids, status)
        return ParserHintProvider.build_role_keyword_map(packs)


# Convenience functions for backward compatibility

async def build_role_keyword_map_from_db(
    db: AsyncSession,
    pack_ids: Optional[List[str]] = None,
    status: str = "published"
) -> Dict[str, List[str]]:
    """Convenience function to build keyword map from database."""
    return await ParserHintProvider.get_hints_for_packs(db, pack_ids, status)


def build_role_keyword_map(packs: List[SemanticPackDB]) -> Dict[str, List[str]]:
    """Convenience function to build keyword map from pack list."""
    return ParserHintProvider.build_role_keyword_map(packs)
