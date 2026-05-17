"""
LLM semantic fallback for prompt primitive projection.

The token-overlap engine in ``primitive_projection.py`` is pure, sync and
always-on. Some candidates legitimately have no lexical overlap with any
primitive ("the camera glides through the doorway as tension builds") — the
matcher reports ``no_signal`` / ``below_threshold`` / ``ambiguous``. This module
is an OPTIONAL async post-pass that asks an LLM to map only those weak
candidates onto the existing primitive catalog.

Design notes:
- **Strategy tag, not a plugin framework.** The projection envelope already
  carries an ``engine`` field; ``token_overlap_v2`` is the default strategy and
  ``llm_semantic`` is this fallback. That field *is* the strategy interface —
  consumers branch on it; no class hierarchy is warranted.
- **Purity preserved.** ``dsl_adapter`` / ``primitive_projection`` stay pure and
  sync (no DB, no LLM) by contract. This module lives at the same layer as
  ``llm_analyzer`` and is invoked by a caller that already owns ``db``/``user``
  (``PromptAnalysisService``), NOT from inside the pure parser. (Deliberate
  deviation from the checkpoint step's literal "in project_candidate_to_
  primitives()" wording — that function is contractually pure.)
- **Graceful degradation.** Any error/timeout/invalid output leaves the
  token-overlap result untouched, mirroring ``llm_analyzer._fallback_to_simple``.
- **One batched call.** All weak candidates go in a single LLM request (not N),
  bounded by settings (max candidates, catalog cap, timeout).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Mapping, Optional, Sequence, TYPE_CHECKING

from pixsim7.backend.main.services.prompt.parser.primitive_projection import (
    _get_primitive_index,
)
from pixsim7.backend.main.services.prompt.parser.primitive_projection_settings import (
    PrimitiveProjectionSettings,
    get_primitive_projection_settings,
)

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Strategy tags written to the projection envelope's `engine` field.
PROJECTION_STRATEGY_TOKEN_OVERLAP = "token_overlap_v2"
PROJECTION_STRATEGY_LLM = "llm_semantic"

# Statuses the token-overlap engine emits that warrant an LLM second opinion.
# "matched" is already good; "disabled" means projection is off entirely.
_WEAK_STATUSES = {"no_signal", "below_threshold", "ambiguous"}

_SYSTEM_PROMPT = """You map prompt fragments onto a fixed catalog of video/image \
"primitive" blocks (camera moves, lighting, subject motion, color grades, etc.).

You are given CATALOG entries (each: block_id, op_id, category, cues) and \
FRAGMENTS that a lexical matcher could not confidently classify. For each \
fragment, pick the single best-fitting catalog block_id ONLY if there is a \
clear semantic fit, else return null. Do not invent block_ids — use only ones \
present in CATALOG.

