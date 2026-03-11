"""Compiler v1: template → ResolutionRequest.

Reads a block template (slots, controls, metadata), resolves controls,
fetches candidate blocks per slot, and emits a neutral ResolutionRequest IR.

This is the first formal compiler implementation. It was originally
inline helper functions in the block_templates endpoint module.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..capabilities import derive_block_capabilities, normalize_capability_ids
from ..block_query import normalize_tag_query
from ..resolution_core.types import (
    CandidateBlock,
    ConstraintKind,
    ResolutionConstraint,
    ResolutionDebugOptions,
    ResolutionIntent,
    ResolutionRequest,
    ResolutionTarget,
)
from ..template_slots import normalize_template_slots


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slot_target_key(slot: Dict[str, Any], index: int) -> str:
    """Generate a stable target key for a slot."""
    key = slot.get("key")
    if isinstance(key, str) and key.strip():
        return key.strip()
    label = slot.get("label")
    if isinstance(label, str) and label.strip():
        slug = "".join(ch.lower() if ch.isalnum() else "_" for ch in label.strip())
        slug = "_".join(part for part in slug.split("_") if part)
        if slug:
            return slug
    return f"slot_{index}"


def slot_tag_constraint_groups(slot: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Return normalized tag constraint groups: {all, any, not}."""
    groups = normalize_tag_query(
        tag_constraints=slot.get("tag_constraints"),
        tag_query=slot.get("tags"),
    )
    return {
        "all": dict(groups.get("all") or {}) if isinstance(groups.get("all"), dict) else {},
        "any": dict(groups.get("any") or {}) if isinstance(groups.get("any"), dict) else {},
        "not": dict(groups.get("not") or {}) if isinstance(groups.get("not"), dict) else {},
    }


def primitive_block_to_candidate(block: Any) -> CandidateBlock:
    """Convert a primitive row into a resolver CandidateBlock."""
    tags = block.tags if isinstance(getattr(block, "tags", None), dict) else {}
    category = getattr(block, "category", None)
    block_metadata = (
        getattr(block, "block_metadata", None)
        if isinstance(getattr(block, "block_metadata", None), dict)
        else {}
    )
    op_metadata = block_metadata.get("op") if isinstance(block_metadata, dict) else None
    assembly_layer = block_metadata.get("assembly_layer") if isinstance(block_metadata, dict) else None
    fallback_layer = block_metadata.get("layer") if isinstance(block_metadata, dict) else None
    layer_value: Optional[str] = None
    if isinstance(assembly_layer, str) and assembly_layer.strip():
        layer_value = assembly_layer.strip()
    elif isinstance(fallback_layer, str) and fallback_layer.strip():
        layer_value = fallback_layer.strip()
    package_name = None
    source_pack = tags.get("source_pack") if isinstance(tags, dict) else None
    if isinstance(source_pack, str) and source_pack.strip():
        package_name = source_pack.strip()
    capabilities = derive_block_capabilities(
        category=(str(category) if category is not None else None),
        tags=tags,
        declared=getattr(block, "capabilities", None),
    )
    return CandidateBlock(
        block_id=str(getattr(block, "block_id", "") or ""),
        text=str(getattr(block, "text", "") or ""),
        package_name=package_name,
        tags=dict(tags),
        category=(str(category) if category is not None else None),
        avg_rating=(float(block.avg_rating) if isinstance(getattr(block, "avg_rating", None), (int, float)) else None),
        features={},
        capabilities=capabilities,
        metadata={
            "db_id": str(getattr(block, "id", "")) if getattr(block, "id", None) is not None else None,
            **({"op": dict(op_metadata)} if isinstance(op_metadata, dict) else {}),
            **({"assembly_layer": layer_value} if layer_value else {}),
        },
    )


# Back-compat export name used by compiler_core.__init__ and older imports.
prompt_block_to_candidate = primitive_block_to_candidate


def _slot_required_capabilities(slot: Dict[str, Any], target_category: Optional[str]) -> List[str]:
    """Return explicit slot capability requirements, with category fallback."""
    required = normalize_capability_ids(slot.get("required_capabilities"))
    if required:
        return required
    if isinstance(target_category, str) and target_category.strip():
        return [target_category.strip()]
    return []


# ---------------------------------------------------------------------------
# Compiler v1
# ---------------------------------------------------------------------------


