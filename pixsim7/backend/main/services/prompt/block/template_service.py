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
from sqlalchemy import select, func, and_, cast, String

from pixsim7.backend.main.domain.prompt import PromptBlock, BlockTemplate
from pixsim7.backend.main.services.prompt.block.composition_engine import (
    derive_analysis_from_blocks,
)
from pixsim7.backend.main.services.prompt.block.character_expander import (
    CharacterBindingExpander,
)


# Complexity levels ordered for range filtering
_COMPLEXITY_ORDER = ["simple", "moderate", "complex", "very_complex"]


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
        query = select(PromptBlock)

        if slot.get("role"):
            query = query.where(PromptBlock.role == slot["role"])
        if slot.get("category"):
            query = query.where(PromptBlock.category == slot["category"])
        if slot.get("kind"):
            query = query.where(PromptBlock.kind == slot["kind"])
        if slot.get("intent"):
            query = query.where(PromptBlock.default_intent == slot["intent"])
        if slot.get("package_name"):
            query = query.where(PromptBlock.package_name == slot["package_name"])

        # Complexity range
        complexity_min = slot.get("complexity_min")
        complexity_max = slot.get("complexity_max")
        if complexity_min or complexity_max:
            min_idx = _COMPLEXITY_ORDER.index(complexity_min) if complexity_min and complexity_min in _COMPLEXITY_ORDER else 0
            max_idx = _COMPLEXITY_ORDER.index(complexity_max) if complexity_max and complexity_max in _COMPLEXITY_ORDER else len(_COMPLEXITY_ORDER) - 1
            allowed = _COMPLEXITY_ORDER[min_idx:max_idx + 1]
            query = query.where(PromptBlock.complexity_level.in_(allowed))

        # Minimum rating
        if slot.get("min_rating") is not None:
            query = query.where(PromptBlock.avg_rating >= slot["min_rating"])

        # Tag constraints (JSON key-value matching)
        tag_constraints = slot.get("tag_constraints")
        if tag_constraints and isinstance(tag_constraints, dict):
            for tag_key, tag_value in tag_constraints.items():
                # Use ->> via jsonb_extract_path_text for plain-text comparison
                query = query.where(
                    func.jsonb_extract_path_text(PromptBlock.tags, tag_key) == str(tag_value)
                )

        # Exclude specific block IDs
        exclude_ids = slot.get("exclude_block_ids")
        if exclude_ids:
            query = query.where(PromptBlock.id.notin_(exclude_ids))

        # Only curated, public blocks by default
        query = query.where(PromptBlock.is_public == True)

        return query

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

    # ── Preview ───────────────────────────────────────────────────────────

    async def count_matching_blocks(self, slot: Dict[str, Any]) -> int:
        base = self._build_slot_query(slot).subquery()
        result = await self.db.execute(select(func.count()).select_from(base))
        return result.scalar() or 0

    async def preview_slot_matches(
        self,
        slot: Dict[str, Any],
        limit: int = 5,
    ) -> Dict[str, Any]:
        count = await self.count_matching_blocks(slot)

        sample_query = self._build_slot_query(slot).limit(limit)
        result = await self.db.execute(sample_query)
        samples = result.scalars().all()

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
        slots = sorted(template.slots, key=lambda s: s.get("slot_index", 0))
        global_excludes = set(exclude_block_ids or [])

        selected_blocks: List[PromptBlock] = []
        slot_results: List[Dict[str, Any]] = []
        warnings: List[str] = []

        for slot in slots:
            # Merge global excludes into slot excludes
            slot_exc = list(set(slot.get("exclude_block_ids") or []) | global_excludes)
            slot_with_exc = {**slot, "exclude_block_ids": slot_exc if slot_exc else None}

            query = self._build_slot_query(slot_with_exc)
            result = await self.db.execute(query)
            candidates = list(result.scalars().all())

            label = slot.get("label", f"Slot {slot.get('slot_index', '?')}")
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

        # Compose selected blocks
        assembled_prompt = ""
        derived_analysis = None

        if selected_blocks:
            strategy = template.composition_strategy or "sequential"
            if strategy == "sequential":
                assembled_prompt = _compose_sequential(selected_blocks)
            elif strategy == "layered":
                assembled_prompt = _compose_layered(selected_blocks)
            elif strategy == "merged":
                assembled_prompt = _compose_sequential(selected_blocks)
            else:
                assembled_prompt = _compose_sequential(selected_blocks)

            # Also add fallback texts in order
            fallback_parts = []
            block_idx = 0
            for sr in slot_results:
                if sr["status"] == "selected":
                    block_idx += 1
                elif sr["status"] == "fallback":
                    fallback_parts.append(sr["fallback_text"])

            if fallback_parts:
                assembled_prompt = assembled_prompt + " " + " ".join(fallback_parts)
                assembled_prompt = assembled_prompt.strip()

            derived_analysis = derive_analysis_from_blocks(selected_blocks, assembled_prompt)

        # Character binding expansion
        effective_bindings = character_bindings or (template.character_bindings if template.character_bindings else None) or {}
        characters_resolved: Dict[str, str] = {}
        if effective_bindings and assembled_prompt:
            from pixsim7.backend.main.services.characters.character import CharacterService
            char_service = CharacterService(self.db)
            expander = CharacterBindingExpander(char_service.get_character_by_id)
            expansion = await expander.expand(assembled_prompt, effective_bindings, rng)
            assembled_prompt = expansion["expanded_text"]
            characters_resolved = expansion["characters_resolved"]
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
                "composition_strategy": template.composition_strategy,
                "seed": seed,
                "roll_count": template.roll_count,
                "character_bindings": effective_bindings if effective_bindings else None,
                "characters_resolved": characters_resolved if characters_resolved else None,
            },
        }


# ── Composition helpers (stateless) ──────────────────────────────────────

def _compose_sequential(blocks: List[PromptBlock]) -> str:
    if not blocks:
        return ""
    parts = []
    for block in blocks:
        parts.append(block.text)
    return " ".join(parts).strip()


def _compose_layered(blocks: List[PromptBlock]) -> str:
    """Layer blocks by inferred role category."""
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
    parts = []
    for cat in order:
        for block in categories.get(cat, []):
            parts.append(block.text)

    return " ".join(parts).strip()