Return JSON only, no prose:
{"matches":[{"i":<fragment index int>,"block_id":<string|null>,"confidence":<0..1 float>,"reason":<short string>}]}"""


def _entry_cues(entry: Mapping[str, Any], *, cap: int = 10) -> List[str]:
    """Compact, deterministic cue list for one catalog entry."""
    seen: List[str] = []
    for key in ("context_synonyms", "phrases", "tokens"):
        values = entry.get(key)
        if not values:
            continue
        for token in sorted(str(v) for v in values):
            if token in seen:
                continue
            seen.append(token)
            if len(seen) >= cap:
                return seen
    return seen


def build_primitive_catalog(
    primitive_index: Sequence[Mapping[str, Any]],
    *,
    cap: int,
) -> List[Dict[str, Any]]:
    """Serialize a bounded, deterministic catalog for the LLM prompt.

    Prefers op-backed entries (actionable) and keeps at most one entry per
    op-family so the catalog stays diverse instead of 20 color-grade variants.
    """
    by_family: Dict[str, Mapping[str, Any]] = {}
    loose: List[Mapping[str, Any]] = []
    for entry in primitive_index:
        op_id = entry.get("op_id")
        if isinstance(op_id, str) and op_id:
            family = ".".join(op_id.split(".")[:2]) or op_id
            # Keep the lexicographically-first block_id per family for stability.
            prev = by_family.get(family)
            if prev is None or str(entry.get("block_id")) < str(prev.get("block_id")):
                by_family[family] = entry
        else:
            loose.append(entry)

    chosen: List[Mapping[str, Any]] = sorted(
        by_family.values(), key=lambda e: str(e.get("block_id") or "")
    )
    chosen += sorted(loose, key=lambda e: str(e.get("block_id") or ""))

    catalog: List[Dict[str, Any]] = []
    for entry in chosen[: max(1, cap)]:
        block_id = entry.get("block_id")
        if not isinstance(block_id, str) or not block_id:
            continue
        catalog.append(
            {
                "block_id": block_id,
                "op_id": entry.get("op_id"),
                "category": entry.get("category"),
                "role": entry.get("role"),
                "cues": _entry_cues(entry),
            }
        )
    return catalog


def _weak_candidate_indexes(candidates: Sequence[Mapping[str, Any]]) -> List[int]:
    weak: List[int] = []
    for idx, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue
        if not (candidate.get("text") or "").strip():
            continue
        projection = candidate.get("primitive_projection")
        if not isinstance(projection, dict):
            # No projection attached at all → treat as weak.
            weak.append(idx)
            continue
        if projection.get("mode") == "off" or projection.get("status") == "disabled":
            continue
        if projection.get("status") in _WEAK_STATUSES:
            weak.append(idx)
    return weak


def _build_llm_envelope(
    *,
    entry: Mapping[str, Any],
    confidence: float,
    reason: str,
    prior_status: Optional[str],
) -> Dict[str, Any]:
    """Projection envelope shaped like token_overlap_v2's, engine=llm_semantic."""
    op_payload: Dict[str, Any] = {}
    if isinstance(entry.get("op_id"), str):
        op_payload["op_id"] = entry["op_id"]
    if isinstance(entry.get("signature_id"), str):
        op_payload["signature_id"] = entry["signature_id"]
    modalities = entry.get("op_modalities")
    if isinstance(modalities, (list, tuple)) and modalities:
        op_payload["modalities"] = list(modalities)

    hypothesis: Dict[str, Any] = {
        "mode": "shadow",
        "strategy": PROJECTION_STRATEGY_LLM,
        "block_id": entry.get("block_id"),
        "score": round(float(confidence), 3),
        "confidence": round(min(0.99, float(confidence)), 3),
        "package_name": entry.get("package_name"),
        "role": entry.get("role"),
        "category": entry.get("category"),
        "overlap_tokens": [],
        "stem_overlap_tokens": [],
        "matched_phrases": [],
        "llm_reason": reason[:240] if isinstance(reason, str) else "",
    }
    if op_payload:
        hypothesis["op"] = op_payload

    return {
        "engine": PROJECTION_STRATEGY_LLM,
        "mode": "shadow",
        "status": "matched",
        "selected_index": 0,
        "thresholds": {},
        "hypotheses": [hypothesis],
        "suppression_reason": None,
        "fallback_of": prior_status,
    }


