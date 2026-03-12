"""ActionBlock <-> Asset Fit Scoring.

Heuristic scoring to determine how well an ActionBlock fits a specific asset/image
based on ontology-aligned tags, with optional context-aware op/signature bonuses
and optional sequence-aware continuation signals.
"""
from typing import Dict, Any, Optional, Tuple, List, Set
from typing import Protocol, runtime_checkable

from pixsim7.backend.main.services.prompt.block.op_signatures import get_op_signature
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags


@runtime_checkable
class TagsCarrier(Protocol):
    tags: Dict[str, Any]


# ---- Context-aware scoring constants ----

# Bonus when parser-provided op_id matches the block's own op metadata
OP_MATCH_BONUS = 0.10
# Bonus when signature families align (e.g. both camera.motion.*)
SIGNATURE_FAMILY_BONUS = 0.05
# Penalty when parser says the prompt targets a different op family than the block
OP_FAMILY_MISMATCH_PENALTY = 0.08
# Bonus when the asset modality is in the signature's allowed modalities
MODALITY_ALIGNMENT_BONUS = 0.03


# ---- Sequence-aware scoring constants ----

CONTINUATION_REF_MATCH_BONUS = 0.08
CONTINUATION_REF_MISS_PENALTY = 0.10
CONTINUATION_RELATION_MATCH_BONUS = 0.06
CONTINUATION_RELATION_MISS_PENALTY = 0.08


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
            contributions.append(
                {
                    "factor": "op_id_match",
                    "delta": OP_MATCH_BONUS,
                    "detail": f"exact op_id match: {ctx_op_id}",
                }
            )
        else:
            # Check family-level match (e.g. "camera.motion.pan" vs "camera.motion.tilt")
            ctx_family = ".".join(ctx_op_id.split(".")[:2])
            block_family = ".".join(block_op_id.split(".")[:2])
            if ctx_family == block_family:
                delta += SIGNATURE_FAMILY_BONUS
                contributions.append(
                    {
                        "factor": "op_family_match",
                        "delta": SIGNATURE_FAMILY_BONUS,
                        "detail": f"same op family: {ctx_family}",
                    }
                )
            else:
                delta -= OP_FAMILY_MISMATCH_PENALTY
                contributions.append(
                    {
                        "factor": "op_family_mismatch",
                        "delta": -OP_FAMILY_MISMATCH_PENALTY,
                        "detail": (
                            f"different op families: context={ctx_family}, block={block_family}"
                        ),
                    }
                )

    # 2) Signature alignment
    if ctx_signature_id and block_signature_id and not ctx_op_id:
        # Only apply signature bonus if we did not already score via op_id.
        if ctx_signature_id == block_signature_id:
            delta += SIGNATURE_FAMILY_BONUS
            contributions.append(
                {
                    "factor": "signature_match",
                    "delta": SIGNATURE_FAMILY_BONUS,
                    "detail": f"signature match: {ctx_signature_id}",
                }
            )

    # 3) Modality alignment
    if ctx_modality and ctx_signature_id:
        sig = get_op_signature(ctx_signature_id)
        if sig and ctx_modality in sig.allowed_modalities:
            delta += MODALITY_ALIGNMENT_BONUS
            contributions.append(
                {
                    "factor": "modality_alignment",
                    "delta": MODALITY_ALIGNMENT_BONUS,
                    "detail": (
                        f"modality '{ctx_modality}' allowed by signature {ctx_signature_id}"
                    ),
                }
            )

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


def _normalize_sequence_role(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"initial", "continuation", "transition"}:
        return normalized
    return "unspecified"


def _normalize_ref_list(value: Any) -> Set[str]:
    if not isinstance(value, list):
        return set()
    normalized: Set[str] = set()
    for item in value:
        token = str(item or "").strip().lower()
        if token:
            normalized.add(token)
    return normalized


def _normalize_relation_set(value: Any) -> Set[str]:
    if not isinstance(value, list):
        return set()
    normalized: Set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            continue
        subject = str(item.get("subject") or "").strip().lower()
        predicate = str(item.get("predicate") or "").strip().lower()
        obj = str(item.get("object") or "").strip().lower()
        if subject and predicate and obj:
            normalized.add(f"{subject}|{predicate}|{obj}")
    return normalized


