"""Block Template Service — CRUD and roll operations

Provides database operations for block templates including:
- Create, read, update, delete, search
- Roll: randomly select blocks matching each slot's constraints
- Preview: count/sample matching blocks for a slot definition
"""
import random
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain.prompt import PromptBlock, BlockTemplate
from pixsim7.backend.main.services.prompt.block.composition_engine import (
    derive_analysis_from_blocks,
)
from pixsim7.backend.main.services.prompt.block.block_query import (
    build_prompt_block_query,
)
from pixsim7.backend.main.services.prompt.block.character_expander import (
    CharacterBindingExpander,
)
from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    normalize_template_slot,
    normalize_template_slots,
)


class BlockTemplateService:
    """Service for managing block templates and rolling prompts from them."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── CRUD ──────────────────────────────────────────────────────────────

    async def create_template(
        self,
        data: Dict[str, Any],
        created_by: Optional[str] = None,
    ) -> BlockTemplate:
        if "slots" in data:
            data["slots"] = normalize_template_slots(data.get("slots"))
        metadata = data.get("template_metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        metadata["slot_schema_version"] = TEMPLATE_SLOT_SCHEMA_VERSION
        data["template_metadata"] = metadata
        now = datetime.now(timezone.utc)
        data["created_by"] = created_by
        data["created_at"] = now
        data["updated_at"] = now
        template = BlockTemplate(**data)
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def get_template(self, template_id: UUID) -> Optional[BlockTemplate]:
        result = await self.db.execute(
            select(BlockTemplate).where(BlockTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def get_template_by_slug(self, slug: str) -> Optional[BlockTemplate]:
        result = await self.db.execute(
            select(BlockTemplate).where(BlockTemplate.slug == slug)
        )
        return result.scalar_one_or_none()

    async def update_template(
        self,
        template_id: UUID,
        updates: Dict[str, Any],
    ) -> Optional[BlockTemplate]:
        template = await self.get_template(template_id)
        if not template:
            return None

        if "slots" in updates:
            updates["slots"] = normalize_template_slots(updates.get("slots"))
            metadata = dict(template.template_metadata or {})
            incoming_metadata = updates.get("template_metadata")
            if isinstance(incoming_metadata, dict):
                metadata.update(incoming_metadata)
            metadata["slot_schema_version"] = TEMPLATE_SLOT_SCHEMA_VERSION
            updates["template_metadata"] = metadata

        for key, value in updates.items():
            if hasattr(template, key):
                setattr(template, key, value)

        template.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(template)
        return template

    async def delete_template(self, template_id: UUID) -> bool:
        template = await self.get_template(template_id)
        if not template:
            return False
        await self.db.delete(template)
        await self.db.commit()
        return True

    async def search_templates(
        self,
        *,
        package_name: Optional[str] = None,
        is_public: Optional[bool] = None,
        tag: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[BlockTemplate]:
        query = select(BlockTemplate)

        if package_name is not None:
            query = query.where(BlockTemplate.package_name == package_name)
        if is_public is not None:
            query = query.where(BlockTemplate.is_public == is_public)
        if tag is not None:
            # PostgreSQL JSON array contains
            query = query.where(
                BlockTemplate.tags.contains([tag])
            )

        query = query.order_by(BlockTemplate.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ── Slot query builder ────────────────────────────────────────────────

    def _build_slot_query(self, slot: Dict[str, Any]):
        """Build a SQLAlchemy select for PromptBlocks matching slot constraints."""
        slot = normalize_template_slot(slot)
        return build_prompt_block_query(
            role=slot.get("role"),
            category=slot.get("category"),
            kind=slot.get("kind"),
            intent=slot.get("intent"),
            package_name=slot.get("package_name"),
            complexity_min=slot.get("complexity_min"),
            complexity_max=slot.get("complexity_max"),
            min_rating=slot.get("min_rating"),
            tag_constraints=slot.get("tag_constraints"),
            exclude_block_ids=slot.get("exclude_block_ids"),
            is_public=True,
        )

    # ── Metadata ──────────────────────────────────────────────────────────

    async def list_package_names(self) -> List[str]:
        """Return distinct non-null package names from prompt blocks."""
        result = await self.db.execute(
            select(PromptBlock.package_name)
            .where(PromptBlock.package_name.isnot(None))
            .distinct()
            .order_by(PromptBlock.package_name)
        )
        return [r for (r,) in result.all()]

    # ── Block resolution ─────────────────────────────────────────────────
    # All block lookups go through find_candidates / count_candidates.
    # These are the seam: swap the body for vector search later
    # without touching roll_template, preview, or count logic.

    async def find_candidates(
        self,
        slot: Dict[str, Any],
        *,
        limit: Optional[int] = None,
    ) -> List[PromptBlock]:
        """Find prompt blocks matching a slot's constraints.

        Override this method to swap SQL for vector / hybrid retrieval.
        """
        query = self._build_slot_query(slot)
        if limit is not None:
            query = query.limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_candidates(self, slot: Dict[str, Any]) -> int:
        """Count prompt blocks matching a slot's constraints.

        Override this method alongside find_candidates for alternate backends.
        """
        base = self._build_slot_query(slot).subquery()
        result = await self.db.execute(select(func.count()).select_from(base))
        return result.scalar() or 0

    # ── Preview ───────────────────────────────────────────────────────────

    async def count_matching_blocks(self, slot: Dict[str, Any]) -> int:
        return await self.count_candidates(slot)

    async def preview_slot_matches(
        self,
        slot: Dict[str, Any],
        limit: int = 5,
    ) -> Dict[str, Any]:
        count = await self.count_candidates(slot)
        samples = await self.find_candidates(slot, limit=limit)

        return {
            "count": count,
            "samples": [
                {
                    "id": str(b.id),
                    "block_id": b.block_id,
                    "role": b.role,
                    "category": b.category,
                    "prompt_preview": b.text[:120] if b.text else "",
                    "avg_rating": b.avg_rating,
                }
                for b in samples
            ],
        }

    # ── Roll ──────────────────────────────────────────────────────────────

    async def roll_template(
        self,
        template_id: UUID,
        *,
        seed: Optional[int] = None,
        exclude_block_ids: Optional[List[UUID]] = None,
        character_bindings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Roll a template: select random blocks per slot and compose a prompt."""
        template = await self.get_template(template_id)
        if not template:
            return {"success": False, "error": "Template not found"}

        rng = random.Random(seed)
        try:
            slots = normalize_template_slots(template.slots)
        except ValueError as exc:
            return {
                "success": False,
                "error": f"Template has invalid slot schema: {exc}",
            }
        global_excludes = set(exclude_block_ids or [])

        selected_blocks: List[PromptBlock] = []
        slot_results: List[Dict[str, Any]] = []
        warnings: List[str] = []

        for slot in slots:
            label = slot.get("label", f"Slot {slot.get('slot_index', '?')}")

            # Reinforcement / audio cue slots — inject literal text, skip DB query
            if slot.get("kind") in ("reinforcement", "audio_cue"):
                slot_results.append({
                    "label": label,
                    "status": "reinforcement",
                    "reinforcement_text": slot.get("reinforcement_text") or "",
                    "intensity": slot.get("intensity"),
                    "inherit_intensity": slot.get("inherit_intensity", False),
                    "match_count": 0,
                })
                continue

            # Merge global excludes into slot excludes
            slot_exc = list(set(slot.get("exclude_block_ids") or []) | global_excludes)
            slot_with_exc = {**slot, "exclude_block_ids": slot_exc if slot_exc else None}

            candidates = await self.find_candidates(slot_with_exc)

            strategy = slot.get("selection_strategy", "uniform")

            if not candidates:
                # Fallback handling
                if slot.get("optional"):
                    slot_results.append({
                        "label": label,
                        "status": "skipped",
                        "reason": "optional, no matches",
                        "match_count": 0,
                    })
                    continue
                elif slot.get("fallback_text"):
                    # Create a synthetic block-like entry
                    warnings.append(f"Slot '{label}': no matching blocks, using fallback text")
                    slot_results.append({
                        "label": label,
                        "status": "fallback",
                        "fallback_text": slot["fallback_text"],
                        "match_count": 0,
                    })
                    continue
                else:
                    warnings.append(f"Slot '{label}': no matching blocks found")
                    slot_results.append({
                        "label": label,
                        "status": "empty",
                        "reason": "no matches, not optional, no fallback",
                        "match_count": 0,
                    })
                    continue

            # Selection
            if strategy == "weighted_rating" and any(c.avg_rating for c in candidates):
                weights = [max(c.avg_rating or 1.0, 0.1) for c in candidates]
                chosen = rng.choices(candidates, weights=weights, k=1)[0]
            else:
                chosen = rng.choice(candidates)

            selected_blocks.append(chosen)
            slot_results.append({
                "label": label,
                "status": "selected",
                "match_count": len(candidates),
                "selected_block_id": str(chosen.id),
                "selected_block_string_id": chosen.block_id,
                "selected_block_role": chosen.role,
                "selected_block_category": chosen.category,
                "prompt_preview": chosen.text[:120] if chosen.text else "",
            })

        # ── Slot-order-aware composition ──────────────────────────────────
        # Walk slot_results in order, pulling block text from selected_blocks
        # (consumed sequentially) and interleaving reinforcement/fallback text.
        # Reinforcement text is expanded per-slot with its own intensity value,
        # then the final pass expands block text (no intensity).
        requested_strategy = (template.composition_strategy or "sequential").lower()
        strategy = requested_strategy
        composition_strategy_applied = True
        if strategy not in {"sequential", "layered", "merged"}:
            warnings.append(
                f"Unknown composition strategy '{requested_strategy}', falling back to sequential"
            )
            strategy = "sequential"
            composition_strategy_applied = False

        has_mixed_slot_statuses = any(sr["status"] != "selected" for sr in slot_results)
        if strategy != "sequential" and has_mixed_slot_statuses:
            warnings.append(
                f"Composition strategy '{strategy}' requires all slots selected; "
                "using slot-order composition due to fallback/reinforcement/empty slots"
            )
            composition_strategy_applied = False

        assembled_prompt = ""
        derived_analysis = None

        # Respect explicit roll-time override, including {} to disable template defaults.
        if character_bindings is not None:
            effective_bindings = character_bindings
        else:
            effective_bindings = template.character_bindings or {}
        characters_resolved: Dict[str, str] = {}

        # Prepare expander once (caches character lookups across calls)
        expander = None
        if effective_bindings:
            from pixsim7.backend.main.services.characters.character import CharacterService
            char_service = CharacterService(self.db)
            expander = CharacterBindingExpander(char_service.get_character_by_id)

        if strategy == "sequential" or not composition_strategy_applied:
            block_iter = iter(selected_blocks)
            prompt_parts: List[str] = []
            last_block: Optional[PromptBlock] = None

            for sr in slot_results:
                if sr["status"] == "selected":
                    block = next(block_iter, None)
                    if block and block.text:
                        prompt_parts.append(block.text)
                        last_block = block
                elif sr["status"] == "fallback":
                    prompt_parts.append(sr["fallback_text"])
                elif sr["status"] == "reinforcement":
                    text = sr["reinforcement_text"]
                    if expander and text:
                        # Resolve intensity for this cue
                        slot_intensity = sr.get("intensity")  # explicit 1-10 or None
                        if sr.get("inherit_intensity") and last_block:
                            # Read intensity from previous block's tags
                            block_tags = last_block.tags if isinstance(last_block.tags, dict) else {}
                            inherited = block_tags.get("intensity")
                            if inherited is not None:
                                try:
                                    slot_intensity = int(inherited)
                                except (TypeError, ValueError):
                                    warnings.append(
                                        f"Slot '{sr.get('label', 'reinforcement')}': "
                                        f"invalid inherited intensity '{inherited}', using default intensity"
                                    )

                        expansion = await expander.expand(text, effective_bindings, rng, intensity=slot_intensity)
                        text = expansion["expanded_text"]
                        characters_resolved.update(expansion["characters_resolved"])
                        for err in expansion.get("expansion_errors", []):
                            warnings.append(f"Character expansion (reinforcement): {err}")
                    prompt_parts.append(text)
                # skipped / empty contribute nothing

            if prompt_parts:
                assembled_prompt = _join_blocks(prompt_parts)
        elif strategy == "layered":
            assembled_prompt = _compose_layered(selected_blocks)
        else:
            assembled_prompt = _compose_merged(selected_blocks)

        if selected_blocks:
            analysis_blocks = selected_blocks
            if strategy == "layered" and composition_strategy_applied:
                analysis_blocks = _order_layered_blocks(selected_blocks)
            derived_analysis = derive_analysis_from_blocks(analysis_blocks, assembled_prompt)

        # Final character binding expansion for block text (no intensity)
        if expander and assembled_prompt:
            expansion = await expander.expand(assembled_prompt, effective_bindings, rng)
            assembled_prompt = expansion["expanded_text"]
            characters_resolved.update(expansion["characters_resolved"])
            for err in expansion.get("expansion_errors", []):
                warnings.append(f"Character expansion: {err}")

        # Increment roll count
        template.roll_count = (template.roll_count or 0) + 1
        await self.db.commit()

        return {
            "success": True,
            "assembled_prompt": assembled_prompt,
            "derived_analysis": derived_analysis,
            "slot_results": slot_results,
            "warnings": warnings,
            "metadata": {
                "template_id": str(template.id),
                "template_name": template.name,
                "slots_total": len(slots),
                "slots_filled": sum(1 for sr in slot_results if sr["status"] == "selected"),
                "slots_skipped": sum(1 for sr in slot_results if sr["status"] == "skipped"),
                "slots_fallback": sum(1 for sr in slot_results if sr["status"] == "fallback"),
                "slots_reinforcement": sum(1 for sr in slot_results if sr["status"] == "reinforcement"),
                "composition_strategy": template.composition_strategy,
                "composition_strategy_applied": composition_strategy_applied,
                "seed": seed,
                "roll_count": template.roll_count,
                "character_bindings": effective_bindings if effective_bindings else None,
                "characters_resolved": characters_resolved if characters_resolved else None,
            },
        }


