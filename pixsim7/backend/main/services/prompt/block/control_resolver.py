"""Control resolution — converts raw control specs to fully enumerated controls.

Controls fall into two categories:

- **Eager controls** (e.g. ``slider``): fully specified in YAML; passed through
  unchanged by the resolver.  All information needed to render and apply the
  control is already present.

- **Lazy controls** (e.g. ``tag_select``): declare *intent* — which tag dimension
  to drive and which slot to target — without hardcoding the option list.
  Options and effects are derived at resolve time from the vocabulary and/or
  block catalog.  This means a content pack can add a new block with a new tag
  value and the control automatically gains a new option with no YAML change.

Resolution is intentionally **pure**: callers inject the vocab dict and an
optional ``block_query_fn`` for catalog-backed fallbacks.  This keeps the
resolver testable without a live database and decoupled from the load pipeline.

Typical call site (request time, after template is loaded from DB):

    from pixsim7.backend.main.services.prompt.block.control_resolver import resolve_controls
    from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
        get_canonical_block_tag_dictionary,
    )

    vocab = get_canonical_block_tag_dictionary()
    slot_constraints = {slot["label"]: slot.get("tag_constraints", {}) for slot in template["slots"]}
    resolved = resolve_controls(
        template["template_metadata"].get("controls", []),
        vocab=vocab,
        slot_constraints_by_label=slot_constraints,
    )
"""
from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Optional


# Callable contract for catalog-backed option discovery.
# Receives: (tag_key, slot_constraints_dict) → sorted list of distinct string values.
# Callers that have DB access should supply a real implementation; pass None to
# restrict resolution to vocab-backed tags only.
BlockQueryFn = Callable[[str, Dict[str, Any]], List[str]]


# ── Label helpers ─────────────────────────────────────────────────────────────

def _auto_label(value: str, tag_meta: Optional[Dict[str, Any]] = None) -> str:
    """Derive a human-readable label from a tag value.

    Priority:
    1. ``value_labels`` override in vocab tag metadata (optional field; not yet
       present in the standard YAML schema but supported here for future use).
    2. Auto-generated: snake_case / kebab-case → "Title Case".

    Examples::

        _auto_label("sandy_warm")          → "Sandy Warm"
        _auto_label("skin_tight")          → "Skin Tight"
        _auto_label("a_line")             → "A Line"
        _auto_label("ots", {"value_labels": {"ots": "Over-Shoulder"}})
                                           → "Over-Shoulder"
    """
    if tag_meta:
        value_labels = tag_meta.get("value_labels") or {}
        if isinstance(value_labels, dict) and value in value_labels:
            return str(value_labels[value])
    # snake_case or kebab-case → Title Case
    return re.sub(r"[_\-]+", " ", str(value)).title()


# ── tag_select resolution ─────────────────────────────────────────────────────

def _resolve_option_values(
    tag: str,
    *,
    tag_meta: Dict[str, Any],
    block_query_fn: Optional[BlockQueryFn],
    slot_constraints: Optional[Dict[str, Any]],
) -> List[str]:
    """Return ordered option values for a ``tag_select`` control.

    Source priority:
    1. Vocab ``allowed_values`` — authoritative for constrained tags (e.g.
       ``theme_variant``, ``proximity_stage``).  Order is preserved as defined
       in the vocab YAML.
    2. ``block_query_fn`` catalog fallback — for open-vocab tags (e.g.
       ``variant``) whose ``allowed_values`` list is empty.  The function is
       expected to return a sorted, deduplicated list.
    3. Empty list — caller decides how to surface the gap (warn / hide control).
    """
    allowed = list(tag_meta.get("allowed_values") or [])
    if allowed:
        return [str(v) for v in allowed]

    if block_query_fn is not None:
        constraints = dict(slot_constraints or {})
        return list(block_query_fn(tag, constraints))

    return []


