"""ActionBlock ↔ Asset Fit Scoring

Heuristic scoring to determine how well an ActionBlock fits a specific asset/image
based on ontology-aligned tags.
"""
from typing import Dict, Any, Tuple, List, Set
from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags


def compute_block_asset_fit(
    block: PromptBlock,
    asset_tags: Dict[str, Any],
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a heuristic fit score between an ActionBlock and an asset.

    Returns:
        (score, details) where score is 0.0-1.0 and details includes
        reasons (matched_tags, missing_required_tags, etc.).

    Strategy (first pass):
        - Required matches:
          - If block tags contain canonical camera/spatial IDs
            (e.g. 'camera:angle_pov', 'spatial:depth_foreground'),
            treat them as required; penalize if asset_tags lack them.
        - Soft matches:
          - Overlap on mood/intensity/speed/beat IDs improves score.
        - Compute a simple weighted sum:
          score = 1.0 - required_miss_penalty + soft_match_bonus
          then clamp to [0.0, 1.0].

    Args:
        block: PromptBlock to evaluate
        asset_tags: Dict with "ontology_ids" from tag_asset_from_metadata

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
    score = 1.0

    # Apply penalties for required misses
    if required_ids:
        # Penalize based on fraction of required IDs that are missing
        miss_fraction = len(required_misses) / len(required_ids)
        score -= miss_fraction * REQUIRED_MISS_PENALTY

    # Apply bonuses for soft matches
    if soft_ids:
        # Bonus based on fraction of soft IDs that match
        match_fraction = len(soft_matches) / len(soft_ids)
        score += match_fraction * SOFT_MATCH_BONUS

    # Clamp to [0.0, 1.0]
    score = max(0.0, min(1.0, score))

    # Build details dict
    details = {
        "score": score,
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
        }
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

    # Tag comparison
    block_ids = details.get("block_ontology_ids", [])
    asset_ids = details.get("asset_ontology_ids", [])

    if block_ids and not asset_ids:
        lines.append("⚠ Asset has no ontology tags (possibly no generation prompt)")
    elif not block_ids:
        lines.append("ℹ Block has no ontology tags")

    return "\n".join(lines)
