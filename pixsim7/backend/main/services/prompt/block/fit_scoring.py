"""ActionBlock ↔ Asset Fit Scoring

Heuristic scoring to determine how well an ActionBlock fits a specific asset/image
based on ontology-aligned tags, with optional context-aware op/signature bonuses.
"""
from typing import Dict, Any, Optional, Tuple, List, Set
from typing import Protocol, runtime_checkable
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags
from pixsim7.backend.main.services.prompt.block.op_signatures import get_op_signature


@runtime_checkable
class TagsCarrier(Protocol):
    tags: Dict[str, Any]


# ---- Context-aware scoring constants ----

# Bonus when parser-provided op_id matches the block's own op metadata
OP_MATCH_BONUS = 0.10
# Bonus when signature families align (e.g. both camera.motion.*)
SIGNATURE_FAMILY_BONUS = 0.05
# Penalty when parser says the prompt targets a *different* op family than the block
OP_FAMILY_MISMATCH_PENALTY = 0.08
# Bonus when the asset modality is in the signature's allowed modalities
MODALITY_ALIGNMENT_BONUS = 0.03


def _compute_context_delta(
    block: TagsCarrier,
    parser_context: Dict[str, Any],
) -> Tuple[float, Dict[str, Any]]:
    """Compute additive score delta from parser-provided context.

    Returns (delta, context_details) where delta can be positive or negative.
    """
    delta = 0.0
    contributions: List[Dict[str, Any]] = []

    ctx_op_id: Optional[str] = parser_context.get("op_id")
    ctx_signature_id: Optional[str] = parser_context.get("signature_id")
    ctx_modality: Optional[str] = parser_context.get("modality")

    # Extract block's own op metadata (if any)
    block_op = block.tags.get("op") if isinstance(block.tags, dict) else None
    if isinstance(block_op, dict):
        block_op_id = block_op.get("op_id")
        block_signature_id = block_op.get("signature_id")
    else:
        block_op_id = None
        block_signature_id = None

    # 1) Direct op_id match
    if ctx_op_id and block_op_id:
        if ctx_op_id == block_op_id:
            delta += OP_MATCH_BONUS
            contributions.append({
                "factor": "op_id_match",
                "delta": OP_MATCH_BONUS,
                "detail": f"exact op_id match: {ctx_op_id}",
            })
        else:
            # Check family-level match (e.g. "camera.motion.pan" vs "camera.motion.tilt")
            ctx_family = ".".join(ctx_op_id.split(".")[:2])
            block_family = ".".join(block_op_id.split(".")[:2])
            if ctx_family == block_family:
                delta += SIGNATURE_FAMILY_BONUS
                contributions.append({
                    "factor": "op_family_match",
                    "delta": SIGNATURE_FAMILY_BONUS,
                    "detail": f"same op family: {ctx_family}",
                })
            else:
                delta -= OP_FAMILY_MISMATCH_PENALTY
                contributions.append({
                    "factor": "op_family_mismatch",
                    "delta": -OP_FAMILY_MISMATCH_PENALTY,
                    "detail": f"different op families: context={ctx_family}, block={block_family}",
                })

    # 2) Signature alignment
    if ctx_signature_id and block_signature_id and not ctx_op_id:
        # Only apply signature bonus if we didn't already score via op_id
        if ctx_signature_id == block_signature_id:
            delta += SIGNATURE_FAMILY_BONUS
            contributions.append({
                "factor": "signature_match",
                "delta": SIGNATURE_FAMILY_BONUS,
                "detail": f"signature match: {ctx_signature_id}",
            })

    # 3) Modality alignment
    if ctx_modality and ctx_signature_id:
        sig = get_op_signature(ctx_signature_id)
        if sig and ctx_modality in sig.allowed_modalities:
            delta += MODALITY_ALIGNMENT_BONUS
            contributions.append({
                "factor": "modality_alignment",
                "delta": MODALITY_ALIGNMENT_BONUS,
                "detail": f"modality '{ctx_modality}' allowed by signature {ctx_signature_id}",
            })

    context_details = {
        "context_provided": True,
        "context_delta": round(delta, 4),
        "contributions": contributions,
        "input": {
            "op_id": ctx_op_id,
            "signature_id": ctx_signature_id,
            "modality": ctx_modality,
            "block_op_id": block_op_id,
            "block_signature_id": block_signature_id,
        },
    }

    return delta, context_details