# ── Composition helpers (stateless) ──────────────────────────────────────

_SENTENCE_ENDINGS = frozenset(".!?")


def _ensure_period(text: str) -> str:
    """Ensure text ends with sentence-ending punctuation."""
    stripped = text.rstrip()
    if not stripped:
        return stripped
    if stripped[-1] not in _SENTENCE_ENDINGS:
        return stripped + "."
    return stripped


def _join_blocks(parts: List[str]) -> str:
    """Join block parts with newlines, ensuring each ends with a period."""
    cleaned = [_ensure_period(p.strip()) for p in parts if p.strip()]
    return "\n".join(cleaned)


def _compose_sequential(blocks: List[PromptBlock]) -> str:
    if not blocks:
        return ""
    return _join_blocks([block.text for block in blocks if block.text])


def _compose_layered(blocks: List[PromptBlock]) -> str:
    """Layer blocks by inferred role category."""
    return _join_blocks([block.text for block in _order_layered_blocks(blocks) if block.text])


def _order_layered_blocks(blocks: List[PromptBlock]) -> List[PromptBlock]:
    """Return blocks ordered by role categories for layered composition."""
    categories: Dict[str, List[PromptBlock]] = {
        "character": [], "setting": [], "camera": [],
        "action": [], "mood": [], "other": [],
    }

    for block in blocks:
        role = block.role or "other"
        if role in categories:
            categories[role].append(block)
        else:
            categories["other"].append(block)

    order = ["setting", "character", "action", "camera", "mood", "other"]
    ordered_blocks: List[PromptBlock] = []
    for cat in order:
        ordered_blocks.extend(categories.get(cat, []))

    return ordered_blocks


def _compose_merged(blocks: List[PromptBlock]) -> str:
    """Placeholder merged strategy; currently mirrors sequential composition."""
    return _compose_sequential(blocks)