async def enrich_candidates_with_llm_projection_fallback(
    candidates: List[Dict[str, Any]],
    *,
    db: Optional["AsyncSession"],
    user_id: Optional[int] = None,
    settings: Optional[PrimitiveProjectionSettings] = None,
    primitive_index: Optional[Sequence[Mapping[str, Any]]] = None,
    provider_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Re-project weak candidates via one batched LLM call. Best-effort.

    Mutates and returns ``candidates``. On disabled flag, no weak candidates,
    timeout, provider error, or malformed output, the input is returned
    unchanged (token-overlap result preserved).
    """
    settings = settings or get_primitive_projection_settings()
    if not getattr(settings, "llm_fallback_enabled", False):
        return candidates
    if not candidates:
        return candidates

    weak_idxs = _weak_candidate_indexes(candidates)
    if not weak_idxs:
        return candidates
    weak_idxs = weak_idxs[: settings.llm_fallback_max_candidates]

    try:
        index = (
            tuple(primitive_index)
            if primitive_index is not None
            else _get_primitive_index()
        )
        if not index:
            return candidates
        entry_by_block_id: Dict[str, Mapping[str, Any]] = {
            str(e.get("block_id")): e for e in index if e.get("block_id")
        }
        catalog = build_primitive_catalog(
            index, cap=settings.llm_fallback_catalog_cap
        )
        if not catalog:
            return candidates

        fragments = [
            {"i": pos, "text": str(candidates[idx].get("text") or "").strip()}
            for pos, idx in enumerate(weak_idxs)
        ]
        user_prompt = (
            "CATALOG (JSON):\n"
            + json.dumps(catalog, ensure_ascii=False)
            + "\n\nFRAGMENTS (JSON):\n"
            + json.dumps(fragments, ensure_ascii=False)
            + "\n\nReturn the matches JSON now."
        )

        from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService

        ai_hub = AiHubService(db)
        resolved_provider_id, resolved_model_id = (
            await ai_hub.resolve_provider_and_model(
                provider_id=provider_id,
                model_id=model_id,
            )
        )

        async def _call() -> str:
            execution = await ai_hub.execute_prompt(
                provider_id=resolved_provider_id,
                model_id=resolved_model_id,
                prompt_before=f"{_SYSTEM_PROMPT}\n\n{user_prompt}",
                context={"mode": "primitive_projection_fallback"},
                user_id=user_id,
            )
            return execution.get("prompt_after") or ""

        response_text = await asyncio.wait_for(
            _call(), timeout=settings.llm_fallback_timeout_ms / 1000.0
        )

        matches = _parse_llm_matches(response_text)
        if not matches:
            return candidates

        applied = 0
        for match in matches:
            pos = match.get("i")
            block_id = match.get("block_id")
            if not isinstance(pos, int) or pos < 0 or pos >= len(weak_idxs):
                continue
            if not isinstance(block_id, str) or not block_id:
                continue
            entry = entry_by_block_id.get(block_id)
            if entry is None:
                continue  # LLM invented a block_id — reject.
            confidence = match.get("confidence")
            if not isinstance(confidence, (int, float)):
                continue
            if float(confidence) < settings.llm_fallback_min_confidence:
                continue
            candidate = candidates[weak_idxs[pos]]
            prior = candidate.get("primitive_projection")
            prior_status = (
                prior.get("status") if isinstance(prior, dict) else None
            )
            candidate["primitive_projection"] = _build_llm_envelope(
                entry=entry,
                confidence=float(confidence),
                reason=str(match.get("reason") or ""),
                prior_status=prior_status,
            )
            applied += 1

        logger.info(
            "primitive_projection llm fallback: %d/%d weak candidates re-projected",
            applied,
            len(weak_idxs),
        )
        return candidates

    except asyncio.TimeoutError:
        logger.warning(
            "primitive_projection llm fallback timed out (%dms budget); keeping token-overlap result",
            settings.llm_fallback_timeout_ms,
        )
        return candidates
    except Exception:  # noqa: BLE001 - never let the fallback break analysis
        logger.exception(
            "primitive_projection llm fallback failed; keeping token-overlap result"
        )
        return candidates


def _parse_llm_matches(response_text: str) -> List[Dict[str, Any]]:
    """Tolerantly extract the ``matches`` array from an LLM JSON response."""
    if not response_text:
        return []
    cleaned = response_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return []
    if isinstance(parsed, dict):
        matches = parsed.get("matches")
    elif isinstance(parsed, list):
        matches = parsed
    else:
        matches = None
    if not isinstance(matches, list):
        return []
    return [m for m in matches if isinstance(m, dict)]
