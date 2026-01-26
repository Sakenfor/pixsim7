"""Link type registry for template->runtime pairs.

Centralizes the definition of linkable template/runtime pairs so loaders,
integrity checks, and field mappings can share a single source of truth.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from uuid import UUID

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.services.prompt.context.mapping import FieldMapping


MappingFactory = Callable[[], Dict[str, FieldMapping]]
IdParser = Callable[[Any], Any]


def parse_uuid(value: Any) -> UUID:
    """Parse UUIDs from strings or UUID instances."""
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def parse_int(value: Any) -> int:
    """Parse integer IDs from strings or int values."""
    return int(value)


def link_type_id(template_kind: str, runtime_kind: str) -> str:
    """Return canonical mapping ID for a template/runtime pair."""
    return f"{template_kind}->{runtime_kind}"


@dataclass(frozen=True)
class LinkTypeSpec:
    """Configuration for a template/runtime link type."""

    template_kind: str
    runtime_kind: str
    template_model: type
    runtime_model: type
    template_label: str
    runtime_label: str
    template_id_parser: IdParser = parse_uuid
    runtime_id_parser: IdParser = parse_int
    template_id_attr: str = "id"
    runtime_id_attr: str = "id"
    template_active_attr: Optional[str] = "is_active"
    mapping_factory: Optional[MappingFactory] = None

    @property
    def mapping_id(self) -> str:
        return link_type_id(self.template_kind, self.runtime_kind)


class LinkTypeRegistry(SimpleRegistry[str, LinkTypeSpec]):
    """Registry of template/runtime link type specifications."""

    def __init__(self):
        super().__init__(
            name="link_types",
            allow_overwrite=True,
            seed_on_init=False,
            log_operations=False,
        )

    def _get_item_key(self, item: LinkTypeSpec) -> str:
        return item.mapping_id

    def register_spec(self, spec: LinkTypeSpec) -> str:
        return self.register_item(spec)

    def get_by_kinds(self, template_kind: str, runtime_kind: str) -> Optional[LinkTypeSpec]:
        return self.get_or_none(link_type_id(template_kind, runtime_kind))

    def list_specs(self) -> list[LinkTypeSpec]:
        return self.values()


_link_type_registry = LinkTypeRegistry()


def get_link_type_registry() -> LinkTypeRegistry:
    """Return the global link type registry."""
    return _link_type_registry


def get_item_template_mapping() -> Dict[str, FieldMapping]:
    """Stub mapping for ItemTemplate -> GameItem."""
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name",
            },
        ),
        "description": FieldMapping(
            target_path="description",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "description",
                "runtime": "description",
            },
        ),
        "quantity": FieldMapping(
            target_path="state.quantity",
            source="runtime",
            fallback="template",
            source_paths={
                "template": "default_quantity",
                "runtime": "quantity",
            },
        ),
        "durability": FieldMapping(
            target_path="state.durability",
            source="runtime",
            fallback="template",
            source_paths={
                "template": "max_durability",
                "runtime": "durability",
            },
        ),
    }


def register_default_link_types() -> None:
    """Register core link types."""
    from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
    from pixsim7.backend.main.domain.game.entities.item_template import ItemTemplate
    from pixsim7.backend.main.domain.game.core.models import GameNPC, GameItem
    from pixsim7.backend.main.services.prompt.context.mappings.npc import get_npc_field_mapping

    registry = get_link_type_registry()

    registry.register_spec(LinkTypeSpec(
        template_kind="characterInstance",
        runtime_kind="npc",
        template_model=CharacterInstance,
        runtime_model=GameNPC,
        template_label="CharacterInstance",
        runtime_label="GameNPC",
        mapping_factory=get_npc_field_mapping,
    ))

    registry.register_spec(LinkTypeSpec(
        template_kind="itemTemplate",
        runtime_kind="item",
        template_model=ItemTemplate,
        runtime_model=GameItem,
        template_label="ItemTemplate",
        runtime_label="GameItem",
        mapping_factory=get_item_template_mapping,
    ))
