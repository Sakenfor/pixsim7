"""Block Template Service - CRUD and roll operations

Provides database operations for block templates including:
- Create, read, update, delete, search
- Roll: randomly select blocks matching each slot's constraints
- Preview: count/sample matching blocks for a slot definition
"""
import random
import math
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain.prompt import BlockTemplate
from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.services.prompt.block.compiler_core import (
    build_default_compiler_registry,
    slot_target_key,
)
from pixsim7.backend.main.services.prompt.block.composition_engine import (
    derive_analysis_from_blocks,
)
from pixsim7.backend.main.services.prompt.block.block_query import (
    normalize_tag_query,
)
from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.character_expander import (
    CharacterBindingExpander,
)
from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    normalize_template_slot,
    normalize_template_slots,
)
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.resolution_core import (
    build_default_resolver_registry,
)
from pixsim7.backend.main.services.prompt.block.resolution_core.types import (
    CandidateBlock as ResolverCandidateBlock,
    PairwiseBonus as ResolverPairwiseBonus,
    ResolutionRequest as ResolverResolutionRequest,
    ResolutionResult as ResolverResolutionResult,
)


_ROLL_COMPILER_ID = "compiler_v1"
_ROLL_RESOLVER_ID = "next_v1"
_ROLL_CANDIDATE_LIMIT = 10000
_compiler_registry = build_default_compiler_registry()
_resolver_registry = build_default_resolver_registry()


