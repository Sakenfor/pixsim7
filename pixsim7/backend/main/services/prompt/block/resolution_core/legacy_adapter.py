from __future__ import annotations

from typing import Any, Iterable

from .trace import add_trace_event
from .types import ResolutionResult, SelectedBlock


def adapt_legacy_slot_results(
    slot_results: Iterable[dict[str, Any]],
    *,
    seed: int | None = None,
) -> ResolutionResult:
    """Convert current template roll `slot_results` into a `ResolutionResult`.

    This is a comparison/debug helper for the future `legacy_v1` adapter. It does
    not execute selection itself; it only normalizes the already-produced result
    shape into the new resolution trace/result contract.
    """
    result = ResolutionResult(resolver_id="legacy_v1", seed=seed)

    for idx, slot in enumerate(slot_results):
        label = str(slot.get("label") or f"slot_{idx}")
        key = str(slot.get("slot_key") or label)
        status = str(slot.get("status") or "unknown")
        add_trace_event(
            result.trace,
            kind="legacy_slot_result",
            target_key=key,
            message=status,
            data={"label": label, "status": status},
        )

        if status != "selected":
            if status in {"empty", "skipped", "fallback"}:
                result.warnings.append(f"{label}: {status}")
            continue

        block_id = str(slot.get("selected_block_string_id") or slot.get("selected_block_id") or "")
        if not block_id:
            result.warnings.append(f"{label}: selected slot missing block id")
            continue
        selector_debug = slot.get("selector_debug") if isinstance(slot.get("selector_debug"), dict) else {}
        selected = SelectedBlock(
            target_key=key,
            block_id=block_id,
            text=str(slot.get("prompt_preview") or ""),
            score=None,
            reasons=[],
            metadata={
                "label": label,
                "selector_strategy": slot.get("selector_strategy"),
                "selector_debug": selector_debug,
            },
        )
        result.selected_by_target[key] = selected
        add_trace_event(
            result.trace,
            kind="selected",
            target_key=key,
            candidate_block_id=block_id,
            data={"legacy_selector_debug": selector_debug},
        )

    result.diagnostics["adapted_slot_count"] = idx + 1 if "idx" in locals() else 0
    result.diagnostics["resolved_target_count"] = len(result.selected_by_target)
    return result
