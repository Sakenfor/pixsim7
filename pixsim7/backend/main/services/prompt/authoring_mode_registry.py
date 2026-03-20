"""
Authoring Mode Registry.

Single source of truth for prompt authoring modes (categories).
Each mode defines its generation hints, recommended tags, and constraints.

Architecture:
- In-memory registry for fast reads (seeded from code builtins on init)
- DB table `authoring_modes` for persistence of runtime additions/edits
- On startup, `sync_from_db()` merges DB rows over code defaults
- Writes (create/update) go to both DB and in-memory registry

The meta contract endpoint reads from this registry — no inline definitions.
The frontend fetches modes from the contract and uses them for dropdowns.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Dataclasses (used in-memory and for conversion)
# ---------------------------------------------------------------------------


@dataclass
class GenerationHint:
    operation: str
    priority: int
    requires_input_asset: bool = False
    auto_bind: Optional[str] = None
    suggested_params: Optional[Dict[str, Any]] = None
    note: Optional[str] = None


@dataclass
class AuthoringMode:
    """A prompt authoring mode / category."""

    id: str
    label: str
    description: str
    sequence_role: Optional[str] = None
    generation_hints: List[GenerationHint] = field(default_factory=list)
    recommended_tags: List[str] = field(default_factory=list)
    required_fields: List[str] = field(default_factory=lambda: ["prompt_text"])
    is_builtin: bool = False
    source_plugin_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Built-in mode definitions (code defaults, seeded to DB on first run)
# ---------------------------------------------------------------------------

_BUILTIN_MODES: List[AuthoringMode] = [
    AuthoringMode(
        id="scene_setup",
        label="Scene Setup",
        description="Long-form initial scene prompt with style, setting, and cast setup.",
        sequence_role="initial",
        generation_hints=[
            GenerationHint(operation="text_to_image", priority=1, suggested_params={"aspect_ratio": "16:9"}),
            GenerationHint(operation="text_to_video", priority=2),
        ],
        recommended_tags=["sequence:initial", "intent:setup", "mode:scene_setup"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="scene_continuation",
        label="Scene Continuation",
        description="Short-to-medium continuation prompt that advances from previous context.",
        sequence_role="continuation",
        generation_hints=[
            GenerationHint(operation="image_to_video", priority=1, requires_input_asset=True, auto_bind="parent_output", suggested_params={"duration": 5}),
            GenerationHint(operation="image_to_image", priority=2, requires_input_asset=True, auto_bind="parent_output"),
            GenerationHint(operation="text_to_image", priority=3),
        ],
        recommended_tags=["sequence:continuation", "intent:advance", "mode:continuation"],
        required_fields=["prompt_text", "parent_version_id"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="tool_edit",
        label="Tool Edit",
        description="Prompt intended for mask/tool-style edits (replace/modify specific regions).",
        generation_hints=[
            GenerationHint(operation="image_to_image", priority=1, requires_input_asset=True, auto_bind="viewer_asset"),
        ],
        recommended_tags=["intent:modify", "mode:tool_edit", "scope:region_or_mask"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="patch_edit",
        label="Patch Edit",
        description="Targeted edit to an existing generation — change specific elements while preserving the rest.",
        generation_hints=[
            GenerationHint(operation="image_to_image", priority=1, requires_input_asset=True, auto_bind="parent_output"),
        ],
        recommended_tags=["intent:modify", "mode:patch_edit", "scope:targeted"],
        required_fields=["prompt_text", "parent_version_id"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="variation",
        label="Variation",
        description="Generate a variation of an existing output — same general concept with bounded divergence.",
        generation_hints=[
            GenerationHint(operation="image_to_image", priority=1, requires_input_asset=True, auto_bind="parent_output"),
            GenerationHint(operation="text_to_image", priority=2),
        ],
        recommended_tags=["intent:generate", "mode:variation", "scope:bounded"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="character_design",
        label="Character Design",
        description="Detailed character or creature concept — anatomical description, distinctive features, materials, and personality cues.",
        sequence_role="initial",
        generation_hints=[
            GenerationHint(operation="text_to_image", priority=1, suggested_params={"aspect_ratio": "9:16"}),
            GenerationHint(operation="image_to_image", priority=2, requires_input_asset=True, auto_bind="viewer_asset", note="Refine from a rough sketch or reference."),
        ],
        recommended_tags=["intent:setup", "mode:character_design", "scope:entity"],
        is_builtin=True,
    ),
    AuthoringMode(
        id="outfit_design",
        label="Outfit Design",
        description="Clothing, accessories, and styling concept — fabric, fit, silhouette, layering, and material details.",
        sequence_role="initial",
        generation_hints=[
            GenerationHint(operation="text_to_image", priority=1, suggested_params={"aspect_ratio": "9:16"}),
            GenerationHint(operation="image_to_image", priority=2, requires_input_asset=True, auto_bind="viewer_asset", note="Apply outfit to a character reference image."),
        ],
        recommended_tags=["intent:setup", "mode:outfit_design", "scope:entity"],
        is_builtin=True,
    ),
]


# ---------------------------------------------------------------------------
# Conversion helpers (DB model <-> dataclass)
# ---------------------------------------------------------------------------


def _hint_to_dict(h: GenerationHint) -> Dict[str, Any]:
    d: Dict[str, Any] = {"operation": h.operation, "priority": h.priority}
    if h.requires_input_asset:
        d["requires_input_asset"] = True
    if h.auto_bind:
        d["auto_bind"] = h.auto_bind
    if h.suggested_params:
        d["suggested_params"] = h.suggested_params
    if h.note:
        d["note"] = h.note
    return d


def _dict_to_hint(d: Dict[str, Any]) -> GenerationHint:
    return GenerationHint(
        operation=d["operation"],
        priority=d.get("priority", 99),
        requires_input_asset=d.get("requires_input_asset", False),
        auto_bind=d.get("auto_bind"),
        suggested_params=d.get("suggested_params"),
        note=d.get("note"),
    )


def _mode_to_db_dict(mode: AuthoringMode) -> Dict[str, Any]:
    """Convert dataclass to dict suitable for DB row creation."""
    return {
        "id": mode.id,
        "label": mode.label,
        "description": mode.description,
        "sequence_role": mode.sequence_role,
        "generation_hints": [_hint_to_dict(h) for h in mode.generation_hints],
        "recommended_tags": mode.recommended_tags,
        "required_fields": mode.required_fields,
        "is_builtin": mode.is_builtin,
    }


def _db_row_to_mode(row) -> AuthoringMode:
    """Convert a DB row (AuthoringMode SQLModel) to the dataclass."""
    return AuthoringMode(
        id=row.id,
        label=row.label,
        description=row.description,
        sequence_role=row.sequence_role,
        generation_hints=[_dict_to_hint(h) for h in (row.generation_hints or [])],
        recommended_tags=row.recommended_tags or [],
        required_fields=row.required_fields or ["prompt_text"],
        is_builtin=row.is_builtin,
    )


# ---------------------------------------------------------------------------
# Registry (in-memory cache, synced with DB)
# ---------------------------------------------------------------------------


class AuthoringModeRegistry(SimpleRegistry[str, AuthoringMode]):
    """Registry for prompt authoring modes — in-memory + DB persistence."""

    def __init__(self) -> None:
        super().__init__(
            name="AuthoringModeRegistry",
            allow_overwrite=True,
            seed_on_init=True,
            plugin_aware=True,
        )

    def _get_item_key(self, item: AuthoringMode) -> str:
        return item.id

    def _seed_defaults(self) -> None:
        for mode in _BUILTIN_MODES:
            self.register_item(mode)

    def list_all(self) -> List[AuthoringMode]:
        return list(self._items.values())

    def get_category_ids(self) -> List[str]:
        return [m.id for m in self._items.values()]

    # -- DB sync --

    async def sync_from_db(self, db: AsyncSession) -> None:
        """Load modes from DB, merging over code defaults.

        Called at app startup. DB rows override code builtins (allows
        editing builtin modes via API). Missing builtins are seeded to DB.
        """
        from pixsim7.backend.main.domain.prompt.authoring_mode import (
            AuthoringMode as AuthoringModeModel,
        )

        result = await db.execute(select(AuthoringModeModel))
        db_rows = {row.id: row for row in result.scalars().all()}

        # Seed missing builtins to DB
        for builtin in _BUILTIN_MODES:
            if builtin.id not in db_rows:
                db_model = AuthoringModeModel(**_mode_to_db_dict(builtin))
                db.add(db_model)
                db_rows[builtin.id] = db_model

        await db.commit()

        # Merge DB rows into in-memory registry (DB wins over code defaults)
        for row in db_rows.values():
            mode = _db_row_to_mode(row)
            self.register(mode.id, mode)

        logger.info(
            "Synced authoring modes from DB",
            total=len(self._items),
            from_db=len(db_rows),
        )

    async def persist_mode(self, db: AsyncSession, mode: AuthoringMode) -> None:
        """Write a mode to both in-memory registry and DB."""
        from pixsim7.backend.main.domain.prompt.authoring_mode import (
            AuthoringMode as AuthoringModeModel,
        )

        # Update in-memory
        self.register(mode.id, mode)

        # Upsert to DB
        existing = await db.get(AuthoringModeModel, mode.id)
        data = _mode_to_db_dict(mode)
        if existing:
            for key, value in data.items():
                if key != "id":
                    setattr(existing, key, value)
        else:
            db_model = AuthoringModeModel(**data)
            db.add(db_model)

        await db.commit()


# Singleton instance
authoring_mode_registry = AuthoringModeRegistry()
