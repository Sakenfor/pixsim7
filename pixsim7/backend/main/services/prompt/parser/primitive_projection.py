"""
Prompt primitive projection (shadow mode).

Best-effort matcher that maps parsed prompt candidates to known primitive
blocks from prompt content packs. This is additive metadata enrichment only.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    CONTENT_PACKS_DIR,
    ContentPackValidationError,
    discover_content_packs,
    parse_blocks,
)

logger = logging.getLogger(__name__)

PROJECTION_MODE_OFF = "off"
PROJECTION_MODE_SHADOW = "shadow"
_MIN_MATCH_SCORE = 0.45
_CROSS_DOMAIN_AMBIGUITY_DELTA = 0.08

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_INDEX_STOP_TOKENS = {
    "core",
    "token",
    "source",
    "pack",
    "legacy",
    "none",
    "normal",
    "both",
    "image",
    "video",
}
_CANDIDATE_STOP_TOKENS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "at",
    "for",
    "with",
    "from",
    "by",
    "is",
    "are",
    "be",
    "was",
    "were",
    "as",
    "into",
    "through",
    "camera",
    "scene",
    "shot",
    "slowly",
    "quickly",
    "gently",
    "smoothly",
}
_DIRECTIONAL_TOKENS = {
    "left",
    "right",
    "up",
    "down",
    "forward",
    "backward",
    "above",
    "below",
    "behind",
    "front",
    "around",
    "across",
    "in",
    "out",
}
_PLACEMENT_RELATION_TOKENS = {
    "left",
    "right",
    "front",
    "behind",
    "above",
    "below",
    "near",
    "in",
    "out",
}
_PLACEMENT_CONTEXT_CUE_TOKENS = {
    "object",
    "subject",
    "character",
    "table",
    "bridge",
    "door",
    "doorway",
    "wall",
    "window",
    "room",
    "cityscape",
    "crowd",
    "ground",
    "floor",
    "ceiling",
    "desk",
    "balcony",
    "center",
}
_LOW_SIGNAL_OVERLAP_TOKENS = {
    "camera",
    "motion",
    "direction",
    "axis",
    "move",
}
_CAMERA_MOTION_SIGNAL_TOKENS = {
    "dolly",
    "zoom",
    "pan",
    "tilt",
    "truck",
    "orbit",
    "pedestal",
    "track",
    "tracking",
    "push",
    "pull",
}
_CAMERA_FRAMING_SIGNAL_TOKENS = {
    "shot",
    "close",
    "wide",
    "focus",
    "rack",
    "angle",
    "pov",
    "perspective",
    "bird",
    "worm",
    "dutch",
    "bokeh",
}
_SUBJECT_MOTION_SIGNAL_TOKENS = {
    "walk",
    "walking",
    "run",
    "runs",
    "running",
    "step",
    "steps",
    "turn",
    "turns",
    "turned",
    "turning",
    "drift",
    "crouch",
    "crouching",
}
_CAMERA_CONTEXT_CUE_TOKENS = {
    "camera",
    "shot",
    "frame",
    "framing",
    "angle",
    "lens",
    "focus",
    "pov",
    "viewpoint",
    "cinematic",
    "steadicam",
}
_CAMERA_STRONG_CONTEXT_CUE_TOKENS = {
    "camera",
    "shot",
    "frame",
    "angle",
    "lens",
    "pov",
    "viewpoint",
    "cinematic",
    "steadicam",
}
_NARRATIVE_CUE_TOKENS = {
    "narrative",
    "novel",
    "story",
    "literary",
    "prose",
    "voice",
    "style",
    "writing",
}
_SEQUENCE_INITIAL_SIGNAL_TOKENS = {
    "initial",
    "opening",
    "establishing",
    "setup",
}
_SEQUENCE_CONTINUATION_SIGNAL_TOKENS = {
    "continue",
    "continuation",
    "resume",
}
_SEQUENCE_TRANSITION_SIGNAL_TOKENS = {
    "transition",
    "cut",
    "shift",
}
_RUN_SIGNAL_TOKENS = {
    "run",
    "runs",
    "running",
}
_NON_AGENT_RUN_CONTEXT_TOKENS = {
    "water",
    "river",
    "stream",
    "traffic",
    "rain",
    "snow",
    "fog",
    "smoke",
    "cloud",
    "wind",
    "engine",
    "machine",
    "motor",
    "vehicle",
    "car",
    "truck",
    "road",
    "bridge",
}
_HUMAN_AGENT_CUE_TOKENS = {
    "he",
    "she",
    "they",
    "person",
    "people",
    "character",
    "subject",
    "hero",
    "heroine",
    "man",
    "woman",
    "girl",
    "boy",
    "runner",
    "hands",
    "face",
    "body",
    "npc",
}
_ANCHOR_RELATION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("in_front_of", re.compile(r"\bin\s+front\s+of\b")),
    ("left_of", re.compile(r"\b(?:to\s+the\s+)?left\s+of\b")),
    ("right_of", re.compile(r"\b(?:to\s+the\s+)?right\s+of\b")),
    ("behind", re.compile(r"\bbehind\b")),
    ("near", re.compile(r"\b(?:near|next\s+to|beside)\b")),
    ("above", re.compile(r"\babove\b")),
    ("below", re.compile(r"\b(?:below|beneath|under|underneath)\b")),
)
_SEQUENCE_ROLE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("initial", re.compile(r"\b(?:initial|opening|first\s+scene|scene\s+setup|establishing)\b")),
    ("continuation", re.compile(r"\b(?:continue|continuation|resume|carry\s+on|from\s+(?:the\s+)?previous)\b")),
    ("transition", re.compile(r"\b(?:transition|cut\s+to|shift\s+to|move\s+to|scene\s+change)\b")),
)
_ROLE_STOP_TOKEN_OVERRIDES: dict[str, set[str]] = {
    "camera": {"camera"},
}


def normalize_primitive_projection_mode(mode: Any) -> str:
    """Normalize projection mode to `shadow` (default) or `off`."""
    if not isinstance(mode, str):
        return PROJECTION_MODE_SHADOW
    normalized = mode.strip().lower()
    if normalized in {"", "shadow", "on", "enabled", "true"}:
        return PROJECTION_MODE_SHADOW
    if normalized in {"off", "disabled", "none", "false"}:
        return PROJECTION_MODE_OFF
    return PROJECTION_MODE_SHADOW


def refresh_primitive_projection_cache() -> None:
    """Clear cached primitive index (used by tests/dev tooling)."""
    _get_primitive_index.cache_clear()


def _as_text(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


def _tokenize(value: Any, *, stop_tokens: set[str] | None = None) -> set[str]:
    text = _as_text(value)
    if not text:
        return set()
    normalized = (
        text.lower()
        .replace("_", " ")
        .replace("-", " ")
        .replace(".", " ")
        .replace(":", " ")
        .replace("/", " ")
    )
    tokens = set(_TOKEN_RE.findall(normalized))
    filtered = set()
    for token in tokens:
        if len(token) < 2:
            continue
        if stop_tokens and token in stop_tokens:
            continue
        filtered.add(token)
    return filtered


def _candidate_stop_tokens(*, role: str | None) -> set[str]:
    """Build candidate stop-token set while preserving directional signal."""
    tokens = set(_CANDIDATE_STOP_TOKENS)
    tokens.difference_update(_DIRECTIONAL_TOKENS)
    if role:
        overrides = _ROLE_STOP_TOKEN_OVERRIDES.get(role)
        if overrides:
            tokens.difference_update(overrides)
    return tokens


def _token_weight(token: str) -> float:
    """Down-weight directional words instead of dropping them outright."""
    if token in _DIRECTIONAL_TOKENS:
        return 0.5
    return 1.0


def _iter_tag_tokens(tags: Mapping[str, Any]) -> Iterable[str]:
    for key, raw_value in tags.items():
        for token in _tokenize(key):
            yield token
        if isinstance(raw_value, str):
            for token in _tokenize(raw_value):
                yield token
        elif isinstance(raw_value, list):
            for item in raw_value:
                if isinstance(item, str):
                    for token in _tokenize(item):
                        yield token


def _iter_op_tokens(op_payload: Mapping[str, Any]) -> Iterable[str]:
    op_id = _as_text(op_payload.get("op_id"))
    if op_id:
        for token in _tokenize(op_id):
            yield token
    signature_id = _as_text(op_payload.get("signature_id"))
    if signature_id:
        for token in _tokenize(signature_id):
            yield token

    # Variant-level args are discriminative; full param enum vocab is too broad
    # and creates cross-domain noise (e.g. every motion variant gets every direction token).
    args = op_payload.get("args")
    if isinstance(args, dict):
        for key, value in args.items():
            for token in _tokenize(key):
                yield token
            for token in _tokenize(value):
                yield token


def _extract_anchor_relation_hints(text: str) -> tuple[set[str], str | None]:
    """Extract explicit placement-relation cues and earliest relation mention."""
    found: dict[str, int] = {}
    for relation_key, pattern in _ANCHOR_RELATION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        found[relation_key] = match.start()
    if not found:
        return set(), None
    primary_relation = min(found.items(), key=lambda item: item[1])[0]
    return set(found.keys()), primary_relation


def _extract_sequence_role_hints(text: str, text_tokens: set[str]) -> set[str]:
    """Extract role hints for sequence continuity primitives."""
    hints: set[str] = set()
    for role, pattern in _SEQUENCE_ROLE_PATTERNS:
        if pattern.search(text):
            hints.add(role)

    if text_tokens & _SEQUENCE_INITIAL_SIGNAL_TOKENS:
        hints.add("initial")
    if text_tokens & _SEQUENCE_CONTINUATION_SIGNAL_TOKENS:
        hints.add("continuation")
    if text_tokens & _SEQUENCE_TRANSITION_SIGNAL_TOKENS:
        hints.add("transition")
    return hints


def _entry_anchor_relation_key(entry_block_tokens: set[str]) -> str | None:
    if {"front", "in"} & entry_block_tokens and "front" in entry_block_tokens:
        return "in_front_of"
    if "left" in entry_block_tokens:
        return "left_of"
    if "right" in entry_block_tokens:
        return "right_of"
    if "behind" in entry_block_tokens:
        return "behind"
    if "above" in entry_block_tokens:
        return "above"
    if "below" in entry_block_tokens:
        return "below"
    if "near" in entry_block_tokens:
        return "near"
    return None


def _entry_sequence_role_key(entry_tokens: set[str]) -> str | None:
    if "continuation" in entry_tokens:
        return "continuation"
    if "transition" in entry_tokens:
        return "transition"
    if "initial" in entry_tokens:
        return "initial"
    if "unspecified" in entry_tokens:
        return "unspecified"
    return None


def _build_index_entry(*, block: Mapping[str, Any], pack_name: str) -> Dict[str, Any] | None:
    block_id = _as_text(block.get("block_id"))
    if not block_id:
        return None

    tags_raw = block.get("tags")
    tags = dict(tags_raw) if isinstance(tags_raw, dict) else {}

    role = _as_text(block.get("role")) or _as_text(tags.get("role"))
    category = _as_text(block.get("category")) or _as_text(tags.get("legacy_category"))
    package_name = _as_text(block.get("package_name")) or _as_text(tags.get("source_pack")) or pack_name

    metadata_raw = block.get("block_metadata")
    metadata = dict(metadata_raw) if isinstance(metadata_raw, dict) else {}
    op_raw = metadata.get("op")
    op_payload = dict(op_raw) if isinstance(op_raw, dict) else {}

    block_tokens = _tokenize(block_id)
    tokens: set[str] = set(block_tokens)

    block_text = _as_text(block.get("text"))
    if block_text:
        tokens.update(_tokenize(block_text))
    if role:
        tokens.update(_tokenize(role))
    if category:
        tokens.update(_tokenize(category))
    tokens.update(_iter_tag_tokens(tags))
    tokens.update(_iter_op_tokens(op_payload))

    filtered_tokens = {
        token
        for token in tokens
        if token not in _INDEX_STOP_TOKENS
    }
    if not filtered_tokens:
        return None

    op_id = _as_text(op_payload.get("op_id"))
    signature_id = _as_text(op_payload.get("signature_id"))
    role_in_sequence = _as_text(tags.get("role_in_sequence"))
    continuity_focus = _as_text(tags.get("continuity_focus"))
    continuity_priority = _as_text(tags.get("continuity_priority"))
    op_modalities: List[str] = []
    raw_modalities = op_payload.get("modalities")
    if isinstance(raw_modalities, list):
        for modality in raw_modalities:
            if isinstance(modality, str) and modality.strip():
                op_modalities.append(modality.strip().lower())

    return {
        "block_id": block_id,
        "package_name": package_name,
        "role": role,
        "category": category,
        "tokens": frozenset(filtered_tokens),
        "block_tokens": frozenset(block_tokens),
        "op_id": op_id,
        "signature_id": signature_id,
        "op_modalities": tuple(op_modalities),
        "role_in_sequence": role_in_sequence,
        "continuity_focus": continuity_focus,
        "continuity_priority": continuity_priority,
    }


def _annotate_category_distinguishing_tokens(entries: List[Dict[str, Any]]) -> None:
    """Annotate per-entry distinguishing block-ID tokens for variant discrimination."""
    category_groups: Dict[str, List[Dict[str, Any]]] = {}
    for entry in entries:
        category = _as_text(entry.get("category"))
        if not category:
            continue
        category_groups.setdefault(category, []).append(entry)

    for category_entries in category_groups.values():
        token_counts: Dict[str, int] = {}
        for entry in category_entries:
            block_tokens = set(entry.get("block_tokens") or set())
            for token in block_tokens:
                if token in _INDEX_STOP_TOKENS or token in _LOW_SIGNAL_OVERLAP_TOKENS:
                    continue
                if len(token) < 3:
                    continue
                token_counts[token] = token_counts.get(token, 0) + 1

        category_distinguishing = frozenset(
            token
            for token, count in token_counts.items()
            if count < len(category_entries)
        )

        for entry in category_entries:
            block_tokens = set(entry.get("block_tokens") or set())
            entry_distinguishing = frozenset(
                token
                for token in block_tokens
                if token_counts.get(token, 0) == 1
            )
            entry["distinguishing_tokens"] = entry_distinguishing
            entry["category_distinguishing_tokens"] = category_distinguishing


def _op_family(op_id: str | None) -> str | None:
    if not op_id:
        return None
    parts = [part for part in op_id.split(".") if part]
    if len(parts) >= 2:
        return ".".join(parts[:2])
    return op_id


def _annotate_family_variant_tokens(entries: List[Dict[str, Any]]) -> None:
    """Annotate per-op-family variant tokens to improve sibling discrimination."""
    family_groups: Dict[str, List[Dict[str, Any]]] = {}
    for entry in entries:
        family = _op_family(_as_text(entry.get("op_id")))
        if not family:
            continue
        family_groups.setdefault(family, []).append(entry)

    for family, family_entries in family_groups.items():
        token_counts: Dict[str, int] = {}
        for entry in family_entries:
            block_tokens = set(entry.get("block_tokens") or set())
            for token in block_tokens:
                if token in _INDEX_STOP_TOKENS or token in _LOW_SIGNAL_OVERLAP_TOKENS:
                    continue
                if len(token) < 3:
                    continue
                token_counts[token] = token_counts.get(token, 0) + 1

        family_common = frozenset(
            token
            for token, count in token_counts.items()
            if count == len(family_entries)
        )
        family_distinguishing = frozenset(
            token
            for token, count in token_counts.items()
            if count < len(family_entries)
        )
        for entry in family_entries:
            block_tokens = set(entry.get("block_tokens") or set())
            family_signal_tokens = frozenset(
                token
                for token in block_tokens
                if token in family_distinguishing and token not in family_common
            )
            entry["op_family"] = family
            entry["family_signal_tokens"] = family_signal_tokens
            entry["family_distinguishing_tokens"] = family_distinguishing


@lru_cache(maxsize=1)
def _get_primitive_index() -> Tuple[Dict[str, Any], ...]:
    """Build and cache primitive index from prompt content packs."""
    entries: List[Dict[str, Any]] = []
    for pack_name in discover_content_packs():
        content_dir = CONTENT_PACKS_DIR / pack_name
        try:
            blocks = parse_blocks(content_dir)
        except ContentPackValidationError as exc:
            logger.warning(
                "Skipping prompt projection for invalid content pack '%s': %s",
                pack_name,
                exc,
            )
            continue
        except Exception:
            logger.exception(
                "Failed loading prompt content pack '%s' for primitive projection",
                pack_name,
            )
            continue

        for block in blocks:
            entry = _build_index_entry(block=block, pack_name=pack_name)
            if entry:
                entries.append(entry)
    _annotate_category_distinguishing_tokens(entries)
    _annotate_family_variant_tokens(entries)
    return tuple(entries)


def _extract_candidate_evidence(candidate: Mapping[str, Any]) -> Dict[str, Any]:
    role = _as_text(candidate.get("role"))
    category = _as_text(candidate.get("category"))
    text_value = _as_text(candidate.get("text")) or ""
    text_lower = text_value.lower()

    metadata_raw = candidate.get("metadata")
    metadata = dict(metadata_raw) if isinstance(metadata_raw, dict) else {}
    if not role:
        role = _as_text(metadata.get("inferred_role"))
    if not category:
        category = _as_text(metadata.get("category"))

    stop_tokens = _candidate_stop_tokens(role=role)
    text_tokens = _tokenize(
        text_value,
        stop_tokens=stop_tokens,
    )

    matched_keywords = candidate.get("matched_keywords")
    keyword_tokens: set[str] = set()
    if isinstance(matched_keywords, list):
        for keyword in matched_keywords:
            keyword_tokens.update(
                _tokenize(keyword, stop_tokens=stop_tokens)
            )

    relation_hints, primary_relation = _extract_anchor_relation_hints(text_lower)
    phrase_hints = {f"placement_{relation}" for relation in relation_hints}
    sequence_role_hints = _extract_sequence_role_hints(text_lower, text_tokens)
    for sequence_role in sequence_role_hints:
        phrase_hints.add(f"sequence_{sequence_role}")
    if re.search(r"\bturn(?:s|ed|ing)?\s+around\b", text_lower):
        phrase_hints.add("subject_turn_around")
        text_tokens.update({"turn", "around"})

    return {
        "text_tokens": text_tokens,
        "keyword_tokens": keyword_tokens,
        "role": role,
        "category": category,
        "phrase_hints": phrase_hints,
        "has_explicit_anchor_phrase": bool(relation_hints),
        "primary_relation": primary_relation,
        "sequence_role_hints": sequence_role_hints,
        "has_sequence_cues": bool(sequence_role_hints) or ("continuity" in text_tokens),
    }


def _score_entry(
    *,
    evidence: Mapping[str, Any],
    entry: Mapping[str, Any],
) -> Dict[str, Any] | None:
    text_tokens = set(evidence.get("text_tokens") or set())
    keyword_tokens = set(evidence.get("keyword_tokens") or set())
    probe_tokens = text_tokens | keyword_tokens
    if not probe_tokens:
        return None

    entry_tokens = set(entry.get("tokens") or set())
    if not entry_tokens:
        return None

    overlap_text = sorted(text_tokens & entry_tokens)
    overlap_keywords = sorted(keyword_tokens & entry_tokens)
    overlap_all = sorted(set(overlap_text) | set(overlap_keywords))
    if not overlap_all:
        return None

    overlap_weight = sum(_token_weight(token) for token in overlap_all)
    probe_weight = sum(_token_weight(token) for token in probe_tokens)
    normalized_probe_weight = max(min(probe_weight, 3.0), 1.0)

    role = _as_text(evidence.get("role"))
    category = _as_text(evidence.get("category"))
    entry_role = _as_text(entry.get("role"))
    entry_category = _as_text(entry.get("category"))

    role_bonus = 0.2 if role and entry_role and role == entry_role else 0.0
    category_bonus = 0.2 if category and entry_category and category == entry_category else 0.0

    cross_bonus = 0.0
    if role and entry_category and role == entry_category:
        cross_bonus += 0.1
    if category and entry_role and category == entry_role:
        cross_bonus += 0.1

    lexical_score = (overlap_weight / normalized_probe_weight) * 0.6
    keyword_bonus = min(0.2, 0.1 * len(overlap_keywords))
    specific_bonus = 0.1 if any(
        token not in _LOW_SIGNAL_OVERLAP_TOKENS for token in overlap_all
    ) else 0.0
    entry_block_tokens = {
        token
        for token in set(entry.get("block_tokens") or set())
        if token not in _INDEX_STOP_TOKENS and token not in _LOW_SIGNAL_OVERLAP_TOKENS
    }
    block_id_overlap = sorted(probe_tokens & entry_block_tokens)
    block_id_bonus = min(0.24, 0.12 * len(block_id_overlap))

    score = min(
        1.0,
        lexical_score
        + keyword_bonus
        + specific_bonus
        + block_id_bonus
        + role_bonus
        + category_bonus
        + cross_bonus,
    )

    # Domain gating: prefer semantic family matches over generic directional overlap.
    op_id = _as_text(entry.get("op_id")) or ""
    probe_token_set = set(probe_tokens)
    overlap_token_set = set(overlap_all)
    phrase_hints = set(evidence.get("phrase_hints") or set())
    has_explicit_anchor_phrase = bool(evidence.get("has_explicit_anchor_phrase"))
    primary_relation = _as_text(evidence.get("primary_relation"))
    has_camera_motion_signal = bool(probe_token_set & _CAMERA_MOTION_SIGNAL_TOKENS)
    has_camera_framing_signal = bool(probe_token_set & _CAMERA_FRAMING_SIGNAL_TOKENS)
    has_subject_motion_signal = bool(probe_token_set & _SUBJECT_MOTION_SIGNAL_TOKENS)
    has_narrative_cues = bool(probe_token_set & _NARRATIVE_CUE_TOKENS)
    sequence_role_hints = set(evidence.get("sequence_role_hints") or set())
    has_sequence_cues = bool(evidence.get("has_sequence_cues"))
    is_direction_axis = op_id.startswith("direction.axis.")
    is_camera_motion = op_id.startswith("camera.motion.")
    is_scene_anchor = op_id.startswith("scene.anchor.place") or op_id.startswith("scene.relation.place")
    is_sequence_continuity = op_id.startswith("sequence.continuity.")
    is_subject_look = op_id.startswith("subject.look.")
    is_camera_pov = op_id.startswith("camera.pov.")
    is_camera_framing = (
        op_id.startswith("camera.shot.")
        or op_id.startswith("camera.focus.")
        or op_id.startswith("camera.angle.")
        or op_id.startswith("camera.pov.")
    )
    is_subject_motion = op_id.startswith("subject.move.")

    domain_multiplier = 1.0
    if has_camera_motion_signal:
        if is_camera_motion:
            domain_multiplier *= 1.25
        elif is_direction_axis:
            domain_multiplier *= 0.55
    if has_camera_framing_signal:
        if is_camera_framing:
            domain_multiplier *= 1.15
        elif is_direction_axis:
            domain_multiplier *= 0.75
    if has_subject_motion_signal and not has_camera_motion_signal:
        if is_subject_motion:
            domain_multiplier *= 1.15
        elif is_direction_axis:
            domain_multiplier *= 0.8

    if has_camera_motion_signal and is_subject_look:
        domain_multiplier *= 0.85

    placement_relation_overlap = probe_token_set & _PLACEMENT_RELATION_TOKENS
    if is_scene_anchor and placement_relation_overlap:
        domain_multiplier *= 1.25
        if probe_token_set & _PLACEMENT_CONTEXT_CUE_TOKENS:
            domain_multiplier *= 1.25
    if is_scene_anchor and has_camera_motion_signal and not has_explicit_anchor_phrase:
        domain_multiplier *= 0.55

    camera_motion_overlap = probe_token_set & _CAMERA_MOTION_SIGNAL_TOKENS
    has_directional_tokens = bool(probe_token_set & _DIRECTIONAL_TOKENS)
    if is_camera_motion and has_directional_tokens:
        domain_multiplier *= 1.1
    if is_camera_motion and (keyword_tokens & _CAMERA_MOTION_SIGNAL_TOKENS):
        domain_multiplier *= 1.1
    if is_camera_motion and role == "camera":
        domain_multiplier *= 1.15

    # False-friend guard for "truck" as a vehicle in non-camera prose.
    if (
        is_camera_motion
        and role != "camera"
        and camera_motion_overlap
        and camera_motion_overlap.issubset({"truck"})
        and not has_directional_tokens
        and not (probe_token_set & _CAMERA_CONTEXT_CUE_TOKENS)
    ):
        domain_multiplier *= 0.5

    if (
        is_camera_pov
        and has_narrative_cues
        and role != "camera"
        and not (probe_token_set & _CAMERA_STRONG_CONTEXT_CUE_TOKENS)
    ):
        domain_multiplier *= 0.35

    if (
        is_subject_motion
        and (probe_token_set & _RUN_SIGNAL_TOKENS)
        and (probe_token_set & _NON_AGENT_RUN_CONTEXT_TOKENS)
        and not (probe_token_set & _HUMAN_AGENT_CUE_TOKENS)
    ):
        domain_multiplier *= 0.55

    if is_subject_motion and "subject_turn_around" in phrase_hints:
        if {"turn", "around"}.issubset(entry_block_tokens):
            domain_multiplier *= 1.6
        else:
            domain_multiplier *= 0.8

    if is_sequence_continuity:
        if has_sequence_cues:
            domain_multiplier *= 1.25
        else:
            domain_multiplier *= 0.55

        entry_sequence_role = _entry_sequence_role_key(entry_tokens | entry_block_tokens)
        if sequence_role_hints and entry_sequence_role:
            if entry_sequence_role in sequence_role_hints:
                domain_multiplier *= 1.45
            elif entry_sequence_role != "unspecified":
                domain_multiplier *= 0.72
    elif has_sequence_cues and (is_camera_motion or is_direction_axis or is_scene_anchor):
        domain_multiplier *= 0.9

    if is_scene_anchor:
        entry_relation_key = _entry_anchor_relation_key(entry_block_tokens)
        placement_hints = {
            hint
            for hint in phrase_hints
            if hint.startswith("placement_")
        }
        if entry_relation_key:
            expected_hint = f"placement_{entry_relation_key}"
            if expected_hint in placement_hints:
                domain_multiplier *= 1.45
            elif placement_hints:
                domain_multiplier *= 0.78
            if primary_relation and primary_relation != entry_relation_key:
                domain_multiplier *= 0.8

    if is_direction_axis:
        non_direction_probe = {
            token
            for token in probe_token_set
            if token not in _DIRECTIONAL_TOKENS and token not in _LOW_SIGNAL_OVERLAP_TOKENS
        }
        if non_direction_probe and overlap_token_set and overlap_token_set.issubset(_DIRECTIONAL_TOKENS):
            domain_multiplier *= 0.7

    domain_cap = 1.5 if (is_scene_anchor and placement_relation_overlap) else 1.35
    score *= max(0.35, min(domain_cap, domain_multiplier))

    entry_distinguishing = set(entry.get("distinguishing_tokens") or set())
    category_distinguishing = set(entry.get("category_distinguishing_tokens") or set())
    overlap_distinguishing = sorted(probe_tokens & entry_distinguishing)
    competing_distinguishing = sorted(
        (probe_tokens & category_distinguishing) - set(overlap_distinguishing)
    )
    negative_penalty = 1.0
    if competing_distinguishing and not overlap_distinguishing:
        negative_penalty = 0.65
    elif entry_distinguishing and not overlap_distinguishing:
        negative_penalty = 0.85
    score *= negative_penalty

    family_variant_tokens = set(entry.get("family_signal_tokens") or set())
    family_distinguishing_tokens = set(entry.get("family_distinguishing_tokens") or set())
    overlap_family_variant = sorted(probe_tokens & family_variant_tokens)
    competing_family_variant = sorted(
        (probe_tokens & family_distinguishing_tokens) - set(overlap_family_variant)
    )
    family_penalty = 1.0
    if competing_family_variant and not overlap_family_variant:
        family_penalty = 0.78
    elif competing_family_variant and overlap_family_variant and len(overlap_family_variant) < len(competing_family_variant):
        family_penalty = 0.92
    score *= family_penalty
    family_bonus = min(0.15, 0.05 * len(overlap_family_variant))
    if family_bonus:
        score = min(1.0, score + family_bonus)

    has_specific_evidence = (
        len(overlap_all) >= 2
        or any(
            token not in _LOW_SIGNAL_OVERLAP_TOKENS and token not in _DIRECTIONAL_TOKENS
            for token in overlap_all
        )
        or any(
            token not in _LOW_SIGNAL_OVERLAP_TOKENS and token not in _DIRECTIONAL_TOKENS
            for token in overlap_keywords
        )
        or bool(overlap_distinguishing)
    )
    if not has_specific_evidence:
        return None

    return {
        "score": score,
        "overlap_tokens": overlap_all,
        "overlap_text": overlap_text,
        "overlap_keywords": overlap_keywords,
        "block_id_overlap": block_id_overlap,
        "overlap_distinguishing": overlap_distinguishing,
        "competing_distinguishing": competing_distinguishing,
        "negative_penalty": negative_penalty,
        "overlap_family_variant": overlap_family_variant,
        "competing_family_variant": competing_family_variant,
        "family_penalty": family_penalty,
    }


def _primitive_domain(entry: Mapping[str, Any]) -> str | None:
    category = _as_text(entry.get("category"))
    if category:
        return f"category:{category}"
    role = _as_text(entry.get("role"))
    if role:
        return f"role:{role}"
    package_name = _as_text(entry.get("package_name"))
    if package_name:
        return f"package:{package_name}"
    return None


def _is_cross_domain_ambiguous(
    ranked_matches: Sequence[Tuple[Mapping[str, Any], Mapping[str, Any]]],
) -> bool:
    if len(ranked_matches) < 2:
        return False

    best_scored, best_entry = ranked_matches[0]
    best_score = float(best_scored.get("score") or 0.0)
    if best_score < _MIN_MATCH_SCORE:
        return False
    best_domain = _primitive_domain(best_entry)
    if not best_domain:
        return False

    for contender_scored, contender_entry in ranked_matches[1:]:
        contender_score = float(contender_scored.get("score") or 0.0)
        if contender_score < _MIN_MATCH_SCORE:
            continue
        contender_domain = _primitive_domain(contender_entry)
        if not contender_domain or contender_domain == best_domain:
            continue
        score_delta = best_score - contender_score
        return score_delta <= _CROSS_DOMAIN_AMBIGUITY_DELTA

    return False


def match_candidate_to_primitive(
    candidate: Mapping[str, Any],
    *,
    primitive_index: Sequence[Mapping[str, Any]] | None = None,
    mode: str = PROJECTION_MODE_SHADOW,
) -> Dict[str, Any] | None:
    """
    Match one candidate to best primitive block in shadow mode.

    Returns match metadata payload or None.
    """
    normalized_mode = normalize_primitive_projection_mode(mode)
    if normalized_mode == PROJECTION_MODE_OFF:
        return None

    index = tuple(primitive_index) if primitive_index is not None else _get_primitive_index()
    if not index:
        return None

    evidence = _extract_candidate_evidence(candidate)
    ranked_matches: List[Tuple[Dict[str, Any], Mapping[str, Any]]] = []

    for entry in index:
        scored = _score_entry(evidence=evidence, entry=entry)
        if scored is None:
            continue
        ranked_matches.append((scored, entry))

    if not ranked_matches:
        return None
    ranked_matches.sort(
        key=lambda item: (
            -float(item[0].get("score") or 0.0),
            -len(item[0].get("overlap_tokens") or []),
            str(item[1].get("block_id") or ""),
        )
    )

    best, best_entry = ranked_matches[0]
    if float(best["score"]) < _MIN_MATCH_SCORE:
        return None
    if _is_cross_domain_ambiguous(ranked_matches):
        return None

    payload: Dict[str, Any] = {
        "mode": normalized_mode,
        "strategy": "token_overlap_v1",
        "block_id": best_entry.get("block_id"),
        "score": round(float(best["score"]), 3),
        "confidence": round(min(0.99, float(best["score"])), 3),
        "package_name": best_entry.get("package_name"),
        "role": best_entry.get("role"),
        "category": best_entry.get("category"),
        "overlap_tokens": list(best["overlap_tokens"]),
    }
    if isinstance(best_entry.get("role_in_sequence"), str):
        payload["role_in_sequence"] = best_entry["role_in_sequence"]
    if isinstance(best_entry.get("continuity_focus"), str):
        payload["continuity_focus"] = best_entry["continuity_focus"]
    if isinstance(best_entry.get("continuity_priority"), str):
        payload["continuity_priority"] = best_entry["continuity_priority"]

    op_payload: Dict[str, Any] = {}
    if isinstance(best_entry.get("op_id"), str):
        op_payload["op_id"] = best_entry["op_id"]
    if isinstance(best_entry.get("signature_id"), str):
        op_payload["signature_id"] = best_entry["signature_id"]
    modalities = best_entry.get("op_modalities")
    if isinstance(modalities, tuple) and modalities:
        op_payload["modalities"] = list(modalities)
    if op_payload:
        payload["op"] = op_payload

    return payload


def enrich_candidates_with_primitive_projection(
    candidates: List[Dict[str, Any]],
    *,
    mode: str = PROJECTION_MODE_SHADOW,
    primitive_index: Sequence[Mapping[str, Any]] | None = None,
) -> List[Dict[str, Any]]:
    """
    Add `metadata.primitive_match` to candidates when a shadow match exists.

    This does not alter role/confidence/selection behavior.
    """
    normalized_mode = normalize_primitive_projection_mode(mode)
    if normalized_mode == PROJECTION_MODE_OFF or not candidates:
        return candidates

    index = tuple(primitive_index) if primitive_index is not None else _get_primitive_index()
    if not index:
        return candidates

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        metadata_raw = candidate.get("metadata")
        if metadata_raw is None:
            metadata: Dict[str, Any] = {}
        elif isinstance(metadata_raw, dict):
            metadata = dict(metadata_raw)
        else:
            metadata = {}
        if "primitive_match" in metadata:
            continue
        try:
            match = match_candidate_to_primitive(
                candidate,
                primitive_index=index,
                mode=normalized_mode,
            )
        except Exception:
            logger.exception("Primitive projection failed for candidate")
            continue
        if match:
            metadata["primitive_match"] = match
            candidate["metadata"] = metadata
    return candidates
