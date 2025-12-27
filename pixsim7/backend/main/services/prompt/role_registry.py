"""
Prompt Role Registry

Provides dynamic registration of prompt roles and their keyword vocabularies.
Used by parsers and intent mapping to support pack-defined extensions.
"""
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from pixsim7.backend.main.services.prompt.parser.ontology import ROLE_KEYWORDS


DEFAULT_ROLE_PRIORITIES: Dict[str, int] = {
    "romance": 60,
    "mood": 50,
    "setting": 40,
    "action": 30,
    "character": 20,
    "camera": 10,
    "other": 0,
}

DEFAULT_ROLE_DESCRIPTIONS: Dict[str, str] = {
    "character": "Descriptions of people, creatures, or beings",
    "action": "Actions, movement, behaviors, or interactions",
    "setting": "Environment, location, or time of day",
    "mood": "Emotional tone or atmosphere",
    "romance": "Romantic or intimate content",
    "camera": "Camera and shot instructions",
    "other": "Unclassified or technical content",
}

DEFAULT_DYNAMIC_PRIORITY = 15


@dataclass
class PromptRoleDefinition:
    """Definition for a prompt role used by parsers and intent mapping."""
    id: str
    label: str
    description: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    aliases: List[str] = field(default_factory=list)
    priority: int = 0

    def normalized_id(self) -> str:
        role_id = self.id.strip().lower()
        if role_id.startswith("role:"):
            role_id = role_id.split(":", 1)[1]
        return role_id

    def normalized_keywords(self) -> List[str]:
        return [k.lower() for k in self.keywords]