def _compute_sequence_delta(
    *,
    sequence_context: Dict[str, Any],
    role_in_sequence: str,
) -> Tuple[float, Dict[str, Any]]:
    """Compute additive score delta from sequence/continuity context."""
    delta = 0.0
    contributions: List[Dict[str, Any]] = []

    requested_refs = _normalize_ref_list(sequence_context.get("requested_refs"))
    available_refs = _normalize_ref_list(sequence_context.get("available_refs"))
    requested_relations = _normalize_relation_set(sequence_context.get("requested_relations"))
    available_relations = _normalize_relation_set(sequence_context.get("available_relations"))

    # Continuity checks apply only for continuation/transition frames.
    if role_in_sequence in {"continuation", "transition"}:
        if requested_refs:
            matched_refs = requested_refs & available_refs
            missing_refs = requested_refs - available_refs
            match_fraction = len(matched_refs) / len(requested_refs)
            miss_fraction = len(missing_refs) / len(requested_refs)
            refs_delta = (match_fraction * CONTINUATION_REF_MATCH_BONUS) - (
                miss_fraction * CONTINUATION_REF_MISS_PENALTY
            )
            delta += refs_delta
            contributions.append(
                {
                    "factor": "continuation_refs",
                    "delta": round(refs_delta, 4),
                    "detail": (
                        f"matched={len(matched_refs)}/{len(requested_refs)}, "
                        f"missing={len(missing_refs)}"
                    ),
                    "matched_refs": sorted(matched_refs),
                    "missing_refs": sorted(missing_refs),
                }
            )

        if requested_relations:
            matched_relations = requested_relations & available_relations
            missing_relations = requested_relations - available_relations
            match_fraction = len(matched_relations) / len(requested_relations)
            miss_fraction = len(missing_relations) / len(requested_relations)
            relations_delta = (match_fraction * CONTINUATION_RELATION_MATCH_BONUS) - (
                miss_fraction * CONTINUATION_RELATION_MISS_PENALTY
            )
            delta += relations_delta
            contributions.append(
                {
                    "factor": "continuation_relations",
                    "delta": round(relations_delta, 4),
                    "detail": (
                        f"matched={len(matched_relations)}/{len(requested_relations)}, "
                        f"missing={len(missing_relations)}"
                    ),
                    "matched_relations": sorted(matched_relations),
                    "missing_relations": sorted(missing_relations),
                }
            )

    details = {
        "context_provided": True,
        "role_in_sequence": role_in_sequence,
        "sequence_delta": round(delta, 4),
        "contributions": contributions,
        "input": {
            "requested_refs": sorted(requested_refs),
            "available_refs": sorted(available_refs),
            "requested_relations": sorted(requested_relations),
            "available_relations": sorted(available_relations),
        },
    }
    return delta, details