class CompilerV1:
    """First-generation template compiler.

    Reads shared content (block templates with slots, controls, tag constraints)
    and emits a ``ResolutionRequest`` IR suitable for any registered resolver.
    """

    compiler_id = "compiler_v1"

    async def compile(
        self,
        *,
        service: Any,  # BlockTemplateService
        template: Any,
        candidate_limit: int,
        control_values: Optional[Dict[str, Any]],
        exclude_block_ids: Optional[List[Any]] = None,
        resolver_id: Optional[str] = None,
    ) -> ResolutionRequest:
        slots = normalize_template_slots(
            template.slots,
            schema_version=service._get_slot_schema_version(template),
        )

        metadata = template.template_metadata if isinstance(template.template_metadata, dict) else {}
        resolved_controls = await service.resolve_template_controls(slots=slots, template_metadata=metadata)
        if resolved_controls:
            metadata = {**metadata, "controls": resolved_controls}
        slots = service._apply_control_effects(slots, metadata, control_values)

        targets: List[ResolutionTarget] = []
        candidates_by_target: Dict[str, List[CandidateBlock]] = {}
        desired_tags_by_target: Dict[str, Dict[str, Any]] = {}
        avoid_tags_by_target: Dict[str, Dict[str, Any]] = {}
        required_capabilities_by_target: Dict[str, List[str]] = {}
        constraints: List[ResolutionConstraint] = []

        global_excludes = list(exclude_block_ids or [])

        for idx, slot in enumerate(slots):
            kind = str(slot.get("kind") or "").strip()
            if kind in {"reinforcement", "audio_cue"}:
                continue

            target_key = slot_target_key(slot, idx)
            label = str(slot.get("label") or target_key)
            target_category = (str(slot.get("category")) if slot.get("category") is not None else None)
            target_role = (str(slot.get("role")) if slot.get("role") is not None else None)

            # -- Target capabilities
            target_caps: List[str] = []
            if target_category:
                target_caps.append(target_category)
            if target_role:
                target_caps.append(f"role:{target_role}")
            target_caps.extend(normalize_capability_ids(slot.get("required_capabilities")))
            target_caps = normalize_capability_ids(target_caps)

            targets.append(
                ResolutionTarget(
                    key=target_key,
                    kind="slot",
                    label=label,
                    category=target_category,
                    capabilities=target_caps,
                    metadata={
                        "slot_index": int(slot.get("slot_index", idx)),
                        "selection_strategy": str(slot.get("selection_strategy") or "uniform"),
                        "optional": bool(slot.get("optional", False)),
                        **({"role": target_role} if target_role else {}),
                        **({"intensity": slot["intensity"]} if "intensity" in slot else {}),
                    },
                )
            )

            # -- Required capabilities
            required_caps = _slot_required_capabilities(slot, target_category)
            if required_caps:
                required_capabilities_by_target[target_key] = required_caps

            # -- Candidates
            slot_with_excludes = dict(slot)
            merged_excludes = list(slot_with_excludes.get("exclude_block_ids") or [])
            if global_excludes:
                merged_excludes.extend(global_excludes)
            if merged_excludes:
                # Keep deterministic order while preserving values.
                deduped: List[Any] = []
                seen: set[str] = set()
                for item in merged_excludes:
                    key = str(item)
                    if key in seen:
                        continue
                    seen.add(key)
                    deduped.append(item)
                slot_with_excludes["exclude_block_ids"] = deduped
            else:
                slot_with_excludes["exclude_block_ids"] = None
            candidates = await service.find_candidates(slot_with_excludes, limit=candidate_limit)
            candidates_by_target[target_key] = [
                primitive_block_to_candidate(block)
                for block in candidates
                if str(getattr(block, "block_id", "") or "").strip()
            ]

            # -- Soft preferences (includes control effects already merged)
            prefs = slot.get("preferences") if isinstance(slot.get("preferences"), dict) else {}
            boost_tags = prefs.get("boost_tags") if isinstance(prefs.get("boost_tags"), dict) else {}
            avoid_tags = prefs.get("avoid_tags") if isinstance(prefs.get("avoid_tags"), dict) else {}

            # -- Tag constraint groups → constraints + soft boosts
            tag_groups = slot_tag_constraint_groups(slot)

            for tag_key, tag_value in tag_groups["all"].items():
                constraints.append(
                    ResolutionConstraint(
                        id=f"{target_key}:requires:{tag_key}",
                        kind=ConstraintKind.REQUIRES_TAG,
                        target_key=target_key,
                        payload={"tag": tag_key, "value": tag_value},
                        severity="error",
                    )
                )

            for tag_key, tag_value in tag_groups["not"].items():
                constraints.append(
                    ResolutionConstraint(
                        id=f"{target_key}:forbids:{tag_key}",
                        kind=ConstraintKind.FORBID_TAG,
                        target_key=target_key,
                        payload={"tag": tag_key, "value": tag_value},
                        severity="error",
                    )
                )

            # `any` group → merge as soft desired tags
            for tag_key, tag_value in tag_groups["any"].items():
                boost_tags = {**boost_tags, tag_key: tag_value}

            if boost_tags:
                desired_tags_by_target[target_key] = dict(boost_tags)
            if avoid_tags:
                avoid_tags_by_target[target_key] = dict(avoid_tags)

        return ResolutionRequest(
            resolver_id=resolver_id or "next_v1",
            seed=None,
            intent=ResolutionIntent(
                control_values=dict(control_values or {}),
                desired_tags_by_target=desired_tags_by_target,
                avoid_tags_by_target=avoid_tags_by_target,
                desired_features_by_target={},
                required_capabilities_by_target=required_capabilities_by_target,
                targets=targets,
            ),
            candidates_by_target=candidates_by_target,
            constraints=constraints,
            debug=ResolutionDebugOptions(include_trace=True, include_candidate_scores=True),
            context={
                "template_id": str(template.id),
                "template_slug": str(template.slug),
                "template_name": str(template.name),
                "compiler": self.compiler_id,
                "candidate_limit": int(candidate_limit),
            },
        )
