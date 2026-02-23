"""Block Template Service — CRUD and roll operations

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
            tag_query=slot.get("tags"),
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

    async def count_candidates_by_package(self, slot: Dict[str, Any]) -> List[Tuple[Optional[str], int]]:
        """Count matching prompt blocks grouped by package_name."""
        base = self._build_slot_query(slot).subquery()
        result = await self.db.execute(
            select(base.c.package_name, func.count().label("count"))
            .group_by(base.c.package_name)
        )
        rows = [(pkg, int(count or 0)) for pkg, count in result.all()]
        rows.sort(key=lambda item: (-item[1], item[0] or ""))
        return rows

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

    # ── Selection strategies ───────────────────────────────────────────────

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
    def _rating_score(candidate: PromptBlock) -> float:
        raw = getattr(candidate, "avg_rating", None)
        if raw is None:
            return 0.0
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(value / 5.0, 1.0))

    @staticmethod
    def _block_tags(block: PromptBlock) -> Dict[str, Any]:
        tags = getattr(block, "tags", None)
        return tags if isinstance(tags, dict) else {}

    @classmethod
    def _diversity_score(
        cls,
        candidate: PromptBlock,
        selected_so_far: List[PromptBlock],
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

    def _select_uniform_or_weighted_rating(
        self,
        *,
        strategy: str,
        candidates: List[PromptBlock],
        rng: random.Random,
    ) -> Tuple[PromptBlock, Dict[str, Any], List[str]]:
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
        candidates: List[PromptBlock],
        selected_so_far: List[PromptBlock],
        rng: random.Random,
    ) -> Tuple[PromptBlock, Dict[str, Any], List[str]]:
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
        temperature = max(self._coerce_float(selection_config.get("temperature"), 0.0), 0.0)
        top_k = self._coerce_int(selection_config.get("top_k"), None)

        scored: List[Tuple[PromptBlock, Dict[str, Any]]] = []
        for candidate in candidates:
            block_tags = self._block_tags(candidate)
            boost_score = self._match_ratio_for_tag_map(block_tags, preferences.get("boost_tags"))
            avoid_score = self._match_ratio_for_tag_map(block_tags, preferences.get("avoid_tags"))
            rating_score = self._rating_score(candidate)
            diversity_score = self._diversity_score(candidate, selected_so_far, diversity_keys)
            total = (
                weight_boost * boost_score
                - weight_avoid * avoid_score
                + weight_rating * rating_score
                + weight_diversity * diversity_score
            )
            scored.append((
                candidate,
                {
                    "boost_tags": round(boost_score, 6),
                    "avoid_tags": round(avoid_score, 6),
                    "rating": round(rating_score, 6),
                    "diversity": round(diversity_score, 6),
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
            },
            "diversity_keys": diversity_keys or [],
            "scores": debug_scores,
        }
        return chosen, debug, warnings

    def _select_candidate_for_slot(
        self,
        *,
        slot: Dict[str, Any],
        candidates: List[PromptBlock],
        selected_so_far: List[PromptBlock],
        rng: random.Random,
    ) -> Tuple[PromptBlock, Dict[str, Any], List[str]]:
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

    @staticmethod
    def _apply_control_effects(
        slots: List[Dict[str, Any]],
        template_metadata: Dict[str, Any],
        control_values: Optional[Dict[str, float]],
    ) -> List[Dict[str, Any]]:
        """Apply template control slider effects to slot preferences.

        For each slider control, resolves its current value (from control_values
        or defaultValue), finds active slot_tag_boost effects (value >= enabledAt),
        keeps the highest-threshold winner per slot label, and merges boost/avoid
        tags into the matching slots' preferences.
        """
        controls = template_metadata.get("controls") or []
        if not controls:
            return slots

        # Build slot lookup by label
        slots_by_label: Dict[str, List[Dict[str, Any]]] = {}
        for slot in slots:
            label = slot.get("label", "")
            if label:
                slots_by_label.setdefault(label, []).append(slot)

        for control in controls:
            if control.get("type") != "slider":
                continue
            control_id = control.get("id", "")
            value = (control_values or {}).get(
                control_id, control.get("defaultValue", 0)
            )
            effects = control.get("effects") or []

            # Collect winning slot_tag_boost per slot label
            # (highest enabledAt that is still active)
            winners: Dict[str, Dict[str, Any]] = {}
            for effect in effects:
                if effect.get("kind") != "slot_tag_boost":
                    continue
                threshold = effect.get("enabledAt", 0)
                if value < threshold:
                    continue
                slot_label = effect.get("slotLabel", "")
                prev = winners.get(slot_label)
                if prev is None or threshold >= prev.get("enabledAt", 0):
                    winners[slot_label] = effect

            # Patch slot preferences
            for slot_label, effect in winners.items():
                for target_slot in slots_by_label.get(slot_label, []):
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
        control_values: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """Roll a template: select random blocks per slot and compose a prompt."""
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
        global_excludes = set(exclude_block_ids or [])

        # Apply control slider effects to slot preferences
        metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
        slots = self._apply_control_effects(slots, metadata, control_values)

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

            # Selection (pluggable strategy with debug output)
            chosen, selector_debug, selector_warnings = self._select_candidate_for_slot(
                slot=slot,
                candidates=candidates,
                selected_so_far=selected_blocks,
                rng=rng,
            )
            warnings.extend(selector_warnings)

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
                "selector_strategy": selector_debug.get("strategy", strategy),
                "selector_debug": selector_debug,
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