def compute_block_asset_fit(
    block: TagsCarrier,
    asset_tags: Dict[str, Any],
    parser_context: Optional[Dict[str, Any]] = None,
    sequence_context: Optional[Dict[str, Any]] = None,
    role_in_sequence: str = "unspecified",
) -> Tuple[float, Dict[str, Any]]:
    """Compute a heuristic fit score between an ActionBlock and an asset.

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

        Sequence layer (applied when sequence_context is provided):
        - Additive continuation/transition bonuses/penalties for entity refs
          and relation continuity.
        - Initial scenes remain neutral for continuity checks.

    Args:
        block: Block-like object with ``tags`` to evaluate
        asset_tags: Dict with "ontology_ids" from tag_asset_from_metadata
        parser_context: Optional dict with keys: op_id, signature_id, modality,
            primitive_match (from primitive_projection parser output)
        sequence_context: Optional dict with keys:
            requested_refs, available_refs, requested_relations, available_relations
        role_in_sequence: initial|continuation|transition|unspecified

    Returns:
        Tuple of (score, details_dict)
    """
    # Extract ontology IDs from block and asset.
    block_ontology_ids: List[str] = extract_ontology_ids_from_tags(block.tags)
    asset_ontology_ids: List[str] = asset_tags.get("ontology_ids", [])

    # Convert to sets for easier matching.
    block_ids_set: Set[str] = set(block_ontology_ids)
    asset_ids_set: Set[str] = set(asset_ontology_ids)

    # Categorize block IDs into required vs. soft.
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
        # Everything else is soft: mood, intensity, speed, beats, etc.
        else:
            soft_ids.add(oid)

    # Compute matches and misses.
    required_matches = required_ids & asset_ids_set
    required_misses = required_ids - asset_ids_set
    soft_matches = soft_ids & asset_ids_set

    # Scoring weights.
    required_miss_penalty = 0.3  # Each required miss costs 30%
    soft_match_bonus = 0.1       # Each soft match adds 10%

    # Base score starts at 1.0 (perfect).
    base_score = 1.0

    # Apply penalties for required misses.
    if required_ids:
        miss_fraction = len(required_misses) / len(required_ids)
        base_score -= miss_fraction * required_miss_penalty

    # Apply bonuses for soft matches.
    if soft_ids:
        match_fraction = len(soft_matches) / len(soft_ids)
        base_score += match_fraction * soft_match_bonus

    # Clamp base to [0.0, 1.0].
    base_score = max(0.0, min(1.0, base_score))

    # Context-aware layer.
    context_delta = 0.0
    context_details: Dict[str, Any] = {"context_provided": False}
    if parser_context:
        context_delta, context_details = _compute_context_delta(block, parser_context)

    # Sequence-aware layer.
    normalized_role = _normalize_sequence_role(role_in_sequence)
    sequence_delta = 0.0
    sequence_details: Dict[str, Any] = {
        "context_provided": False,
        "role_in_sequence": normalized_role,
    }
    if sequence_context:
        # If caller omitted role but provided continuity targets, treat as continuation.
        if normalized_role == "unspecified":
            if _normalize_ref_list(sequence_context.get("requested_refs")) or _normalize_relation_set(
                sequence_context.get("requested_relations")
            ):
                normalized_role = "continuation"
        sequence_delta, sequence_details = _compute_sequence_delta(
            sequence_context=sequence_context,
            role_in_sequence=normalized_role,
        )

    # Final score = base + context delta + sequence delta, clamped.
    score = max(0.0, min(1.0, base_score + context_delta + sequence_delta))

    # Build details dict.
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
            "required_miss_penalty": required_miss_penalty,
            "soft_match_bonus": soft_match_bonus,
        },
        "context": context_details,
        "sequence": sequence_details,
    }

    return score, details


def explain_fit_score(details: Dict[str, Any]) -> str:
    """Generate human-readable explanation of a fit score."""
    lines = []
    score = details.get("score", 0.0)

    lines.append(f"Fit Score: {score:.2f} (0.0 = poor, 1.0 = perfect)")
    lines.append("")

    # Base vs context breakdown.
    base_score = details.get("base_score")
    context = details.get("context", {})
    sequence = details.get("sequence", {})
    if base_score is not None and (context.get("context_provided") or sequence.get("context_provided")):
        context_delta = context.get("context_delta", 0.0)
        sequence_delta = sequence.get("sequence_delta", 0.0)
        lines.append(
            f"Base: {base_score:.2f} + Context: {context_delta:+.2f} + Sequence: {sequence_delta:+.2f}"
        )
        lines.append("")

    # Required matches/misses.
    required_matches = details.get("required_matches", [])
    required_misses = details.get("required_misses", [])

    if required_matches or required_misses:
        lines.append("Required Tags (camera/spatial):")
        if required_matches:
            lines.append(f"  Matched: {', '.join(required_matches)}")
        if required_misses:
            lines.append(f"  Missing: {', '.join(required_misses)}")
        lines.append("")

    # Soft matches.
    soft_matches = details.get("soft_matches", [])
    if soft_matches:
        lines.append(f"Soft Matches (mood/intensity/beat): {', '.join(soft_matches)}")
        lines.append("")

    # Context contributions.
    if context.get("context_provided"):
        contributions = context.get("contributions", [])
        if contributions:
            lines.append("Context Contributions:")
            for c in contributions:
                lines.append(f"  {c['factor']}: {c['delta']:+.2f} ({c['detail']})")
            lines.append("")

    # Sequence contributions.
    if sequence.get("context_provided"):
        contributions = sequence.get("contributions", [])
        if contributions:
            lines.append("Sequence Contributions:")
            for c in contributions:
                lines.append(f"  {c['factor']}: {c['delta']:+.2f} ({c['detail']})")
            lines.append("")

    # Tag comparison.
    block_ids = details.get("block_ontology_ids", [])
    asset_ids = details.get("asset_ontology_ids", [])

    if block_ids and not asset_ids:
        lines.append("Asset has no ontology tags (possibly no generation prompt)")
    elif not block_ids:
        lines.append("Block has no ontology tags")

    return "\n".join(lines)