class PromptRoleRegistry:
    """Registry for prompt roles with keyword and alias support."""

    def __init__(self, roles: Optional[Iterable[PromptRoleDefinition]] = None):
        self._roles: Dict[str, PromptRoleDefinition] = {}
        self._aliases: Dict[str, str] = {}
        if roles:
            self.register_roles(roles)
        else:
            self._register_builtin_roles()

    @classmethod
    def default(cls) -> "PromptRoleRegistry":
        return cls()

    def clone(self) -> "PromptRoleRegistry":
        roles = [
            PromptRoleDefinition(
                id=role.id,
                label=role.label,
                description=role.description,
                keywords=list(role.keywords),
                aliases=list(role.aliases),
                priority=role.priority,
            )
            for role in self._roles.values()
        ]
        return PromptRoleRegistry(roles=roles)

    def _register_builtin_roles(self) -> None:
        for role_id, keywords in ROLE_KEYWORDS.items():
            self.register_role(
                PromptRoleDefinition(
                    id=role_id,
                    label=role_id.replace("_", " ").title(),
                    description=DEFAULT_ROLE_DESCRIPTIONS.get(role_id),
                    keywords=keywords,
                    priority=DEFAULT_ROLE_PRIORITIES.get(role_id, DEFAULT_DYNAMIC_PRIORITY),
                )
            )

        if "other" not in self._roles:
            self.register_role(
                PromptRoleDefinition(
                    id="other",
                    label="Other",
                    description=DEFAULT_ROLE_DESCRIPTIONS.get("other"),
                    keywords=[],
                    priority=DEFAULT_ROLE_PRIORITIES.get("other", 0),
                )
            )

    def register_role(self, role: PromptRoleDefinition, overwrite: bool = False) -> None:
        role_id = role.normalized_id()
        if role_id in self._roles and not overwrite:
            self._merge_role(role_id, role)
            return

        normalized = PromptRoleDefinition(
            id=role_id,
            label=role.label or role_id.replace("_", " ").title(),
            description=role.description,
            keywords=[k.lower() for k in role.keywords],
            aliases=[a.lower() for a in role.aliases],
            priority=role.priority,
        )
        self._roles[role_id] = normalized
        for alias in normalized.aliases:
            self._aliases[alias] = role_id

    def _merge_role(self, role_id: str, role: PromptRoleDefinition) -> None:
        existing = self._roles[role_id]
        if role.label and not existing.label:
            existing.label = role.label
        if role.description and not existing.description:
            existing.description = role.description
        for keyword in role.keywords:
            k = keyword.lower()
            if k not in existing.keywords:
                existing.keywords.append(k)
        for alias in role.aliases:
            a = alias.lower()
            if a not in existing.aliases:
                existing.aliases.append(a)
                self._aliases[a] = role_id
        if role.priority is not None and role.priority != existing.priority:
            existing.priority = role.priority

    def register_roles(self, roles: Iterable[PromptRoleDefinition]) -> None:
        for role in roles:
            self.register_role(role)

    def resolve_role_id(self, role_id: str) -> str:
        role_key = role_id.strip().lower()
        if role_key.startswith("role:"):
            role_key = role_key.split(":", 1)[1]
        return self._aliases.get(role_key, role_key)

    def has_role(self, role_id: str) -> bool:
        role_key = self.resolve_role_id(role_id)
        return role_key in self._roles

    def get_role(self, role_id: str) -> Optional[PromptRoleDefinition]:
        role_key = self.resolve_role_id(role_id)
        return self._roles.get(role_key)

    def list_roles(self, sort_by_priority: bool = True) -> List[PromptRoleDefinition]:
        roles = list(self._roles.values())
        if sort_by_priority:
            roles.sort(key=lambda r: r.priority, reverse=True)
        return roles

    def list_role_ids(self) -> List[str]:
        return [role.id for role in self.list_roles(sort_by_priority=True)]

    def get_role_keywords(self) -> Dict[str, List[str]]:
        return {role.id: list(role.keywords) for role in self._roles.values()}

    def get_role_priorities(self) -> Dict[str, int]:
        return {role.id: role.priority for role in self._roles.values()}

    def apply_hints(self, hints: Dict[str, List[str]]) -> None:
        for key, words in hints.items():
            role_id = self._normalize_hint_role(key)
            if not role_id:
                continue
            if not self.has_role(role_id):
                self.register_role(
                    PromptRoleDefinition(
                        id=role_id,
                        label=role_id.replace("_", " ").title(),
                        description=DEFAULT_ROLE_DESCRIPTIONS.get(role_id),
                        keywords=[],
                        priority=DEFAULT_DYNAMIC_PRIORITY,
                    )
                )
            self._merge_role(role_id, PromptRoleDefinition(id=role_id, label=role_id, keywords=words))

    def register_roles_from_pack_extra(self, extra: Dict[str, object]) -> None:
        roles = extra.get("roles")
        if not isinstance(roles, list):
            return
        for role in roles:
            if hasattr(role, "model_dump"):
                role = role.model_dump()
            if not isinstance(role, dict):
                continue
            role_id = role.get("id") or role.get("role_id")
            if not role_id:
                continue
            priority = role.get("priority")
            self.register_role(
                PromptRoleDefinition(
                    id=str(role_id),
                    label=str(role.get("label") or role_id),
                    description=role.get("description"),
                    keywords=role.get("keywords") or [],
                    aliases=role.get("aliases") or [],
                    priority=DEFAULT_DYNAMIC_PRIORITY if priority is None else priority,
                )
            )

    def register_roles_from_pack(self, pack: object) -> None:
        """Register role definitions from a SemanticPack manifest or DB model."""
        roles = getattr(pack, "roles", None)
        if roles:
            if hasattr(roles, "model_dump"):
                roles = roles.model_dump()
            if isinstance(roles, list):
                self.register_roles_from_pack_extra({"roles": roles})
                return
        extra = getattr(pack, "extra", None)
        if isinstance(extra, dict):
            self.register_roles_from_pack_extra(extra)

    @staticmethod
    def _normalize_hint_role(key: str) -> Optional[str]:
        if key.startswith("role:"):
            return key.replace("role:", "", 1).strip().lower()
        return key.strip().lower() if key else None
