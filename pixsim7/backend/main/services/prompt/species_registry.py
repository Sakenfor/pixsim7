"""
Species Registry — DB-backed vocabulary of species definitions.

Architecture follows AuthoringModeRegistry pattern:
- In-memory SimpleRegistry for fast reads (seeded from YAML builtins)
- DB table `species` in pixsim7_blocks DB for persistence
- On startup, sync_from_db() merges DB rows over YAML defaults
- Writes (create/update) go to both DB and in-memory registry
- SpeciesDef (dataclass with computed modifiers) is the in-memory type
- SpeciesRecord (SQLModel) is the DB type
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.shared.ontology.vocabularies.factories import make_species
from pixsim7.backend.main.shared.ontology.vocabularies.types import SpeciesDef

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Conversion helpers (SpeciesDef <-> SpeciesRecord)
# ---------------------------------------------------------------------------


def _species_to_db_dict(species: SpeciesDef) -> Dict[str, Any]:
    """Convert a SpeciesDef dataclass to a dict for DB row creation."""
    # Reverse-engineer word_lists from modifiers: we need the raw lists,
    # not the hydrated Modifier objects.  Species loaded from YAML have
    # the raw data available on the SpeciesDef fields directly.
    # For modifiers that came from word_lists, we extract the raw values.
    from pixsim7.backend.main.shared.ontology.vocabularies.modifiers import (
        GradedList,
        FixedValue,
        PronounSet,
    )

    # Collect word_list keys: anything in modifiers that isn't an anatomy_map
    # key, movement, stance, or pronoun.
    non_word_list_keys = set(species.anatomy_map.keys()) | {"movement", "stance", "pronoun"}
    word_lists: Dict[str, Any] = {}
    for key, mod in species.modifiers.items():
        if key in non_word_list_keys:
            continue
        if isinstance(mod, GradedList):
            word_lists[key] = mod.values
        elif isinstance(mod, FixedValue):
            word_lists[key] = mod.value
        elif isinstance(mod, PronounSet):
            word_lists[key] = mod.forms

    return {
        "id": species.id,
        "label": species.label,
        "category": species.category,
        "anatomy_map": species.anatomy_map,
        "movement_verbs": species.movement_verbs,
        "pronoun_set": species.pronoun_set,
        "default_stance": species.default_stance,
        "keywords": species.keywords,
        "visual_priority": species.visual_priority,
        "render_template": species.render_template,
        "word_lists": word_lists,
        "modifier_roles": species.modifier_roles,
        "is_builtin": species.source in ("core", "plugin"),
        "source": species.source,
    }


def _db_row_to_species_data(row) -> Dict[str, Any]:
    """Convert a SpeciesRecord DB row to a dict suitable for make_species()."""
    return {
        "label": row.label,
        "category": row.category,
        "anatomy_map": row.anatomy_map or {},
        "movement_verbs": row.movement_verbs or [],
        "pronoun_set": row.pronoun_set or {},
        "default_stance": row.default_stance or "standing",
        "keywords": row.keywords or [],
        "visual_priority": row.visual_priority or [],
        "render_template": row.render_template or "",
        "word_lists": row.word_lists or {},
        "modifier_roles": row.modifier_roles or {},
    }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class SpeciesRegistry(SimpleRegistry[str, SpeciesDef]):
    """Registry for species vocabulary — in-memory + blocks DB persistence."""

    def __init__(self) -> None:
        super().__init__(
            name="SpeciesRegistry",
            allow_overwrite=True,
            seed_on_init=False,  # Seeded via sync_from_db at startup
            plugin_aware=True,
        )
        # Stash YAML-loaded builtins for seeding to DB
        self._yaml_builtins: Dict[str, SpeciesDef] = {}

    def _get_item_key(self, item: SpeciesDef) -> str:
        return item.id

    def list_all(self) -> List[SpeciesDef]:
        return list(self._items.values())

    def seed_from_yaml(self, species_list: List[SpeciesDef]) -> None:
        """Register YAML-loaded species as builtins (pre-DB sync)."""
        for species in species_list:
            self._yaml_builtins[species.id] = species
            self.register_item(species)
        logger.info("Seeded species from YAML", count=len(species_list))

    # -- DB sync --

    async def sync_from_db(self, db: AsyncSession) -> None:
        """Load species from blocks DB, merging over YAML defaults.

        Called at app startup. DB rows override YAML builtins (allows
        editing via API). Missing builtins are seeded to DB.
        """
        from pixsim7.backend.main.domain.blocks.species_model import SpeciesRecord

        result = await db.execute(select(SpeciesRecord))
        db_rows = {row.id: row for row in result.scalars().all()}

        # Seed missing YAML builtins to DB
        for builtin_id, builtin in self._yaml_builtins.items():
            if builtin_id not in db_rows:
                data = _species_to_db_dict(builtin)
                data["is_builtin"] = True
                now = utcnow()
                data["created_at"] = now
                data["updated_at"] = now
                record = SpeciesRecord(**data)
                db.add(record)
                db_rows[builtin_id] = record

        await db.commit()

        # Merge DB rows into in-memory registry (DB wins over YAML)
        for row in db_rows.values():
            data = _db_row_to_species_data(row)
            source = row.source if row.source else ("core" if row.is_builtin else "db")
            species = make_species(row.id, data, source)
            self.register(species.id, species)

        logger.info(
            "Synced species from blocks DB",
            total=len(self._items),
            from_db=len(db_rows),
        )

    async def persist_species(self, db: AsyncSession, species: SpeciesDef) -> None:
        """Write a species to both in-memory registry and blocks DB."""
        from pixsim7.backend.main.domain.blocks.species_model import SpeciesRecord

        # Update in-memory
        self.register(species.id, species)

        # Upsert to DB
        existing = await db.get(SpeciesRecord, species.id)
        data = _species_to_db_dict(species)
        now = utcnow()
        data["updated_at"] = now

        if existing:
            for key, value in data.items():
                if key not in ("id", "created_at"):
                    setattr(existing, key, value)
        else:
            data["created_at"] = now
            record = SpeciesRecord(**data)
            db.add(record)

        await db.commit()

    async def persist_mode(self, db: AsyncSession, species: SpeciesDef) -> None:
        """CRUD router compatibility alias.

        The generic mount_registry_crud() calls persist_mode(db, item).
        Species lives in the blocks DB, so we open our own session
        and ignore the passed main-DB session.
        """
        from pixsim7.backend.main.infrastructure.database.session import (
            get_async_blocks_session,
        )

        async with get_async_blocks_session() as blocks_db:
            await self.persist_species(blocks_db, species)


# Singleton instance
species_registry = SpeciesRegistry()