def resolve_tag_select_control(
    control: Dict[str, Any],
    *,
    vocab: Dict[str, Dict[str, Any]],
    block_query_fn: Optional[BlockQueryFn] = None,
    slot_constraints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resolve a ``tag_select`` control to a fully enumerated ``select`` control.

    The resolved shape is a plain ``select`` control with an ``options`` list.
    Each option carries auto-derived effects:

    - ``boostTags``: ``{tag: selected_value}``
    - ``avoidTags``: ``{tag: [all other values]}`` (omitted when only one option)

    Args:
        control: Raw ``tag_select`` control dict (from template YAML or DB).
        vocab: Canonical tag dictionary (from ``get_canonical_block_tag_dictionary()``).
        block_query_fn: Optional catalog-backed option discovery callable.
        slot_constraints: Optional tag_constraints dict for the target slot;
            used to scope catalog queries for open-vocab tags.

    Returns:
        A resolved control dict with ``type: "select"`` and a populated
        ``options`` list.  Extra fields from the source control (e.g.
        ``description``) are forwarded unchanged.
    """
    tag = str(control["target_tag"]).strip()
    slot_label = str(control["target_slot"]).strip()
    tag_meta: Dict[str, Any] = vocab.get(tag) or {}

    values = _resolve_option_values(
        tag,
        tag_meta=tag_meta,
        block_query_fn=block_query_fn,
        slot_constraints=slot_constraints,
    )

    options: List[Dict[str, Any]] = []
    for value in values:
        avoid = [v for v in values if v != value]
        effect: Dict[str, Any] = {
            "kind": "slot_tag_boost",
            "slotLabel": slot_label,
            "boostTags": {tag: value},
        }
        if avoid:
            effect["avoidTags"] = {tag: avoid}
        options.append({
            "id": value,
            "label": _auto_label(value, tag_meta),
            "effects": [effect],
        })

    default = control.get("defaultValue")
    if default is None and values:
        default = values[0]

    # Preserve any extra authoring fields (e.g. description, notes) but drop
    # the lazy-control-specific fields that have been consumed.
    _consumed = {"id", "type", "label", "defaultValue", "target_tag", "target_slot"}
    forwarded = {k: v for k, v in control.items() if k not in _consumed}

    return {
        "id": control["id"],
        "type": "select",
        "label": control["label"],
        "defaultValue": default,
        "options": options,
        **forwarded,
    }


# ── Dispatch ──────────────────────────────────────────────────────────────────

#: Control types that require resolution before being served to clients.
LAZY_CONTROL_TYPES: frozenset[str] = frozenset({"tag_select"})


def is_lazy_control(control: Any) -> bool:
    """Return True if ``control`` requires resolution before serving to clients."""
    return isinstance(control, dict) and control.get("type") in LAZY_CONTROL_TYPES


def resolve_control(
    control: Dict[str, Any],
    *,
    vocab: Dict[str, Dict[str, Any]],
    block_query_fn: Optional[BlockQueryFn] = None,
    slot_constraints_by_label: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Resolve a single control spec.

    Eager controls (``slider``, explicit ``select``, etc.) are returned
    unchanged.  Lazy controls (``tag_select``) are fully resolved.

    Args:
        control: Raw control dict from ``template_metadata.controls``.
        vocab: Canonical tag dictionary.
        block_query_fn: Optional catalog-backed option discovery callable.
        slot_constraints_by_label: Optional mapping of slot label →
            tag_constraints dict, used to scope catalog queries.
    """
    ctrl_type = control.get("type")
    if ctrl_type == "tag_select":
        target_slot = str(control.get("target_slot") or "")
        slot_constraints = None
        if slot_constraints_by_label and target_slot:
            slot_constraints = slot_constraints_by_label.get(target_slot)
        return resolve_tag_select_control(
            control,
            vocab=vocab,
            block_query_fn=block_query_fn,
            slot_constraints=slot_constraints,
        )

    # Eager types pass through unchanged.
    return control


def resolve_controls(
    controls: List[Dict[str, Any]],
    *,
    vocab: Dict[str, Dict[str, Any]],
    block_query_fn: Optional[BlockQueryFn] = None,
    slot_constraints_by_label: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Resolve a list of control specs. See :func:`resolve_control`."""
    return [
        resolve_control(
            c,
            vocab=vocab,
            block_query_fn=block_query_fn,
            slot_constraints_by_label=slot_constraints_by_label,
        )
        for c in controls
    ]
