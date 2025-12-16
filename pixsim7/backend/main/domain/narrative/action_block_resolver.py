"""
Action Block Node Resolver

Resolves ActionBlockNode into executable action block sequences using the existing
ActionEngine infrastructure.

This bridges the narrative runtime system with the action blocks system.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.narrative.schema import ActionBlockNode
from pixsim7.backend.main.domain.narrative.action_blocks import (
    ActionEngine,
    ActionSelectionContext,
    BranchIntent,
)


# ============================================================================
# Result Types
# ============================================================================

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


# ============================================================================
# Resolver
# ============================================================================

async def resolve_action_block_node(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
    action_engine: Optional[ActionEngine] = None
) -> ActionBlockSequence:
    """
    Resolve an ActionBlockNode into an executable action block sequence.

    Args:
        node: ActionBlockNode to resolve
        context: Runtime context (NPC, world, session, relationship data)
        db: Database session
        action_engine: Optional ActionEngine instance (creates new if None)

    Returns:
        ActionBlockSequence with resolved blocks and prompts
    """
    # Create action engine if not provided
    if action_engine is None:
        from pixsim7.backend.main.domain.narrative import NarrativeEngine
        narrative_engine = NarrativeEngine()
        action_engine = ActionEngine(narrative_engine=narrative_engine)

    if node.mode == "direct":
        # Direct block IDs - fetch and compose
        return await _resolve_direct_blocks(
            node,
            context,
            db,
            action_engine
        )
    elif node.mode == "query":
        # Query-based selection
        return await _resolve_query_blocks(
            node,
            context,
            db,
            action_engine
        )
    else:
        raise ValueError(f"Unknown ActionBlockNode mode: {node.mode}")


async def _resolve_direct_blocks(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
    action_engine: ActionEngine
) -> ActionBlockSequence:
    """
    Resolve direct block IDs.

    Args:
        node: ActionBlockNode with block_ids
        context: Runtime context
        db: Database session
        action_engine: ActionEngine instance

    Returns:
        ActionBlockSequence
    """
    if not node.block_ids:
        raise ValueError("ActionBlockNode mode='direct' requires block_ids")

    # Fetch blocks from engine
    blocks = []
    total_duration = 0.0
    prompts = []
    segments = []

    for block_id in node.block_ids:
        block = action_engine.blocks.get(block_id)
        if not block:
            # Try generated store
            generated_block = await action_engine.generated_store.get_block_by_id(
                db, block_id
            )
            if generated_block:
                block_data = generated_block.to_dict()
                blocks.append(block_data)
                total_duration += block_data.get("durationSec", 6.0)
                prompts.append(block_data.get("prompt", ""))
                segments.append({
                    "blockId": block_id,
                    "duration": block_data.get("durationSec", 6.0),
                    "prompt": block_data.get("prompt", "")
                })
            else:
                raise ValueError(f"Block not found: {block_id}")
        else:
            block_data = block.dict()
            blocks.append(block_data)
            total_duration += block.durationSec
            prompts.append(block.prompt)
            segments.append({
                "blockId": block_id,
                "duration": block.durationSec,
                "prompt": block.prompt
            })

    return ActionBlockSequence(
        blocks=blocks,
        total_duration=total_duration,
        prompts=prompts,
        segments=segments,
        compatibility_score=1.0,  # Direct selection = perfect match
        composition=node.composition or "sequential"
    )


async def _resolve_query_blocks(
    node: ActionBlockNode,
    context: Dict[str, Any],
    db: AsyncSession,
    action_engine: ActionEngine
) -> ActionBlockSequence:
    """
    Resolve blocks using query parameters and ActionEngine selection.

    Args:
        node: ActionBlockNode with query parameters
        context: Runtime context
        db: Database session
        action_engine: ActionEngine instance

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
    required_tags = query.get("requiredTags", [])
    exclude_tags = query.get("excludeTags", [])
    max_duration = query.get("maxDuration")

    # Get NPC and session info from context
    npc_id = context.get("npc", {}).get("id")
    partner_npc_id = context.get("partner_npc", {}).get("id")
    previous_block_id = context.get("previous_block_id")

    # Compute intimacy level from relationship if not provided
    if not intimacy_level and "relationship" in context:
        rel = context["relationship"]
        # Use StatEngine for intimacy computation
        from pixsim7.backend.main.domain.game.stats import StatEngine
        from pixsim7.backend.main.domain.game.stats.migration import (
            migrate_world_meta_to_stats_config,
            needs_migration as needs_world_migration,
            get_default_relationship_definition,
        )

        world_meta = context.get("world", {}).get("meta", {})

        # Get or migrate stats config
        if needs_world_migration(world_meta):
            stats_config = migrate_world_meta_to_stats_config(world_meta)
        elif 'stats_config' in world_meta:
            from pixsim7.backend.main.domain.game.stats import WorldStatsConfig
            stats_config = WorldStatsConfig.model_validate(world_meta['stats_config'])
        else:
            from pixsim7.backend.main.domain.game.stats import WorldStatsConfig
            stats_config = WorldStatsConfig(
                version=1,
                definitions={"relationships": get_default_relationship_definition()}
            )

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

    # Build ActionSelectionContext
    selection_context = ActionSelectionContext(
        locationTag=location_tag,
        pose=pose,
        intimacy_level=intimacy_level,
        mood=mood,
        branchIntent=BranchIntent(branch_intent) if branch_intent else None,
        previousBlockId=previous_block_id,
        leadNpcId=npc_id,
        partnerNpcId=partner_npc_id,
        requiredTags=required_tags,
        excludeTags=exclude_tags,
        maxDuration=max_duration
    )

    # Call ActionEngine to select blocks
    result = await action_engine.select_actions(selection_context, db)

    # Convert to ActionBlockSequence
    return ActionBlockSequence(
        blocks=[block.dict() for block in result.blocks],
        total_duration=result.totalDuration,
        prompts=result.prompts,
        segments=result.segments,
        compatibility_score=result.compatibilityScore,
        fallback_reason=result.fallbackReason,
        composition=node.composition or "sequential"
    )


# ============================================================================
# Generation Launch Helpers
# ============================================================================

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

    # Build generation request
    request = {
        "provider": gen_config.get("provider", "default"),
        "actionBlocks": sequence.blocks,
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