class BlockTemplateService:
    """Service for managing block templates and rolling prompts from them."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _get_slot_schema_version(template: BlockTemplate) -> Optional[int]:
        metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
        version = metadata.get("slot_schema_version")
        if version is None:
            return None
        try:
            return int(version)
        except (TypeError, ValueError):
            return None

    # -- CRUD -----------------------------------------------------------------

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

    # -- Metadata --------------------------------------------------------------

    async def list_package_names(self) -> List[str]:
        """Return distinct primitive source packs from the blocks DB."""
        source_pack = func.nullif(func.jsonb_extract_path_text(BlockPrimitive.tags, "source_pack"), "")
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(
                select(source_pack)
                .where(source_pack.isnot(None))
                .distinct()
                .order_by(source_pack)
            )
            return [str(value) for (value,) in result.all() if value is not None]

    # -- Block resolution ------------------------------------------------------
    # All block lookups go through find_candidates / count_candidates.
    # These are the seam: swap the body for vector search later
    # without touching roll_template, preview, or count logic.

    async def find_candidates(
        self,
        slot: Dict[str, Any],
        *,
        limit: Optional[int] = None,
    ) -> List[Any]:
        """Find primitive blocks matching a slot's constraints."""
        slot = normalize_template_slot(slot)
        self._ensure_primitive_source(slot)
        return await self._find_primitive_candidates(slot, limit)

    async def _find_primitive_candidates(
        self,
        slot: Dict[str, Any],
        limit: Optional[int] = None,
    ) -> List[BlockPrimitive]:
        """Query block_primitives in the blocks DB for a slot."""
        slot = normalize_template_slot(slot)
        self._ensure_primitive_source(slot)
        query = self._build_primitive_slot_query(slot)
        if limit is not None:
            query = query.limit(limit)
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(query)
            return list(result.scalars().all())

    @staticmethod
    def _ensure_primitive_source(slot: Dict[str, Any]) -> None:
        block_source = str(slot.get("block_source") or "primitives").strip() or "primitives"
        if block_source != "primitives":
            raise ValueError(
                f"Unsupported block_source '{block_source}'. "
                "Only 'primitives' is supported."
            )

    @staticmethod
    def _primitive_slot_tag_query(slot: Dict[str, Any]) -> Optional[Dict[str, Dict[str, Any]]]:
        groups = normalize_tag_query(
            tag_constraints=slot.get("tag_constraints"),
            tag_query=slot.get("tags"),
        )
        all_group = dict(groups.get("all") or {})
        any_group = dict(groups.get("any") or {})
        not_group = dict(groups.get("not") or {})

        # Primitive packs are tracked via tags.source_pack (no dedicated package_name column).
        package_name = slot.get("package_name")
        if isinstance(package_name, str) and package_name.strip():
            all_group.setdefault("source_pack", package_name.strip())

        normalized: Dict[str, Dict[str, Any]] = {}
        if all_group:
            normalized["all"] = all_group
        if any_group:
            normalized["any"] = any_group
        if not_group:
            normalized["not"] = not_group
        return normalized or None

    def _build_primitive_slot_query(self, slot: Dict[str, Any]):
        slot = normalize_template_slot(slot)
        return build_block_primitive_query(
            category=slot.get("category"),
            tag_query=self._primitive_slot_tag_query(slot),
            min_rating=slot.get("min_rating"),
            exclude_block_ids=slot.get("exclude_block_ids"),
            is_public=True,
        )

    async def count_candidates(self, slot: Dict[str, Any]) -> int:
        """Count primitive blocks matching a slot's constraints."""
        slot = normalize_template_slot(slot)
        self._ensure_primitive_source(slot)
        base = self._build_primitive_slot_query(slot).subquery()
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(select(func.count()).select_from(base))
            return int(result.scalar() or 0)

    async def count_candidates_by_package(self, slot: Dict[str, Any]) -> List[Tuple[Optional[str], int]]:
        """Count matching primitive blocks grouped by package source."""
        slot = normalize_template_slot(slot)
        self._ensure_primitive_source(slot)
        base = self._build_primitive_slot_query(slot).subquery()
        source_pack = func.nullif(func.jsonb_extract_path_text(base.c.tags, "source_pack"), "")
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(
                select(source_pack.label("package_name"), func.count().label("count"))
                .group_by(source_pack)
            )
            rows = [(pkg, int(count or 0)) for pkg, count in result.all()]
            rows.sort(key=lambda item: (-item[1], item[0] or ""))
            return rows

    async def _list_distinct_tag_values_for_slot(
        self,
        *,
        slot: Dict[str, Any],
        tag_key: str,
    ) -> List[str]:
        """Return sorted distinct tag values for a tag key within a slot's candidate space."""
        tag_key = (tag_key or "").strip()
        if not tag_key:
            return []
        slot = normalize_template_slot(slot)
        self._ensure_primitive_source(slot)
        base = self._build_primitive_slot_query(slot).subquery()
        extracted = func.jsonb_extract_path_text(base.c.tags, str(tag_key))
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(
                select(extracted)
                .where(extracted.isnot(None))
                .distinct()
                .order_by(extracted)
            )
            values: List[str] = []
            for (value,) in result.all():
                if value is None:
                    continue
                text = str(value).strip()
                if text:
                    values.append(text)
            return values

    @staticmethod
    def _slot_constraints_for_control_resolution(slot: Dict[str, Any]) -> Dict[str, Any]:
        """Best-effort flat tag constraints map for lazy control option discovery."""
        if isinstance(slot.get("tag_constraints"), dict):
            return dict(slot["tag_constraints"])
        groups = normalize_tag_query(
            tag_constraints=slot.get("tag_constraints"),
            tag_query=slot.get("tags"),
        )
        all_group = groups.get("all") or {}
        return dict(all_group) if isinstance(all_group, dict) else {}

    async def resolve_template_controls(
        self,
        *,
        slots: List[Dict[str, Any]],
        template_metadata: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Resolve lazy template controls (e.g. tag_select) to runtime controls."""
        controls = template_metadata.get("controls")
        if not isinstance(controls, list) or not controls:
            return []

        try:
            from pixsim7.backend.main.services.prompt.block.control_resolver import (
                resolve_control,
            )
            from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
                get_canonical_block_tag_dictionary,
            )
        except Exception:
            return list(controls)

        canonical = get_canonical_block_tag_dictionary()
        slots_by_label: Dict[str, Dict[str, Any]] = {}
        slots_by_key: Dict[str, Dict[str, Any]] = {}
        for slot in slots:
            label = slot.get("label")
            if isinstance(label, str) and label.strip() and label.strip() not in slots_by_label:
                slots_by_label[label.strip()] = slot
            key = slot.get("key")
            if isinstance(key, str) and key.strip() and key.strip() not in slots_by_key:
                slots_by_key[key.strip()] = slot

        resolved_controls: List[Dict[str, Any]] = []
        for control in controls:
            if not isinstance(control, dict):
                continue

            ctrl_type = str(control.get("type") or "").strip()
            if ctrl_type != "tag_select":
                resolved_controls.append(control)
                continue

            target_slot_label = str(control.get("target_slot") or "").strip()
            target_slot_key = str(control.get("target_slot_key") or "").strip()
            target_slot = (
                slots_by_key.get(target_slot_key)
                if target_slot_key
                else None
            ) or slots_by_label.get(target_slot_label)
            slot_constraints = (
                self._slot_constraints_for_control_resolution(target_slot)
                if isinstance(target_slot, dict)
                else {}
            )
            precomputed_values_by_tag: Dict[str, List[str]] = {}

            def _block_query_fn(tag: str, constraints: Dict[str, Any]) -> List[str]:
                tag = str(tag or "").strip()
                if not tag:
                    return []
                return list(precomputed_values_by_tag.get(tag, []))

            # Precompute catalog fallback values for open-vocab tags before calling sync resolver.
            target_tag = str(control.get("target_tag") or "").strip()
            if target_tag:
                try:
                    query_slot = target_slot if isinstance(target_slot, dict) else {"tag_constraints": slot_constraints}
                    precomputed = await self._list_distinct_tag_values_for_slot(slot=query_slot, tag_key=target_tag)
                    precomputed_values_by_tag[target_tag] = precomputed
                except Exception:
                    pass

            try:
                resolved = resolve_control(
                    control,
                    vocab=canonical,
                    block_query_fn=_block_query_fn,
                    slot_constraints_by_label={
                        target_slot_label: slot_constraints,
                    } if target_slot_label else None,
                    slot_constraints_by_key={
                        target_slot_key: slot_constraints,
                    } if target_slot_key else None,
                )
            except Exception:
                resolved = control
            resolved_controls.append(resolved)

        return resolved_controls

    async def diagnose_template(self, template_id: UUID) -> Dict[str, Any]:
        """Return package-focused slot diagnostics for a template."""
        template = await self.get_template(template_id)
        if not template:
            return {"success": False, "error": "Template not found"}

        try:
            slots = normalize_template_slots(
                template.slots,
                schema_version=self._get_slot_schema_version(template),
            )
        except ValueError as exc:
            return {
                "success": False,
                "error": f"Template has invalid slot schema: {exc}",
            }

        metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
        source_meta = metadata.get("source") if isinstance(metadata.get("source"), dict) else {}
        deps_meta = metadata.get("dependencies") if isinstance(metadata.get("dependencies"), dict) else {}
        template_package_name = template.package_name

        slot_diagnostics: List[Dict[str, Any]] = []
        for slot in slots:
            label = slot.get("label", f"Slot {slot.get('slot_index', '?')}")
            kind = slot.get("kind")
            slot_package_name = slot.get("package_name")
            base_entry: Dict[str, Any] = {
                "slot_index": int(slot.get("slot_index", 0)),
                "label": label,
                "kind": kind,
                "role": slot.get("role"),
                "category": slot.get("category"),
                "selection_strategy": slot.get("selection_strategy", "uniform"),
                "optional": bool(slot.get("optional", False)),
                "slot_package_name": slot_package_name,
                "template_package_name": template_package_name,
            }

            inference = infer_composition_role(
                role=slot.get("role"),
                category=slot.get("category"),
                tags=slot.get("tags") or slot.get("tag_constraints"),
            )
            base_entry["composition_role_hint"] = inference.role_id
            base_entry["composition_role_confidence"] = inference.confidence
            base_entry["composition_role_reason"] = inference.reason

            if kind in ("reinforcement", "audio_cue"):
                slot_diagnostics.append({
                    **base_entry,
                    "status_hint": "reinforcement" if kind == "reinforcement" else "audio_cue",
                    "total_matches": 0,
                    "package_match_counts": [],
                    "template_package_match_count": 0,
                    "other_package_match_count": 0,
                    "would_need_fallback_if_template_package_restricted": False,
                    "has_matches_outside_template_package": False,
                })
                continue

            counts = await self.count_candidates_by_package(slot)
            total_matches = sum(count for _, count in counts)
            template_pkg_count = 0
            if template_package_name:
                for pkg, count in counts:
                    if pkg == template_package_name:
                        template_pkg_count = count
                        break
            other_pkg_count = total_matches - template_pkg_count
            has_outside_template_pkg = bool(template_package_name and other_pkg_count > 0)
            would_need_fallback_if_template_package_restricted = bool(
                template_package_name
                and not slot_package_name
                and total_matches > 0
                and template_pkg_count == 0
            )

            slot_diagnostics.append({
                **base_entry,
                "status_hint": "queryable",
                "total_matches": total_matches,
                "package_match_counts": [
                    {"package_name": pkg, "count": count}
                    for pkg, count in counts
                ],
                "template_package_match_count": template_pkg_count,
                "other_package_match_count": other_pkg_count,
                "has_matches_outside_template_package": has_outside_template_pkg,
                "would_need_fallback_if_template_package_restricted": (
                    would_need_fallback_if_template_package_restricted
                ),
            })

        return {
            "success": True,
            "template": {
                "id": str(template.id),
                "name": template.name,
                "slug": template.slug,
                "package_name": template.package_name,
                "composition_strategy": template.composition_strategy,
                "slot_count": len(slots),
                "slot_schema_version": self._get_slot_schema_version(template),
                "source": source_meta,
                "dependencies": deps_meta,
                "updated_at": template.updated_at.isoformat() if template.updated_at else None,
            },
            "slots": slot_diagnostics,
        }

    # -- Selection strategies --------------------------------------------------

    @staticmethod
    def _candidate_tag_value_matches(actual: Any, expected: Any) -> bool:
        if isinstance(expected, list):
            return actual in expected
        return actual == expected

    @classmethod
    def _match_ratio_for_tag_map(cls, block_tags: Dict[str, Any], prefs: Optional[Dict[str, Any]]) -> float:
        if not isinstance(prefs, dict) or not prefs:
            return 0.0
        total = 0
        matched = 0
        for key, expected in prefs.items():
            total += 1
            if key in block_tags and cls._candidate_tag_value_matches(block_tags.get(key), expected):
                matched += 1
        if total == 0:
            return 0.0
        return matched / total

    @staticmethod
    def _rating_score(candidate: ResolverCandidateBlock) -> float:
        raw = getattr(candidate, "avg_rating", None)
        if raw is None:
            return 0.0
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(value / 5.0, 1.0))

    @staticmethod
    def _block_tags(block: ResolverCandidateBlock) -> Dict[str, Any]:
        tags = getattr(block, "tags", None)
        return tags if isinstance(tags, dict) else {}

    @classmethod
    def _diversity_score(
        cls,
        candidate: ResolverCandidateBlock,
        selected_so_far: List[ResolverCandidateBlock],
        diversity_keys: Optional[List[str]],
    ) -> float:
        if not diversity_keys:
            return 1.0
        cand_tags = cls._block_tags(candidate)
        if not cand_tags:
            return 1.0

        scores: List[float] = []
        for key in diversity_keys:
            if key not in cand_tags:
                continue
            cand_value = cand_tags.get(key)
            count_seen = 0
            for prior in selected_so_far:
                prior_tags = cls._block_tags(prior)
                if key in prior_tags and prior_tags.get(key) == cand_value:
                    count_seen += 1
            # 1.0 on first use, then decays with repeats
            scores.append(1.0 / (1.0 + count_seen))

        if not scores:
            return 1.0
        return sum(scores) / len(scores)

    @staticmethod
    def _coerce_float(value: Any, default: float) -> float:
        if value is None:
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _coerce_int(value: Any, default: Optional[int] = None) -> Optional[int]:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @classmethod
    def _intensity_proximity_score(
        cls, block_tags: Dict[str, Any], target_intensity: Optional[int],
    ) -> float:
        """Score a candidate by how close its intensity tag is to the target.

        Returns 1.0 for exact match, decays linearly by 0.2 per step of
        distance, floors at 0.0.  Returns 0.0 if the block has no intensity
        tag or if no target is set.
        """
        if target_intensity is None:
            return 0.0
        raw = block_tags.get("intensity")
        if raw is None:
            return 0.0
        try:
            block_intensity = int(raw)
        except (TypeError, ValueError):
            return 0.0
        distance = abs(target_intensity - block_intensity)
        return max(0.0, 1.0 - distance * 0.2)

    def _select_uniform_or_weighted_rating(
        self,
        *,
        strategy: str,
        candidates: List[ResolverCandidateBlock],
        rng: random.Random,
    ) -> Tuple[ResolverCandidateBlock, Dict[str, Any], List[str]]:
        warnings: List[str] = []
        if strategy == "weighted_rating" and any(getattr(c, "avg_rating", None) for c in candidates):
            weights = [max((getattr(c, "avg_rating", None) or 1.0), 0.1) for c in candidates]
            chosen = rng.choices(candidates, weights=weights, k=1)[0]
            debug = {
                "strategy": "weighted_rating",
                "candidate_count": len(candidates),
                "weights": [
                    {
                        "block_id": c.block_id,
                        "weight": float(w),
                        "avg_rating": getattr(c, "avg_rating", None),
                    }
                    for c, w in zip(candidates, weights)
                ],
            }
            return chosen, debug, warnings

        chosen = rng.choice(candidates)
        debug = {
            "strategy": "uniform",
            "candidate_count": len(candidates),
        }
        return chosen, debug, warnings

    def _select_weighted_tags_like(
        self,
        *,
        strategy: str,
        slot: Dict[str, Any],
        candidates: List[ResolverCandidateBlock],
        selected_so_far: List[ResolverCandidateBlock],
        rng: random.Random,
    ) -> Tuple[ResolverCandidateBlock, Dict[str, Any], List[str]]:
        warnings: List[str] = []
        preferences = slot.get("preferences") if isinstance(slot.get("preferences"), dict) else {}
        selection_config = slot.get("selection_config") if isinstance(slot.get("selection_config"), dict) else {}
        weights_cfg = selection_config.get("weights") if isinstance(selection_config.get("weights"), dict) else {}

        diversity_keys = preferences.get("diversity_keys") if isinstance(preferences.get("diversity_keys"), list) else None

        default_diversity_weight = 0.5 if strategy == "weighted_tags" else 1.0
        if preferences.get("novelty_weight") is not None:
            default_diversity_weight = self._coerce_float(preferences.get("novelty_weight"), default_diversity_weight)

        weight_boost = self._coerce_float(weights_cfg.get("boost_tags"), 1.0)
        weight_avoid = self._coerce_float(weights_cfg.get("avoid_tags"), 1.0)
        weight_rating = self._coerce_float(weights_cfg.get("rating"), 0.25)
        weight_diversity = self._coerce_float(weights_cfg.get("diversity"), default_diversity_weight)
        weight_intensity = self._coerce_float(weights_cfg.get("intensity"), 0.75)
        temperature = max(self._coerce_float(selection_config.get("temperature"), 0.0), 0.0)
        top_k = self._coerce_int(selection_config.get("top_k"), None)

        target_intensity = self._coerce_int(slot.get("intensity"))

        scored: List[Tuple[ResolverCandidateBlock, Dict[str, Any]]] = []
        for candidate in candidates:
            block_tags = self._block_tags(candidate)
            boost_score = self._match_ratio_for_tag_map(block_tags, preferences.get("boost_tags"))
            avoid_score = self._match_ratio_for_tag_map(block_tags, preferences.get("avoid_tags"))
            rating_score = self._rating_score(candidate)
            diversity_score = self._diversity_score(candidate, selected_so_far, diversity_keys)
            intensity_score = self._intensity_proximity_score(block_tags, target_intensity)
            total = (
                weight_boost * boost_score
                - weight_avoid * avoid_score
                + weight_rating * rating_score
                + weight_diversity * diversity_score
                + weight_intensity * intensity_score
            )
            scored.append((
                candidate,
                {
                    "boost_tags": round(boost_score, 6),
                    "avoid_tags": round(avoid_score, 6),
                    "rating": round(rating_score, 6),
                    "diversity": round(diversity_score, 6),
                    "intensity": round(intensity_score, 6),
                    "total": round(total, 6),
                },
            ))

        scored.sort(key=lambda item: (item[1]["total"], self._rating_score(item[0])), reverse=True)
        considered = scored[:top_k] if top_k and top_k > 0 else scored
        if not considered:
            # Defensive fallback; caller guarantees candidates non-empty.
            chosen = rng.choice(candidates)
            return chosen, {"strategy": strategy, "candidate_count": len(candidates), "fallback": "empty_considered"}, warnings

        if temperature <= 0:
            chosen = considered[0][0]
        else:
            scores = [float(item[1]["total"]) for item in considered]
            max_score = max(scores)
            exp_weights = [math.exp((s - max_score) / max(temperature, 1e-6)) for s in scores]
            chosen = rng.choices([item[0] for item in considered], weights=exp_weights, k=1)[0]

        debug_scores = []
        for candidate, parts in considered[: min(len(considered), 12)]:
            debug_scores.append({
                "block_id": candidate.block_id,
                "avg_rating": getattr(candidate, "avg_rating", None),
                **parts,
            })

        debug = {
            "strategy": strategy,
            "candidate_count": len(candidates),
            "considered_count": len(considered),
            "temperature": temperature,
            "top_k": top_k,
            "weights": {
                "boost_tags": weight_boost,
                "avoid_tags": weight_avoid,
                "rating": weight_rating,
                "diversity": weight_diversity,
                "intensity": weight_intensity,
            },
            "target_intensity": target_intensity,
            "diversity_keys": diversity_keys or [],
            "scores": debug_scores,
        }
        return chosen, debug, warnings

    def _select_candidate_for_slot(
        self,
        *,
        slot: Dict[str, Any],
        candidates: List[ResolverCandidateBlock],
        selected_so_far: List[ResolverCandidateBlock],
        rng: random.Random,
    ) -> Tuple[ResolverCandidateBlock, Dict[str, Any], List[str]]:
        strategy = str(slot.get("selection_strategy") or "uniform")

        if strategy in {"uniform", "weighted_rating"}:
            return self._select_uniform_or_weighted_rating(
                strategy=strategy,
                candidates=candidates,
                rng=rng,
            )

        if strategy in {"weighted_tags", "diverse"}:
            return self._select_weighted_tags_like(
                strategy=strategy,
                slot=slot,
                candidates=candidates,
                selected_so_far=selected_so_far,
                rng=rng,
            )

        if strategy in {"coherent_rerank", "llm_rerank"}:
            cfg = slot.get("selection_config") if isinstance(slot.get("selection_config"), dict) else {}
            fallback = str(cfg.get("fallback_strategy") or "weighted_tags")
            if fallback not in {"uniform", "weighted_rating", "weighted_tags", "diverse"}:
                fallback = "weighted_tags"
            warnings = [f"Selection strategy '{strategy}' not implemented yet; used fallback '{fallback}'"]
            if fallback in {"weighted_tags", "diverse"}:
                chosen, debug, more = self._select_weighted_tags_like(
                    strategy=fallback,
                    slot=slot,
                    candidates=candidates,
                    selected_so_far=selected_so_far,
                    rng=rng,
                )
            else:
                chosen, debug, more = self._select_uniform_or_weighted_rating(
                    strategy=fallback,
                    candidates=candidates,
                    rng=rng,
                )
            debug = {
                **debug,
                "requested_strategy": strategy,
                "fallback_strategy": fallback,
            }
            return chosen, debug, warnings + more

        chosen, debug, warnings = self._select_uniform_or_weighted_rating(
            strategy="uniform",
            candidates=candidates,
            rng=rng,
        )
        warnings.insert(0, f"Unknown selection strategy '{strategy}', used 'uniform'")
        debug = {
            **debug,
            "requested_strategy": strategy,
        }
        return chosen, debug, warnings

    # -- Preview ---------------------------------------------------------------

    async def count_matching_blocks(self, slot: Dict[str, Any]) -> int:
        return await self.count_candidates(slot)

    async def preview_slot_matches(
        self,
        slot: Dict[str, Any],
        limit: int = 5,
    ) -> Dict[str, Any]:
        slot = normalize_template_slot(slot)
        count = await self.count_candidates(slot)
        samples = await self.find_candidates(slot, limit=limit)

        sample_rows: List[Dict[str, Any]] = []
        for block in samples:
            role_value = getattr(block, "role", None)
            category_value = getattr(block, "category", None)
            tags_value = getattr(block, "tags", None)
            if not role_value:
                inferred = infer_composition_role(
                    role=None,
                    category=category_value,
                    tags=tags_value if isinstance(tags_value, dict) else None,
                )
                role_value = inferred.role_id
            sample_rows.append(
                {
                    "id": str(block.id),
                    "block_id": getattr(block, "block_id", ""),
                    "role": role_value,
                    "category": category_value,
                    "prompt_preview": (getattr(block, "text", "") or "")[:120],
                    "avg_rating": getattr(block, "avg_rating", None),
                }
            )
        return {
            "count": count,
            "samples": sample_rows,
        }

    # -- Roll ------------------------------------------------------------------

    @staticmethod
    def _resolver_candidate_role(candidate: ResolverCandidateBlock) -> Optional[str]:
        for capability in candidate.capabilities or []:
            if not isinstance(capability, str):
                continue
            if capability.startswith("role:"):
                role = capability.split(":", 1)[1].strip()
                if role:
                    return role
        return None

    @staticmethod
    def _find_candidate_by_block_id(
        candidates: List[ResolverCandidateBlock],
        block_id: str,
    ) -> Optional[ResolverCandidateBlock]:
        for candidate in candidates:
            if candidate.block_id == block_id:
                return candidate
        return None

    @staticmethod
    def _trace_scores_for_target(
        *,
        result: ResolverResolutionResult,
        target_key: str,
    ) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for event in result.trace.events:
            if event.kind != "candidate_scored":
                continue
            if event.target_key != target_key:
                continue
            rows.append(
                {
                    "block_id": event.candidate_block_id,
                    "score": event.score,
                    "total": event.score,
                    "reasons": list(event.data.get("reasons") or []),
                }
            )
        rows.sort(key=lambda row: float(row.get("score") or 0.0), reverse=True)
        return rows

    @staticmethod
    def _candidate_scalar_tag_values(
        candidates: List[ResolverCandidateBlock],
        tag_key: str,
    ) -> set[Any]:
        values: set[Any] = set()
        for candidate in candidates:
            tags = candidate.tags if isinstance(candidate.tags, dict) else {}
            value = tags.get(tag_key)
            if isinstance(value, (str, int, float, bool)):
                values.add(value)
        return values

    def _inject_diversity_pairwise_bonuses(
        self,
        *,
        request: ResolverResolutionRequest,
        slots: List[Dict[str, Any]],
    ) -> None:
        queryable_slots: List[Tuple[str, Dict[str, Any]]] = []
        for idx, slot in enumerate(slots):
            if slot.get("kind") in ("reinforcement", "audio_cue"):
                continue
            queryable_slots.append((slot_target_key(slot, idx), slot))

        existing_ids = {bonus.id for bonus in request.pairwise_bonuses}
        for idx, (target_key, target_slot) in enumerate(queryable_slots):
            strategy = str(target_slot.get("selection_strategy") or "uniform")
            if strategy != "diverse":
                continue

            prefs = target_slot.get("preferences") if isinstance(target_slot.get("preferences"), dict) else {}
            diversity_keys = [
                str(key)
                for key in (prefs.get("diversity_keys") or [])
                if isinstance(key, str) and key.strip()
            ]
            if not diversity_keys:
                continue

            cfg = target_slot.get("selection_config") if isinstance(target_slot.get("selection_config"), dict) else {}
            weights_cfg = cfg.get("weights") if isinstance(cfg.get("weights"), dict) else {}
            diversity_weight = abs(self._coerce_float(weights_cfg.get("diversity"), 1.0))
            if diversity_weight <= 0:
                continue
            penalty = -diversity_weight

            target_candidates = list(request.candidates_by_target.get(target_key) or [])
            if not target_candidates:
                continue

            for source_key, _source_slot in queryable_slots[:idx]:
                source_candidates = list(request.candidates_by_target.get(source_key) or [])
                if not source_candidates:
                    continue

                for tag_key in diversity_keys:
                    source_values = self._candidate_scalar_tag_values(source_candidates, tag_key)
                    if not source_values:
                        continue
                    target_values = self._candidate_scalar_tag_values(target_candidates, tag_key)
                    shared_values = source_values.intersection(target_values)
                    for value in sorted(shared_values, key=lambda item: str(item)):
                        bonus_id = f"diversity:{source_key}:{target_key}:{tag_key}:{value}"
                        if bonus_id in existing_ids:
                            continue
                        request.pairwise_bonuses.append(
                            ResolverPairwiseBonus(
                                id=bonus_id,
                                source_target=source_key,
                                target_key=target_key,
                                source_tags={tag_key: value},
                                candidate_tags={tag_key: value},
                                bonus=penalty,
                            )
                        )
                        existing_ids.add(bonus_id)

    @staticmethod
    def _apply_control_effects(
        slots: List[Dict[str, Any]],
        template_metadata: Dict[str, Any],
        control_values: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Apply template control effects to slot preferences.

        Supports:
        - ``slider`` controls (numeric value + thresholded effects)
        - ``select`` controls (selected option effects)

        For each control, resolves its current value (from control_values
        or defaultValue) and applies effects:
        - slot_tag_boost: merges boost/avoid tags into slot preferences
          (highest-threshold winner per slot for sliders; selected option effects for selects)
        - slot_intensity: sets slot intensity to the control's current value
        """
        controls = template_metadata.get("controls") or []
        if not controls:
            return slots

        # Build slot lookups by key (preferred) and label (legacy).
        slots_by_key: Dict[str, List[Dict[str, Any]]] = {}
        slots_by_label: Dict[str, List[Dict[str, Any]]] = {}
        for slot in slots:
            label = slot.get("label", "")
            if label:
                slots_by_label.setdefault(label, []).append(slot)
            key = slot.get("key")
            if isinstance(key, str) and key.strip():
                slots_by_key.setdefault(key.strip(), []).append(slot)

        for control in controls:
            control_type = control.get("type")
            control_id = control.get("id", "")
            raw_value = (control_values or {}).get(
                control_id, control.get("defaultValue", 0)
            )
            effects: List[Dict[str, Any]] = []
            value_num: Optional[float] = None

            if control_type == "slider":
                effects = [e for e in (control.get("effects") or []) if isinstance(e, dict)]
                try:
                    value_num = float(raw_value)
                except (TypeError, ValueError):
                    value_num = float(control.get("defaultValue", 0) or 0)
            elif control_type == "select":
                selected_id = None if raw_value is None else str(raw_value)
                options = control.get("options") or []
                selected_option = None
                for option in options:
                    if not isinstance(option, dict):
                        continue
                    option_id = option.get("id")
                    if selected_id is not None and str(option_id) == selected_id:
                        selected_option = option
                        break
                if selected_option is None and isinstance(control.get("defaultValue"), str):
                    default_id = str(control.get("defaultValue"))
                    for option in options:
                        if isinstance(option, dict) and str(option.get("id")) == default_id:
                            selected_option = option
                            break
                if selected_option is None and options:
                    first = options[0]
                    selected_option = first if isinstance(first, dict) else None
                effects = [e for e in ((selected_option or {}).get("effects") or []) if isinstance(e, dict)]
            else:
                continue

            # Apply slot_intensity effects
            for effect in effects:
                if effect.get("kind") != "slot_intensity":
                    continue
                slot_key = effect.get("slotKey")
                slot_label = effect.get("slotLabel")
                targets: List[Dict[str, Any]] = []
                if isinstance(slot_key, str) and slot_key.strip():
                    targets = slots_by_key.get(slot_key.strip(), [])
                elif isinstance(slot_label, str) and slot_label.strip():
                    targets = slots_by_label.get(slot_label.strip(), [])
                for target_slot in targets:
                    if value_num is None:
                        continue
                    target_slot["intensity"] = round(value_num)

            # Collect winning slot_tag_boost per slot label
            # (highest enabledAt that is still active), keyed by stable slotKey when provided.
            winners: Dict[str, Dict[str, Any]] = {}
            for effect in effects:
                if effect.get("kind") != "slot_tag_boost":
                    continue
                threshold = effect.get("enabledAt", 0)
                if control_type == "slider":
                    if value_num is None or value_num < threshold:
                        continue
                slot_key = effect.get("slotKey")
                slot_label = effect.get("slotLabel")
                target_id = None
                if isinstance(slot_key, str) and slot_key.strip():
                    target_id = f"key:{slot_key.strip()}"
                elif isinstance(slot_label, str) and slot_label.strip():
                    target_id = f"label:{slot_label.strip()}"
                else:
                    continue
                prev = winners.get(target_id)
                if control_type != "slider":
                    winners[target_id] = effect
                    continue
                if prev is None or threshold >= prev.get("enabledAt", 0):
                    winners[target_id] = effect

            # Patch slot preferences
            for target_id, effect in winners.items():
                slot_key = effect.get("slotKey")
                slot_label = effect.get("slotLabel")
                targets: List[Dict[str, Any]] = []
                if isinstance(slot_key, str) and slot_key.strip():
                    targets = slots_by_key.get(slot_key.strip(), [])
                elif isinstance(slot_label, str) and slot_label.strip():
                    targets = slots_by_label.get(slot_label.strip(), [])
                for target_slot in targets:
                    prefs = target_slot.get("preferences") or {}
                    if effect.get("boostTags"):
                        prefs["boost_tags"] = _merge_tag_maps(
                            prefs.get("boost_tags"), effect["boostTags"]
                        )
                    if effect.get("avoidTags"):
                        prefs["avoid_tags"] = _merge_tag_maps(
                            prefs.get("avoid_tags"), effect["avoidTags"]
                        )
                    target_slot["preferences"] = prefs

        return slots

    async def roll_template(
        self,
        template_id: UUID,
        *,
        seed: Optional[int] = None,
        exclude_block_ids: Optional[List[UUID]] = None,
        character_bindings: Optional[Dict[str, Any]] = None,
        control_values: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Roll a template: compile + resolve slot selections and compose a prompt."""
        template = await self.get_template(template_id)
        if not template:
            return {"success": False, "error": "Template not found"}

        rng = random.Random(seed)
        try:
            slots = normalize_template_slots(
                template.slots,
                schema_version=self._get_slot_schema_version(template),
            )
        except ValueError as exc:
            return {
                "success": False,
                "error": f"Template has invalid slot schema: {exc}",
            }

        # Resolve lazy controls (e.g. tag_select) for runtime and apply control effects.
        metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
        resolved_controls = await self.resolve_template_controls(slots=slots, template_metadata=metadata)
        if resolved_controls:
            metadata = {**metadata, "controls": resolved_controls}
        slots = self._apply_control_effects(slots, metadata, control_values)

        compiler = _compiler_registry.get(_ROLL_COMPILER_ID)
        try:
            compiled_request: ResolverResolutionRequest = await compiler.compile(
                service=self,
                template=template,
                candidate_limit=_ROLL_CANDIDATE_LIMIT,
                control_values=control_values,
                exclude_block_ids=list(exclude_block_ids or []),
                resolver_id=_ROLL_RESOLVER_ID,
            )
        except Exception as exc:
            return {"success": False, "error": f"Template compile failed: {exc}"}

        compiled_request.seed = seed
        if not compiled_request.resolver_id:
            compiled_request.resolver_id = _ROLL_RESOLVER_ID
        self._inject_diversity_pairwise_bonuses(request=compiled_request, slots=slots)

        try:
            resolver_result = _resolver_registry.resolve(compiled_request)
        except KeyError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:
            return {"success": False, "error": f"Template resolve failed: {exc}"}

        selected_blocks: List[Dict[str, Any]] = []
        slot_results: List[Dict[str, Any]] = []
        warnings: List[str] = list(resolver_result.warnings or [])

        for idx, slot in enumerate(slots):
            label = slot.get("label", f"Slot {slot.get('slot_index', '?')}")

            # Reinforcement / audio cue slots - inject literal text, skip resolver targets.
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

            target_key = slot_target_key(slot, idx)
            candidates = list(compiled_request.candidates_by_target.get(target_key) or [])
            selected = resolver_result.selected_by_target.get(target_key)

            if selected is None:
                match_count = len(candidates)
                if slot.get("optional"):
                    reason = "optional, no matches" if match_count == 0 else "optional, unresolved by resolver"
                    slot_results.append({
                        "label": label,
                        "status": "skipped",
                        "reason": reason,
                        "match_count": match_count,
                    })
                    continue
                if slot.get("fallback_text"):
                    if match_count == 0:
                        warnings.append(f"Slot '{label}': no matching blocks, using fallback text")
                    else:
                        warnings.append(f"Slot '{label}': resolver returned no selection, using fallback text")
                    slot_results.append({
                        "label": label,
                        "status": "fallback",
                        "fallback_text": slot["fallback_text"],
                        "match_count": match_count,
                    })
                    continue
                if match_count == 0:
                    warnings.append(f"Slot '{label}': no matching blocks found")
                    reason = "no matches, not optional, no fallback"
                else:
                    warnings.append(f"Slot '{label}': resolver returned no selection")
                    reason = "unresolved by resolver, not optional, no fallback"
                slot_results.append({
                    "label": label,
                    "status": "empty",
                    "reason": reason,
                    "match_count": match_count,
                })
                continue

            chosen = self._find_candidate_by_block_id(candidates, selected.block_id)
            chosen_block_id = selected.block_id
            chosen_text = selected.text or ""
            chosen_category: Optional[str] = None
            chosen_tags: Dict[str, Any] = {}
            chosen_db_id: Optional[str] = None
            chosen_avg_rating: Optional[float] = None
            chosen_package_name: Optional[str] = None
            chosen_role: Optional[str] = None

            if chosen is not None:
                chosen_text = chosen.text or chosen_text
                chosen_category = chosen.category
                chosen_tags = dict(chosen.tags or {})
                chosen_avg_rating = chosen.avg_rating
                chosen_package_name = chosen.package_name
                chosen_role = self._resolver_candidate_role(chosen)
                if isinstance(chosen.metadata, dict) and chosen.metadata.get("db_id") is not None:
                    chosen_db_id = str(chosen.metadata.get("db_id"))
            else:
                warnings.append(
                    f"Target '{target_key}' selected '{selected.block_id}' missing in compiled candidate set"
                )
                selected_tags = selected.metadata.get("tags") if isinstance(selected.metadata, dict) else None
                if isinstance(selected_tags, dict):
                    chosen_tags = dict(selected_tags)

            if not chosen_role:
                raw_role = slot.get("role")
                if isinstance(raw_role, str) and raw_role.strip():
                    chosen_role = raw_role.strip()
            if not chosen_role:
                inferred = infer_composition_role(role=None, category=chosen_category, tags=chosen_tags)
                chosen_role = inferred.role_id

            selected_block: Dict[str, Any] = {
                "id": chosen_db_id or chosen_block_id,
                "block_id": chosen_block_id,
                "text": chosen_text,
                "category": chosen_category,
                "role": chosen_role,
                "tags": chosen_tags,
                "avg_rating": chosen_avg_rating,
                "package_name": chosen_package_name,
                "block_metadata": {
                    "role": chosen_role,
                    "category": chosen_category,
                },
                "kind": "single_state",
            }
            selected_blocks.append(selected_block)

            selector_debug = {
                "strategy": str(slot.get("selection_strategy") or "resolver"),
                "resolver_id": resolver_result.resolver_id,
                "target_key": target_key,
                "score": selected.score,
                "reasons": list(selected.reasons or []),
                "scores": self._trace_scores_for_target(result=resolver_result, target_key=target_key)[:12],
            }
            selection_config = slot.get("selection_config") if isinstance(slot.get("selection_config"), dict) else {}
            weight_map = selection_config.get("weights") if isinstance(selection_config.get("weights"), dict) else {}
            if weight_map:
                selector_debug["weights"] = dict(weight_map)

            sr_entry: Dict[str, Any] = {
                "label": label,
                "status": "selected",
                "match_count": len(candidates),
                "selected_block_id": selected_block.get("id"),
                "selected_block_string_id": selected_block.get("block_id"),
                "selected_block_role": selected_block.get("role"),
                "selected_block_category": selected_block.get("category"),
                "prompt_preview": (selected_block.get("text") or "")[:120],
                "selector_strategy": selector_debug.get("strategy"),
                "selector_debug": selector_debug,
            }
            # Carry slot frame for composition.
            frame = slot.get("frame")
            if isinstance(frame, str) and "{text}" in frame:
                sr_entry["frame"] = frame
            slot_results.append(sr_entry)

        # Slot-order-aware composition:
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

        # Merge roll-time overrides onto template defaults so partial overrides do not
        # accidentally drop required placeholders like {{subject}}. Preserve explicit
        # empty dict as a way to disable template defaults entirely.
        template_bindings = template.character_bindings or {}
        if character_bindings is not None:
            if character_bindings == {}:
                effective_bindings = {}
            else:
                effective_bindings = {**template_bindings, **character_bindings}
        else:
            effective_bindings = template_bindings
        characters_resolved: Dict[str, str] = {}

        # Prepare expander once (caches character lookups across calls).
        expander = None
        if effective_bindings:
            from pixsim7.backend.main.services.characters.character import CharacterService
            char_service = CharacterService(self.db)
            expander = CharacterBindingExpander(char_service.get_character_by_id)

        if strategy == "sequential" or not composition_strategy_applied:
            block_iter = iter(selected_blocks)
            prompt_parts: List[str] = []
            last_block: Optional[Any] = None

            for sr in slot_results:
                if sr["status"] == "selected":
                    block = next(block_iter, None)
                    if block:
                        text = str(block.get("text") or "")
                        if not text:
                            continue
                        # Apply slot frame (spatial/relational wrapping).
                        frame = sr.get("frame")
                        if frame:
                            text = frame.replace("{text}", text)
                        prompt_parts.append(text)
                        last_block = block
                elif sr["status"] == "fallback":
                    prompt_parts.append(sr["fallback_text"])
                elif sr["status"] == "reinforcement":
                    text = sr["reinforcement_text"]
                    if expander and text:
                        # Resolve intensity for this cue.
                        slot_intensity = sr.get("intensity")  # explicit 0-10 or None
                        if sr.get("inherit_intensity") and last_block:
                            # Read intensity from previous block tags.
                            block_tags = last_block.get("tags") if isinstance(last_block.get("tags"), dict) else {}
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
            analysis_blocks: List[Any] = selected_blocks
            if strategy == "layered" and composition_strategy_applied:
                analysis_blocks = _order_layered_blocks(selected_blocks)
            derived_analysis = derive_analysis_from_blocks(analysis_blocks, assembled_prompt)

        # Final character binding expansion for block text (no intensity).
        if expander and assembled_prompt:
            expansion = await expander.expand(assembled_prompt, effective_bindings, rng)
            assembled_prompt = expansion["expanded_text"]
            characters_resolved.update(expansion["characters_resolved"])
            for err in expansion.get("expansion_errors", []):
                warnings.append(f"Character expansion: {err}")

        # Increment roll count.
        template.roll_count = (template.roll_count or 0) + 1
        await self.db.commit()

        selected_block_ids = [str(b.get("id")) for b in selected_blocks if b.get("id") is not None]
        selected_block_string_ids = [str(b.get("block_id")) for b in selected_blocks if b.get("block_id")]

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
                "resolver_id": resolver_result.resolver_id,
                # Tracking/provenance: stable IDs for downstream manifest & UI debugging.
                "selected_block_ids": selected_block_ids,
                "selected_block_string_ids": selected_block_string_ids,
                "character_bindings": effective_bindings if effective_bindings else None,
                "characters_resolved": characters_resolved if characters_resolved else None,
            },
        }
# -- Composition helpers (stateless) -----------------------------------------

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


def _block_text(block: Any) -> str:
    if isinstance(block, dict):
        return str(block.get("text") or "")
    return str(getattr(block, "text", "") or "")


def _block_role(block: Any) -> Optional[str]:
    if isinstance(block, dict):
        value = block.get("role")
    else:
        value = getattr(block, "role", None)
    if isinstance(value, str):
        value = value.strip()
    return value or None


def _compose_sequential(blocks: List[Any]) -> str:
    if not blocks:
        return ""
    return _join_blocks([_block_text(block) for block in blocks if _block_text(block)])


def _compose_layered(blocks: List[Any]) -> str:
    """Layer blocks by inferred role category."""
    return _join_blocks([_block_text(block) for block in _order_layered_blocks(blocks) if _block_text(block)])


def _order_layered_blocks(blocks: List[Any]) -> List[Any]:
    """Return blocks ordered by role categories for layered composition."""
    categories: Dict[str, List[Any]] = {
        "character": [], "setting": [], "camera": [],
        "action": [], "mood": [], "other": [],
    }

    for block in blocks:
        role = _block_role(block) or "other"
        if role in categories:
            categories[role].append(block)
        else:
            categories["other"].append(block)

    order = ["setting", "character", "action", "camera", "mood", "other"]
    ordered_blocks: List[Any] = []
    for cat in order:
        ordered_blocks.extend(categories.get(cat, []))

    return ordered_blocks


def _compose_merged(blocks: List[Any]) -> str:
    """Placeholder merged strategy; currently mirrors sequential composition."""
    return _compose_sequential(blocks)


def _merge_tag_maps(
    existing: Optional[Dict[str, Any]],
    incoming: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Merge two tag maps, with incoming values overwriting on conflict."""
    if not existing:
        return dict(incoming) if incoming else {}
    if not incoming:
        return dict(existing)
    merged = dict(existing)
    merged.update(incoming)
    return merged
