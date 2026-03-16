"""
Action Block Node Resolver.

Resolves ActionBlockNode into executable sequences using the primitives-first
planner -> compiler -> resolver pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import (
    ActionSelectionContext,
    BranchIntent,
)
from pixsim7.backend.main.domain.narrative.runtime_action_assembly import (
    prompts_from_blocks,
    segments_from_blocks,
    total_duration_from_blocks,
)
from pixsim7.backend.main.domain.narrative.schema import ActionBlockNode
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.composition_role_inference import (
    infer_composition_role,
)
from pixsim7.backend.main.services.prompt.block.compiler_core import (
    build_default_compiler_registry,
    slot_target_key,
)
from pixsim7.backend.main.services.prompt.block.dynamic_slot_planner import (
    ComposerPlanRequest,
    DynamicSlotPlanner,
)
from pixsim7.backend.main.services.prompt.block.resolution_core import (
    build_default_resolver_registry,
)
from pixsim7.backend.main.services.prompt.block.resolution_core.types import (
    CandidateBlock,
)


_RUNTIME_COMPILER_ID = "compiler_v1"
_RUNTIME_RESOLVER_ID = "next_v1"
_RUNTIME_CANDIDATE_LIMIT = 4096
_DEFAULT_DURATION_SEC = 6.0
_compiler_registry = build_default_compiler_registry()
_resolver_registry = build_default_resolver_registry()
_slot_planner = DynamicSlotPlanner()


@dataclass
class ActionBlockSequence:
    """
    Resolved action block sequence ready for generation.
    """
    # List of action block data
    blocks: List[Dict[str, Any]]

    # Total duration in seconds
    total_duration: float

    # Resolved prompts for generation
    prompts: List[str]

    # Generation segments
    segments: List[Dict[str, Any]]

    # Compatibility score (0.0-1.0)
    compatibility_score: float

    # Was fallback used?
    fallback_reason: Optional[str] = None

    # Composition strategy used
    composition: str = "sequential"


# Primitives-first alias retained for newer integrations.
PrimitiveBlockSequence = ActionBlockSequence


def _coerce_str_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    if isinstance(value, list):
        return [str(part).strip() for part in value if str(part).strip()]
    return []


def _coerce_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except (TypeError, ValueError):
        return None


def _canonical_branch_intent(value: Any) -> Optional[BranchIntent]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if ":" not in text:
        text = f"branch:{text}"
    try:
        return BranchIntent(text)
    except ValueError:
        return None


def _duration_from_tags(tags: Dict[str, Any]) -> float:
    for key in ("duration_sec", "duration_seconds", "duration"):
        raw = tags.get(key)
        value = _coerce_float(raw)
        if value is not None and value > 0:
            return value
    return _DEFAULT_DURATION_SEC


def _source_pack_from_tags(tags: Dict[str, Any]) -> Optional[str]:
    raw = tags.get("source_pack")
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    return value or None


def _build_runtime_block(
    *,
    block_id: str,
    text: str,
    category: Optional[str],
    tags: Dict[str, Any],
) -> Dict[str, Any]:
    inferred = infer_composition_role(role=None, category=category, tags=tags)
    package_name = _source_pack_from_tags(tags)
    duration_sec = _duration_from_tags(tags)
    return {
        "id": block_id,
        "blockId": block_id,
        "block_id": block_id,
        "prompt": text,
        "text": text,
        "durationSec": duration_sec,
        "role": inferred.role_id,
        "category": category,
        "package_name": package_name,
        "tags": dict(tags),
        "source": "primitives",
    }


def _candidate_to_runtime_block(candidate: CandidateBlock, *, text_override: Optional[str] = None) -> Dict[str, Any]:
    return _build_runtime_block(
        block_id=str(candidate.block_id),
        text=str(text_override if text_override is not None else candidate.text or ""),
        category=(str(candidate.category) if candidate.category is not None else None),
        tags=dict(candidate.tags or {}),
    )


def _primitive_to_runtime_block(primitive: BlockPrimitive) -> Dict[str, Any]:
    tags = primitive.tags if isinstance(getattr(primitive, "tags", None), dict) else {}
    return _build_runtime_block(
        block_id=str(primitive.block_id),
        text=str(getattr(primitive, "text", "") or ""),
        category=(str(primitive.category) if primitive.category is not None else None),
        tags=tags,
    )


def _find_candidate_by_block_id(candidates: Iterable[CandidateBlock], block_id: str) -> Optional[CandidateBlock]:
    wanted = str(block_id)
    for candidate in candidates:
        if str(candidate.block_id) == wanted:
            return candidate
    return None


def _layer_rank(role: Optional[str]) -> int:
    if role == "setting":
        return 0
    if role == "character":
        return 1
    if role == "action":
        return 2
    if role == "camera":
        return 3
    if role == "mood":
        return 4
    return 5


def _ordered_blocks_for_composition(blocks: List[Dict[str, Any]], composition: str) -> List[Dict[str, Any]]:
    if composition != "layered":
        return list(blocks)
    indexed = list(enumerate(blocks))
    indexed.sort(key=lambda pair: (_layer_rank(pair[1].get("role")), pair[0]))
    return [item for _, item in indexed]


def _trim_to_duration_budget(
    blocks: List[Dict[str, Any]],
    max_duration: Optional[float],
) -> tuple[List[Dict[str, Any]], bool]:
    if max_duration is None or max_duration <= 0:
        return list(blocks), False

    kept: List[Dict[str, Any]] = []
    elapsed = 0.0
    for block in blocks:
        duration = _coerce_float(block.get("durationSec")) or _DEFAULT_DURATION_SEC
        if kept and elapsed + duration > max_duration:
            break
        kept.append(block)
        elapsed += duration
    truncated = len(kept) < len(blocks)
    return kept, truncated


async def _load_primitives_by_block_id(block_ids: List[str]) -> Dict[str, BlockPrimitive]:
    if not block_ids:
        return {}
    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(
            select(BlockPrimitive).where(BlockPrimitive.block_id.in_(block_ids))
        )
        rows = list(result.scalars().all())
    return {str(row.block_id): row for row in rows}


async def resolve_action_block_node(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
) -> ActionBlockSequence:
    """
    Resolve an ActionBlockNode into an executable action block sequence.

    Args:
        node: ActionBlockNode to resolve
        context: Runtime context (NPC, world, session, relationship data)
        db: Database session

    Returns:
        ActionBlockSequence with resolved blocks and prompts
    """
    if node.mode == "direct":
        return await _resolve_direct_blocks(
            node,
            context,
            db,
        )
    if node.mode == "query":
        return await _resolve_query_blocks(
            node,
            context,
            db,
        )
    raise ValueError(f"Unknown ActionBlockNode mode: {node.mode}")


async def resolve_primitive_node(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
) -> PrimitiveBlockSequence:
    """
    Primitives-first alias for resolving a narrative action block node.
    """
    return await resolve_action_block_node(node, context, db)


async def _resolve_direct_blocks(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
) -> ActionBlockSequence:
    """
    Resolve direct primitive block IDs.

    Args:
        node: ActionBlockNode with block_ids
        context: Runtime context
        db: Database session

    Returns:
        ActionBlockSequence
    """
    if not node.block_ids:
        raise ValueError("ActionBlockNode mode='direct' requires block_ids")

    requested_ids = [str(value).strip() for value in node.block_ids if str(value).strip()]
    primitives_by_id = await _load_primitives_by_block_id(requested_ids)
    missing_ids = [value for value in requested_ids if value not in primitives_by_id]
    if missing_ids:
        raise ValueError(f"Primitive block(s) not found: {', '.join(missing_ids)}")

    blocks = [_primitive_to_runtime_block(primitives_by_id[block_id]) for block_id in requested_ids]
    composition = node.composition or "sequential"
    blocks = _ordered_blocks_for_composition(blocks, composition)
    prompts = prompts_from_blocks(blocks)
    segments = segments_from_blocks(blocks)
    total_duration = total_duration_from_blocks(blocks)

    return ActionBlockSequence(
        blocks=blocks,
        total_duration=total_duration,
        prompts=prompts,
        segments=segments,
        compatibility_score=1.0,
        composition=composition,
    )


async def _resolve_query_blocks(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
) -> ActionBlockSequence:
    """
    Resolve blocks using query parameters and primitives planner/compiler/resolver.

    Args:
        node: ActionBlockNode with query parameters
        context: Runtime context
        db: Database session

    Returns:
        ActionBlockSequence
    """
    if not node.query:
        raise ValueError("ActionBlockNode mode='query' requires query parameters")

    query = node.query

    # Extract or compute selection context parameters
    location_tag = query.get("location")
    pose = query.get("pose")
    intimacy_level = query.get("intimacy_level")
    mood = query.get("mood")
    branch_intent = query.get("branch_intent")
    required_tags = _coerce_str_list(query.get("requiredTags") or query.get("required_tags"))
    exclude_tags = _coerce_str_list(query.get("excludeTags") or query.get("exclude_tags"))
    max_duration = _coerce_float(query.get("maxDuration") or query.get("max_duration"))
    package_name = query.get("package_name") or query.get("packageName")
    include_categories = _coerce_str_list(query.get("includeCategories") or query.get("include_categories"))
    exclude_categories = _coerce_str_list(query.get("excludeCategories") or query.get("exclude_categories"))
    prefer_granular = _coerce_bool(query.get("preferGranular"), default=True)

    # Get NPC and session info from context
    npc_id = context.get("npc", {}).get("id")
    partner_npc_id = context.get("partner_npc", {}).get("id")

    # Compute intimacy level from relationship if not provided
    if not intimacy_level and "relationship" in context:
        rel = context["relationship"]
        # Use StatEngine for intimacy computation
        from pixsim7.backend.main.domain.game.stats import StatEngine
        from pixsim7.backend.main.domain.game.stats.migration import (
            get_default_relationship_definition,
            resolve_stats_config,
        )

        world_meta = context.get("world", {}).get("meta", {})

        # Get or migrate stats config
        stats_config = resolve_stats_config(world_meta)

        # Get relationship definition
        relationship_definition = stats_config.definitions.get("relationships")
        if not relationship_definition:
            relationship_definition = get_default_relationship_definition()

        # Compute intimacy level using StatEngine
        relationship_values = {
            "affinity": rel.get("affinity", 50.0),
            "trust": rel.get("trust", 50.0),
            "chemistry": rel.get("chemistry", 50.0),
            "tension": rel.get("tension", 0.0)
        }
        intimacy_level = StatEngine.compute_level(
            relationship_values,
            relationship_definition.levels
        )

    # Build canonicalized selection context.
    selection_context = ActionSelectionContext(
        locationTag=location_tag,
        pose=pose,
        intimacy_level=intimacy_level,
        mood=mood,
        branchIntent=_canonical_branch_intent(branch_intent),
        leadNpcId=npc_id,
        partnerNpcId=partner_npc_id,
        requiredTags=required_tags,
        excludeTags=exclude_tags,
        maxDuration=max_duration,
    )

    plan_request = ComposerPlanRequest.from_action_selection_context(
        selection_context,
        block_source="primitives",
        package_name=(str(package_name).strip() if package_name is not None else None),
        prefer_granular=prefer_granular,
        include_categories=include_categories,
        exclude_categories=exclude_categories,
    )
    slot_plan = _slot_planner.plan(plan_request)

    runtime_template = SimpleNamespace(
        id=f"runtime:{node.id}",
        slug=f"runtime:{node.id}",
        name=(node.label or node.id or "runtime_action_block_node"),
        slots=slot_plan.slots,
        template_metadata={
            "source": "narrative_runtime",
            "planner_id": slot_plan.planner_id,
            "planner_decisions": [decision.model_dump() for decision in slot_plan.decisions],
        },
    )

    from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService

    service = BlockTemplateService(db)
    compiler = _compiler_registry.get(_RUNTIME_COMPILER_ID)
    compiled_request = await compiler.compile(
        service=service,
        template=runtime_template,
        candidate_limit=_RUNTIME_CANDIDATE_LIMIT,
        control_values=None,
        exclude_block_ids=None,
        resolver_id=_RUNTIME_RESOLVER_ID,
    )
    compiled_request.seed = _coerce_int(query.get("seed"))
    resolver_result = _resolver_registry.resolve(compiled_request)

    warnings: List[str] = list(slot_plan.warnings)
    selected_blocks: List[Dict[str, Any]] = []
    required_slots_total = 0
    required_slots_selected = 0

    for idx, slot in enumerate(slot_plan.slots):
        if str(slot.get("kind") or "").strip() in {"reinforcement", "audio_cue"}:
            continue

        optional = bool(slot.get("optional", False))
        if not optional:
            required_slots_total += 1

        target_key = slot_target_key(slot, idx)
        selected = resolver_result.selected_by_target.get(target_key)
        if selected is None:
            if not optional:
                warnings.append(f"Required slot '{target_key}' unresolved")
            continue

        candidate = _find_candidate_by_block_id(
            compiled_request.candidates_by_target.get(target_key) or [],
            selected.block_id,
        )
        if candidate is not None:
            runtime_block = _candidate_to_runtime_block(candidate, text_override=selected.text)
        else:
            selected_tags = selected.metadata.get("tags") if isinstance(selected.metadata, dict) else {}
            tags = dict(selected_tags) if isinstance(selected_tags, dict) else {}
            runtime_block = _build_runtime_block(
                block_id=str(selected.block_id),
                text=str(selected.text or ""),
                category=None,
                tags=tags,
            )
            warnings.append(
                f"Selected block '{selected.block_id}' missing from target '{target_key}' candidates; using resolver payload"
            )

        selected_blocks.append(runtime_block)
        if not optional:
            required_slots_selected += 1

    composition = node.composition or "sequential"
    selected_blocks = _ordered_blocks_for_composition(selected_blocks, composition)
    selected_blocks, truncated = _trim_to_duration_budget(selected_blocks, max_duration)
    if truncated:
        warnings.append("Selection truncated to satisfy maxDuration budget")

    prompts = prompts_from_blocks(selected_blocks)
    segments = segments_from_blocks(selected_blocks)
    total_duration = total_duration_from_blocks(selected_blocks)

    if required_slots_total > 0:
        compatibility_score = min(1.0, max(0.0, required_slots_selected / required_slots_total))
    else:
        compatibility_score = 1.0 if selected_blocks else 0.0

    fallback_reason = None
    if not selected_blocks:
        fallback_reason = "No matching primitive blocks found"
    elif warnings:
        fallback_reason = warnings[0]

    return ActionBlockSequence(
        blocks=selected_blocks,
        total_duration=total_duration,
        prompts=prompts,
        segments=segments,
        compatibility_score=compatibility_score,
        fallback_reason=fallback_reason,
        composition=composition,
    )

async def prepare_generation_from_sequence(
    sequence: ActionBlockSequence,
    node: ActionBlockNode,
    context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Prepare generation request from resolved action block sequence.

    Args:
        sequence: Resolved action block sequence
        node: Original ActionBlockNode (for generation config)
        context: Runtime context

    Returns:
        Generation request dict ready for /api/v1/generations
    """
    gen_config = node.generation_config or {}

    # Build social context from runtime context
    social_context = gen_config.get("socialContext", {})

    # Merge relationship data
    if "relationship" in context:
        rel = context["relationship"]
        social_context.update({
            "affinity": rel.get("affinity", 50.0),
            "trust": rel.get("trust", 50.0),
            "chemistry": rel.get("chemistry", 50.0),
            "tension": rel.get("tension", 0.0),
            "relationshipTier": rel.get("relationship_tier"),
            "intimacyLevel": rel.get("intimacy_level")
        })

    # Merge NPC data
    if "npc" in context:
        npc = context["npc"]
        social_context.update({
            "npcId": npc.get("id"),
            "npcName": npc.get("name"),
            "personality": npc.get("personality", {})
        })

    prompt_parts = [str(prompt).strip() for prompt in sequence.prompts if str(prompt).strip()]
    assembled_prompt = " ".join(prompt_parts).strip()

    # Build generation request
    request = {
        "provider": gen_config.get("provider", "default"),
        "actionBlocks": sequence.blocks,
        "prompts": sequence.prompts,
        "assembledPrompt": assembled_prompt,
        "socialContext": social_context,
        "composition": sequence.composition,
        "metadata": {
            "source": "narrative_runtime",
            "nodeId": node.id,
            "nodeLabel": node.label,
            "compatibilityScore": sequence.compatibility_score,
            "fallbackReason": sequence.fallback_reason
        }
    }

    return request


def should_launch_immediately(node: ActionBlockNode) -> bool:
    """
    Check if generation should launch immediately vs. being stored as pending.

    Args:
        node: ActionBlockNode

    Returns:
        True if should launch immediately
    """
    return node.launch_mode == "immediate"
