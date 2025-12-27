"""
Prompt Intent Service

Interprets prompt roles into intent (generate/preserve/modify/add/remove)
based on operation mode and presence of input assets.
"""
from typing import Dict, Iterable, Optional, Set

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.domain.prompt.enums import BlockIntent
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry


DEFAULT_OPERATION_MODE = "character_entrance"

# Map API operation types to higher-level prompt operation modes.
# Callers should override this when a more specific mode is known.
OPERATION_TYPE_TO_MODE: dict[OperationType, str] = {
    OperationType.TEXT_TO_IMAGE: "character_entrance",
    OperationType.TEXT_TO_VIDEO: "character_entrance",
    OperationType.IMAGE_TO_IMAGE: "scene_edit",
    OperationType.IMAGE_TO_VIDEO: "pose_change",
    OperationType.VIDEO_EXTEND: "pose_change",
    OperationType.VIDEO_TRANSITION: "pose_change",
    OperationType.FUSION: "add_creature",
}

# For each operation mode, specify intent for roles that are explicitly present.
# Roles not listed fall back to BlockIntent.GENERATE when explicit.
MODE_TARGET_INTENTS: dict[str, dict[str, BlockIntent]] = {
    "character_entrance": {
        "character": BlockIntent.GENERATE,
        "action": BlockIntent.GENERATE,
        "setting": BlockIntent.GENERATE,
        "mood": BlockIntent.GENERATE,
        "romance": BlockIntent.GENERATE,
    },
    "scene_edit": {
        "setting": BlockIntent.MODIFY,
        "mood": BlockIntent.MODIFY,
    },
    "pose_change": {
        "action": BlockIntent.MODIFY,
    },
    "clothing_change": {
        "character": BlockIntent.MODIFY,
    },
    "add_creature": {
        "character": BlockIntent.ADD,
    },
}


class PromptIntentService:
    """Resolve prompt role intents for a given operation context."""

    def __init__(
        self,
        role_registry: Optional[PromptRoleRegistry] = None,
        operation_profiles: Optional[Dict[str, Dict[str, BlockIntent | str]]] = None,
    ):
        self.role_registry = role_registry or PromptRoleRegistry.default()
        self._mode_target_intents = {mode: mapping.copy() for mode, mapping in MODE_TARGET_INTENTS.items()}
        if operation_profiles:
            self.register_operation_profiles(operation_profiles)

    def normalize_operation_mode(self, operation: Optional[object]) -> str:
        """Normalize an operation enum or string to a prompt operation mode."""
        if isinstance(operation, OperationType):
            return OPERATION_TYPE_TO_MODE.get(operation, DEFAULT_OPERATION_MODE)
        if isinstance(operation, str):
            try:
                op_enum = OperationType(operation)
            except ValueError:
                op_enum = None
            if op_enum:
                return OPERATION_TYPE_TO_MODE.get(op_enum, DEFAULT_OPERATION_MODE)
            return operation
        return DEFAULT_OPERATION_MODE

    def infer_role_intent(
        self,
        role_id: str,
        *,
        is_explicit: bool,
        operation: Optional[object] = None,
        has_input_asset: bool = False,
    ) -> BlockIntent:
        """Infer intent for a single role given operation and explicitness."""
        mode = self.normalize_operation_mode(operation)
        target_intents = self._mode_target_intents.get(mode, {})

        if is_explicit:
            return target_intents.get(role_id, BlockIntent.GENERATE)

        return BlockIntent.PRESERVE if has_input_asset else BlockIntent.GENERATE

    def infer_intents(
        self,
        roles_present: Iterable[str],
        *,
        operation: Optional[object] = None,
        has_input_asset: bool = False,
        include_implicit: bool = True,
        role_ids: Optional[Iterable[str]] = None,
    ) -> Dict[str, BlockIntent]:
        """Infer intents for all roles present (and optionally implicit roles)."""
        role_set = self._normalize_roles(roles_present)
        intents: Dict[str, BlockIntent] = {}

        target_roles = list(self._normalize_roles(role_ids)) if role_ids else []
        if include_implicit:
            target_roles = target_roles or self.role_registry.list_role_ids()
        else:
            target_roles = target_roles or list(role_set)

        for role_id in target_roles:
            is_explicit = role_id in role_set
            if not is_explicit and not include_implicit:
                continue
            intents[role_id] = self.infer_role_intent(
                role_id,
                is_explicit=is_explicit,
                operation=operation,
                has_input_asset=has_input_asset,
            )

        return intents

    def register_operation_profiles(self, profiles: Dict[str, Dict[str, BlockIntent | str]]) -> None:
        """Register or override intent mappings for operation modes."""
        for mode, mapping in profiles.items():
            normalized: Dict[str, BlockIntent] = {}
            for role_id, intent in mapping.items():
                if isinstance(intent, BlockIntent):
                    normalized[role_id] = intent
                else:
                    try:
                        normalized[role_id] = BlockIntent(str(intent))
                    except ValueError:
                        continue
            if normalized:
                self._mode_target_intents[mode] = normalized

    def register_operation_profiles_from_pack_extra(self, extra: Dict[str, object]) -> None:
        """Register operation profiles from semantic pack metadata."""
        profiles = extra.get("operation_profiles")
        if isinstance(profiles, dict):
            self.register_operation_profiles(profiles)

    def _normalize_roles(self, roles: Iterable[object]) -> Set[str]:
        normalized: Set[str] = set()
        for role in roles:
            if role is None:
                continue
            if isinstance(role, str):
                normalized.add(self.role_registry.resolve_role_id(role))
                continue
            value = getattr(role, "value", None)
            if value:
                normalized.add(self.role_registry.resolve_role_id(str(value)))
        return normalized
