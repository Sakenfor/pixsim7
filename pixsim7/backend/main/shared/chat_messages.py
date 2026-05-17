"""Shared chat-message merge for ChatSession.messages writers.

Three code paths write to `ChatSession.messages`:
  1. Frontend PATCH via `save_chat_session_messages` (debounced sync).
  2. Bridge-side reply persist via `_store_session_response`.
  3. Late-result drain placeholder via `_drain_late_result`.

All three must converge to the same merge semantics: take the union of the
in-DB row and the new payload, dedupe by ``(role, stripped text, kind)``,
preserve server-side fields on collision, sort by ISO-8601 timestamp.

Why this lives in `shared/` and not as a `meta_contracts.py` helper:
the b9792a1e investigation (commit ``10d673d2a``) hardened only path (1).
Paths (2) and (3) kept doing `session.messages = new_list` directly, which
silently clobbered concurrent path-(1) PATCHes — the same failure mode in
the opposite direction. Routing all three through one helper closes the
loop.

Identity is **timestamp-insensitive** because the bridge writes timestamps
via Python's ``utcnow().isoformat()`` (``…+00:00``) while the frontend
appends with JS ``Date.toISOString()`` (``…Z``). An earlier merge keyed on
timestamp kept both copies of every assistant turn, which the frontend's
``findMissingAssistantTail`` reconcile then re-pasted as "Response recovered
from server" duplicates. ``kind`` discriminates ``kind:"abandoned"`` from
ad-hoc ``Bridge disconnected`` notices.

Server copy wins on collisions so backend-only fields (``kind``,
``duration_ms``, …) survive a frontend round-trip.

Trade-off: two truly identical adjacent rows (same role+text+kind) collapse
to one — repeated ``Bridge disconnected`` notices, double-sent prompts, etc.
That's the right call in practice; the frontend debounces the only realistic
source.
"""
from __future__ import annotations

from typing import Any, Dict, List


def chat_message_key(m: Any) -> tuple:
    """Dedupe identity for a chat row: ``(role, stripped text, kind)``.

    The single source of truth for "is this the same message". Used by the
    merge below and by callers that need to tell whether a row they're about
    to merge is genuinely new (e.g. emit-once notification sourcing).
    """
    if not isinstance(m, dict):
        return ("", str(m), "")
    role = m.get("role") or ""
    text = (m.get("text") or "").strip() if isinstance(m.get("text"), str) else ""
    kind = m.get("kind") or ""
    return (role, text, kind)


def merge_chat_messages(
    server_msgs: List[Any] | None,
    new_msgs: List[Any],
) -> List[Dict[str, Any]]:
    """Union the new payload with current server state, ordered by timestamp.

    Args:
        server_msgs: The current ``ChatSession.messages`` value from the DB.
            ``None`` and non-dict entries are tolerated (returned empty / skipped).
        new_msgs: Rows the caller wants appended. May overlap with ``server_msgs``
            on dedupe identity — server copy wins so the merged row keeps any
            backend-only fields the caller didn't know about.

    Returns:
        Ordered list of dict rows. Each input row appears at most once.
    """
    key = chat_message_key

    def ts_of(m: Any) -> str:
        if not isinstance(m, dict):
            return ""
        return m.get("timestamp") or ""

    seen: Dict[tuple, Dict[str, Any]] = {}
    order: List[tuple] = []
    for m in (server_msgs or []):
        if isinstance(m, dict):
            k = key(m)
            if k not in seen:
                seen[k] = m
                order.append(k)
    for m in new_msgs:
        if isinstance(m, dict):
            k = key(m)
            if k not in seen:
                seen[k] = m
                order.append(k)

    def sort_key(k: tuple) -> tuple:
        # Stable secondary sort by insertion order keeps untimestamped
        # rows in arrival order, and breaks timestamp ties deterministically.
        ts = ts_of(seen[k])
        return (0 if ts else 1, ts, order.index(k))

    return [seen[k] for k in sorted(order, key=sort_key)]