def compute_block_asset_fit(
    block: TagsCarrier,
    asset_tags: Dict[str, Any],
    parser_context: Optional[Dict[str, Any]] = None,
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a heuristic fit score between an ActionBlock and an asset.

    Returns:
        (score, details) where score is 0.0-1.0 and details includes
        reasons (matched_tags, missing_required_tags, etc.).

    Strategy:
        Base layer (always applied):
        - Required matches: camera/spatial ontology IDs penalized if missing.
        - Soft matches: mood/intensity/speed/beat overlap improves score.
        - score = 1.0 - required_miss_penalty + soft_match_bonus, clamped [0,1].

        Context layer (applied when parser_context is provided):
        - Additive op/signature alignment bonuses/penalties.
        - Modality alignment bonus.
        - Parser owns matching; block-fit only scores outcome quality.

    Args:
        block: Block-like object with ``tags`` to evaluate
        asset_tags: Dict with "ontology_ids" from tag_asset_from_metadata
        parser_context: Optional dict with keys: op_id, signature_id, modality,
            primitive_match (from primitive_projection parser output)

    Returns:
        Tuple of (score, details_dict)
    """
    # Extract ontology IDs from block and asset
    block_ontology_ids: List[str] = extract_ontology_ids_from_tags(block.tags)
    asset_ontology_ids: List[str] = asset_tags.get("ontology_ids", [])

    # Convert to sets for easier matching
    block_ids_set: Set[str] = set(block_ontology_ids)
    asset_ids_set: Set[str] = set(asset_ontology_ids)

    # Categorize block IDs into required vs. soft
    required_ids: Set[str] = set()
    soft_ids: Set[str] = set()

    for oid in block_ids_set:
        prefix = oid.split(":")[0] if ":" in oid else ""

        # Canonical camera/spatial IDs are required because they strongly define scene geometry.
        if prefix in ("camera", "spatial"):
            required_ids.add(oid)
        # Controlled schema path: non-canonical legacy camera/relation IDs are ignored.
        elif prefix in ("cam", "rel"):
            continue
        # Everything else is "soft" - mood, intensity, speed, beats, etc.
        else:
            soft_ids.add(oid)

    # Compute matches and misses
    required_matches = required_ids & asset_ids_set
    required_misses = required_ids - asset_ids_set
    soft_matches = soft_ids & asset_ids_set

    # Scoring weights
    REQUIRED_MISS_PENALTY = 0.3  # Each required miss costs 30%
    SOFT_MATCH_BONUS = 0.1       # Each soft match adds 10%

    # Base score starts at 1.0 (perfect)
    base_score = 1.0

    # Apply penalties for required misses
    if required_ids:
        # Penalize based on fraction of required IDs that are missing
        miss_fraction = len(required_misses) / len(required_ids)
        base_score -= miss_fraction * REQUIRED_MISS_PENALTY

    # Apply bonuses for soft matches
    if soft_ids:
        # Bonus based on fraction of soft IDs that match
        match_fraction = len(soft_matches) / len(soft_ids)
        base_score += match_fraction * SOFT_MATCH_BONUS

    # Clamp base to [0.0, 1.0]
    base_score = max(0.0, min(1.0, base_score))

    # Context-aware layer
    context_delta = 0.0
    context_details: Dict[str, Any] = {"context_provided": False}

    if parser_context:
        context_delta, context_details = _compute_context_delta(block, parser_context)

    # Final score = base + context delta, clamped
    score = max(0.0, min(1.0, base_score + context_delta))

    # Build details dict
    details = {
        "score": score,
        "base_score": round(base_score, 4),
        "block_ontology_ids": block_ontology_ids,
        "asset_ontology_ids": asset_ontology_ids,
        "required_matches": list(required_matches),
        "required_misses": list(required_misses),
        "soft_matches": list(soft_matches),
        "scoring": {
            "required_ids_count": len(required_ids),
            "required_matches_count": len(required_matches),
            "required_misses_count": len(required_misses),
            "soft_ids_count": len(soft_ids),
            "soft_matches_count": len(soft_matches),
            "required_miss_penalty": REQUIRED_MISS_PENALTY,
            "soft_match_bonus": SOFT_MATCH_BONUS,
        },
        "context": context_details,
    }

    return score, details


def explain_fit_score(details: Dict[str, Any]) -> str:
    """
    Generate human-readable explanation of a fit score.

    Args:
        details: Details dict from compute_block_asset_fit

    Returns:
        Human-readable explanation string
    """
    lines = []
    score = details.get("score", 0.0)

    lines.append(f"Fit Score: {score:.2f} (0.0 = poor, 1.0 = perfect)")
    lines.append("")

    # Base vs context breakdown
    base_score = details.get("base_score")
    context = details.get("context", {})
    if base_score is not None and context.get("context_provided"):
        context_delta = context.get("context_delta", 0.0)
        lines.append(f"Base: {base_score:.2f} + Context: {context_delta:+.2f}")
        lines.append("")

    # Required matches/misses
    required_matches = details.get("required_matches", [])
    required_misses = details.get("required_misses", [])

    if required_matches or required_misses:
        lines.append("Required Tags (camera/spatial):")
        if required_matches:
            lines.append(f"  ✓ Matched: {', '.join(required_matches)}")
        if required_misses:
            lines.append(f"  ✗ Missing: {', '.join(required_misses)}")
        lines.append("")

    # Soft matches
    soft_matches = details.get("soft_matches", [])
    if soft_matches:
        lines.append(f"Soft Matches (mood/intensity/beat): {', '.join(soft_matches)}")
        lines.append("")

    # Context contributions
    if context.get("context_provided"):
        contributions = context.get("contributions", [])
        if contributions:
            lines.append("Context Contributions:")
            for c in contributions:
                lines.append(f"  {c['factor']}: {c['delta']:+.2f} ({c['detail']})")
            lines.append("")

    # Tag comparison
    block_ids = details.get("block_ontology_ids", [])
    asset_ids = details.get("asset_ontology_ids", [])

    if block_ids and not asset_ids:
        lines.append("⚠ Asset has no ontology tags (possibly no generation prompt)")
    elif not block_ids:
        lines.append("ℹ Block has no ontology tags")

    return "\n".join(lines)
