"""Prompt op execution endpoint (Phase 2 of plan:op-runtime-span-popover).

Resolves an op_id + user-supplied params/refs into the canonical prose of
the best-matching enumerated variant. Variant lookup happens against
`BlockPrimitive` rows where the schema compiler already auto-tagged every
compiled variant with `tags.op_id = <effective_op_id>` and
`tags[param_key] = <param_value>` for each declared param.

The Phase 2 model is *variant lookup*, not free generation — see
plan:op-runtime-span-popover for the rationale and the (a) vs (b) decision
gate that defers live op blocks to a later phase.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from pixsim7.backend.main.domain.composition.role_resolver import resolve_role
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)
from pixsim7.backend.main.services.prompt.block.op_signatures import (
    get_op_signature,
)
from pixsim7.backend.main.shared.entity_refs import parse_entity_ref

router = APIRouter(prefix="/prompts/operations", tags=["prompt-operations"])


# ─── Request / response shapes ────────────────────────────────────────────


class OpExecuteRequest(BaseModel):
    op_id: str = Field(..., min_length=1, max_length=200)
    signature_id: Optional[str] = Field(default=None, max_length=200)
    params: Dict[str, Any] = Field(default_factory=dict)
    # Refs are user-picked tokens from the polymorphic RefPickerField.
    # Accepted shapes per value (string):
    #   "asset:<id>", "character_instance:<id>"      — entity refs
    #   "role:<concept>"                              — role concept
    #   "symbol:<token>"                              — opaque symbol
    # Normalization happens in _normalize_ref(); malformed values are
    # kept verbatim with a warning rather than rejected, so the round-trip
    # to op_refs is identity-preserving for debugging.
    refs: Dict[str, str] = Field(default_factory=dict)
    modality: Optional[str] = Field(default=None, max_length=32)


class OpExecuteOverlayEntry(BaseModel):
    """Provenance overlay for an inserted op-driven span.

    Stamped onto the prompt's persisted `block_overlay` so future passes
    (Phase 2b: re-tweak; the (b) decision-gate: live blocks) can identify
    op-derived spans without re-deriving from text alone.
    """
    block_id: str
    text: str
    role: Optional[str] = None
    category: Optional[str] = None
    source_op: str
    op_params: Dict[str, Any] = Field(default_factory=dict)
    op_refs: Dict[str, str] = Field(default_factory=dict)
    signature_id: Optional[str] = None


class OpExecuteResponse(BaseModel):
    prompt_text: str
    block_id: str
    block_overlay: OpExecuteOverlayEntry
    matched_exactly: bool
    warnings: List[str] = Field(default_factory=list)


# ─── Resolver ─────────────────────────────────────────────────────────────


def _normalize_ref(raw: Any) -> Optional[str]:
    """Best-effort normalize a user-supplied ref value to canonical form.

    Returns the canonical token string when the input parses as one of:
      - entity ref ("asset:N", "character_instance:N", ...) → entity_ref.to_string()
      - role concept ("role:X" with X resolvable via resolve_role()) → "role:<id>"
      - symbol ("symbol:X" with non-empty X) → "symbol:<token>"

    Returns ``None`` for unparseable input. Refs are provenance-only in this
    push (variant scoring stays params-only), so callers should keep the raw
    value with a warning rather than reject the request.
    """
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None

    entity_ref = parse_entity_ref(text)
    if entity_ref is not None:
        return entity_ref.to_string()

    if text.startswith("role:"):
        role_ref = resolve_role(text)
        if role_ref is not None:
            return role_ref.to_canonical()
        return None

    if text.startswith("symbol:"):
        symbol = text[len("symbol:"):].strip()
        if symbol:
            return f"symbol:{symbol}"
        return None

    return None


def _score_variant(*, block_tags: Dict[str, Any], params: Dict[str, Any]) -> tuple[int, int]:
    """Return (matched, mismatched) param counts for a candidate variant.

    Matching is string-coerced — enum values are strings on disk, the user
    might post numbers as numbers, and tags JSONB roundtrips can introduce
    representational drift. Higher matched + lower mismatched wins.
    """
    matched = 0
    mismatched = 0
    for key, user_value in params.items():
        block_value = block_tags.get(key)
        if block_value is None:
            continue  # variant doesn't constrain this param → neutral
        if str(block_value) == str(user_value):
            matched += 1
        else:
            mismatched += 1
    return matched, mismatched


@router.post(
    "/execute",
    response_model=OpExecuteResponse,
)
async def execute_prompt_operation(request: OpExecuteRequest) -> OpExecuteResponse:
    """Resolve an op invocation to its best-matching variant's prose.

    Algorithm:
      1. Validate op_id against `op_signature_registry[signature_id]` if
         the request provides a signature_id (must start with op_id_prefix).
      2. Query BlockPrimitive WHERE tags.op_id == op_id. The schema
         compiler stamps op_id onto every compiled variant's tags, so this
         is a GIN-indexed lookup.
      3. Score each candidate by (matched_params, -mismatched_params,
         block_id) — pick the highest. Ties broken by block_id for
         determinism.
      4. Return the resolved variant's text + a provenance overlay entry.

    Phase 2 MVP scope. Refs are passed through as overlay metadata but not
    yet resolved against entities (Phase 2b). composition_assets_patch /
    guidance_patch are not produced by op execution today.
    """
    op_id = request.op_id.strip()
    if not op_id:
        raise HTTPException(status_code=400, detail="op_id_required")

    warnings: List[str] = []

    # Optional signature validation. Mirrors validate_signature_contract's
    # prefix check; full required_params/refs validation is left to
    # compile-time (we trust the signature was already enforced when the
    # op-pack compiled).
    if request.signature_id:
        signature = get_op_signature(request.signature_id)
        if signature is None:
            raise HTTPException(
                status_code=400,
                detail=f"unknown_signature: {request.signature_id}",
            )
        if not op_id.startswith(signature.op_id_prefix):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"op_id '{op_id}' does not match signature "
                    f"'{request.signature_id}' (expects prefix '{signature.op_id_prefix}')"
                ),
            )
        if request.modality and request.modality not in signature.allowed_modalities:
            warnings.append(
                f"modality '{request.modality}' not in signature.allowed_modalities "
                f"({', '.join(signature.allowed_modalities)})"
            )

    # Variant lookup — GIN-indexed tags filter on op_id.
    from pixsim7.backend.main.domain.blocks import BlockPrimitive

    query = build_block_primitive_query(tag_query={"op_id": op_id})
    query = query.order_by(BlockPrimitive.block_id)

    async with get_async_blocks_session() as blocks_db:
        result = await blocks_db.execute(query)
        candidates = list(result.scalars().all())

    if not candidates:
        raise HTTPException(
            status_code=404,
            detail=f"no_variants_for_op: {op_id}",
        )

    # Score each candidate. Tuple ordering: (matched, -mismatched, -block_id)
    # so highest score wins; on tie, fewer mismatches; on still-tie,
    # alphabetical block_id for determinism.
    scored: List[tuple[tuple[int, int, str], Any]] = []
    for block in candidates:
        block_tags = block.tags if isinstance(block.tags, dict) else {}
        matched, mismatched = _score_variant(
            block_tags=block_tags, params=request.params
        )
        scored.append(((matched, -mismatched, block.block_id), block))
    scored.sort(key=lambda pair: pair[0], reverse=True)

    best_score, best_block = scored[0]
    best_matched, best_neg_mismatched, _ = best_score
    best_mismatched = -best_neg_mismatched

    # "Exactly" = every supplied param landed on a constrained tag and
    # matched it. (User params that the variant doesn't constrain are
    # neutral, not a mismatch — but they're also not "exact" if the user
    # intended them as constraints.)
    matched_exactly = (
        best_mismatched == 0
        and best_matched == len([k for k in request.params if k])
    )

    if best_matched == 0 and request.params:
        # Variants exist but none picked up any of the user's params.
        # This typically means params reference a tag the schema author
        # didn't declare — surface as a warning rather than failing.
        warnings.append(
            "no params matched any variant tag; returning variant by id order"
        )
    elif best_mismatched > 0:
        warnings.append(
            f"best variant has {best_mismatched} mismatched param(s); "
            f"matched {best_matched} of {len(request.params)} supplied"
        )

    block_tags = best_block.tags if isinstance(best_block.tags, dict) else {}
    composition_role = block_tags.get("composition_role") if isinstance(block_tags.get("composition_role"), str) else None

    # Normalize refs to canonical tokens. Malformed entries are kept verbatim
    # in op_refs and surfaced as a warning so the user can debug what they
    # sent; we don't reject the request because refs are provenance-only in
    # this push.
    resolved_refs: Dict[str, str] = {}
    unparseable_ref_keys: List[str] = []
    for ref_key, raw_value in request.refs.items():
        normalized = _normalize_ref(raw_value)
        if normalized is None:
            resolved_refs[ref_key] = raw_value if isinstance(raw_value, str) else str(raw_value)
            unparseable_ref_keys.append(ref_key)
        else:
            resolved_refs[ref_key] = normalized
    if unparseable_ref_keys:
        warnings.append(
            "could not normalize refs (kept raw): "
            + ", ".join(sorted(unparseable_ref_keys))
        )

    overlay = OpExecuteOverlayEntry(
        block_id=best_block.block_id,
        text=str(best_block.text or ""),
        role=composition_role,
        category=getattr(best_block, "category", None),
        source_op=op_id,
        op_params=dict(request.params),
        op_refs=resolved_refs,
        signature_id=request.signature_id,
    )

    return OpExecuteResponse(
        prompt_text=str(best_block.text or ""),
        block_id=best_block.block_id,
        block_overlay=overlay,
        matched_exactly=matched_exactly,
        warnings=warnings,
    )
