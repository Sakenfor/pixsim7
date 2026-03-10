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
_LOW_SIGNAL_OVERLAP_TOKENS = {
    "camera",
    "motion",
    "direction",
    "axis",
    "move",
}
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

    default_args = op_payload.get("default_args")
    if isinstance(default_args, dict):
        for key, value in default_args.items():
            for token in _tokenize(key):
                yield token
            for token in _tokenize(value):
                yield token

    params = op_payload.get("params")
    if isinstance(params, list):
        for item in params:
            if not isinstance(item, dict):
                continue
            for token in _tokenize(item.get("key")):
                yield token
            enum_values = item.get("enum")
            if isinstance(enum_values, list):
                for enum_value in enum_values:
                    for token in _tokenize(enum_value):
                        yield token


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
    return tuple(entries)


def _extract_candidate_evidence(candidate: Mapping[str, Any]) -> Dict[str, Any]:
    role = _as_text(candidate.get("role"))
    category = _as_text(candidate.get("category"))

    metadata_raw = candidate.get("metadata")
    metadata = dict(metadata_raw) if isinstance(metadata_raw, dict) else {}
    if not role:
        role = _as_text(metadata.get("inferred_role"))
    if not category:
        category = _as_text(metadata.get("category"))

    stop_tokens = _candidate_stop_tokens(role=role)
    text_tokens = _tokenize(
        candidate.get("text"),
        stop_tokens=stop_tokens,
    )

    matched_keywords = candidate.get("matched_keywords")
    keyword_tokens: set[str] = set()
    if isinstance(matched_keywords, list):
        for keyword in matched_keywords:
            keyword_tokens.update(
                _tokenize(keyword, stop_tokens=stop_tokens)
            )

    return {
        "text_tokens": text_tokens,
        "keyword_tokens": keyword_tokens,
        "role": role,
        "category": category,
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

    has_specific_evidence = (
        len(overlap_all) >= 2
        or len(overlap_keywords) > 0
        or any(
            token not in _LOW_SIGNAL_OVERLAP_TOKENS and token not in _DIRECTIONAL_TOKENS
            for token in overlap_all
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
    }


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
    best: Dict[str, Any] | None = None
    best_entry: Mapping[str, Any] | None = None

    for entry in index:
        scored = _score_entry(evidence=evidence, entry=entry)
        if scored is None:
            continue
        if best is None:
            best = scored
            best_entry = entry
            continue
        if scored["score"] > best["score"]:
            best = scored
            best_entry = entry
            continue
        if scored["score"] == best["score"]:
            if len(scored["overlap_tokens"]) > len(best["overlap_tokens"]):
                best = scored
                best_entry = entry
                continue
            if len(scored["overlap_tokens"]) == len(best["overlap_tokens"]):
                if str(entry.get("block_id") or "") < str(best_entry.get("block_id") or ""):
                    best = scored
                    best_entry = entry

    if best is None or best_entry is None:
        return None
    if best["score"] < 0.45:
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
