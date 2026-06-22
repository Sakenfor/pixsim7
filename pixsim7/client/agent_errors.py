"""Typed agent-side error model.

A structured view over the wildly inconsistent shapes Claude / Codex emit
when an agent turn fails. The bridge maps :attr:`AgentError.category` →
user-facing ``error_code`` and decides whether to retry; the frontend
keys retry/banner UX on the error_code. Without this, every failure
collapses to a single generic ``task_error`` string and the UI can't
distinguish "Anthropic is overloaded, just retry" from "your auth token
expired" from "the model rejected the prompt".

This module is the single source of truth for:
  * the category vocabulary (:data:`AGENT_ERROR_CATEGORY`)
  * which categories are retryable (:func:`is_retryable`)
  * the Claude stream-json classifier (:func:`classify_claude_error`)
  * the category → wire-format error_code mapping (:func:`wire_error_code`)
"""
from __future__ import annotations

import re
from dataclasses import dataclass


# ── Category vocabulary ─────────────────────────────────────────────

# All categories surfaced by the classifier. Adding a new one requires:
#   1. Adding it here.
#   2. Mapping it in _WIRE_CODE_BY_CATEGORY below.
#   3. Updating tests that parametrize over the full set.
AGENT_ERROR_CATEGORY = (
    "overloaded",        # Anthropic 529 / overloaded_error — retry will likely succeed
    "rate_limited",      # 429 / rate_limit_error — retry after backoff
    "auth",              # 401/403 / authentication_error / permission_error — relogin needed
    "model_not_found",   # 404 — model unavailable
    "max_turns",         # subtype=error_max_turns — agent gave up
    "server_error",      # other 5xx / unspecified server fault — retryable
    "client_error",      # other 4xx / invalid_request_error — not retryable
    "unknown",           # fallback — don't auto-retry
)

_RETRYABLE_CATEGORIES = frozenset({"overloaded", "rate_limited", "server_error"})


# Wire-format error_code surfaced to main-api and the frontend. Part of
# the bridge → main-api → UI contract — keep stable when renaming.
_WIRE_CODE_BY_CATEGORY: dict[str, str] = {
    "overloaded": "agent_overloaded",
    "rate_limited": "agent_rate_limited",
    "auth": "agent_auth",
    "model_not_found": "agent_model_unavailable",
    "max_turns": "agent_max_turns",
    "server_error": "agent_server_error",
    "client_error": "agent_client_error",
    "unknown": "agent_unknown",
}


def is_retryable(category: str) -> bool:
    return category in _RETRYABLE_CATEGORIES


def wire_error_code(category: str) -> str:
    """Map an :class:`AgentError` category to its stable wire error_code.

    Unknown categories fall back to ``"agent_unknown"`` rather than raising
    so a future protocol that emits an out-of-band category doesn't crash
    the bridge.
    """
    return _WIRE_CODE_BY_CATEGORY.get(category, "agent_unknown")


# ── Dataclass ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class AgentError:
    """Typed agent-side error. Carries enough structure for the bridge
    to pick a retry policy and the frontend to render an actionable banner.
    """
    category: str
    message: str
    http_status: int | None = None
    retryable: bool = False
    retry_after_ms: int | None = None
    raw: dict | None = None


# ── Internal helpers ────────────────────────────────────────────────

# Synthetic "API Error: NNN <title>. <detail>" rendered by Claude Code when
# the upstream Anthropic API fails mid-turn. The status code is the only
# reliable category signal in that case — `subtype` is often "success"
# because the CLI itself completed (rendering the synthetic message) even
# though `is_error` is true.
_API_ERROR_RE = re.compile(r"^API Error:\s*(\d{3})\b", re.IGNORECASE)

# Map Anthropic API error `type` strings → our category. Covers both the
# bare `error: "overloaded_error"` field on stream-json result events and
# the `errors[0].type` shape on batch error responses.
_ERROR_TYPE_CATEGORY: dict[str, str] = {
    "overloaded_error": "overloaded",
    "overloaded": "overloaded",
    "rate_limit_error": "rate_limited",
    "rate_limit": "rate_limited",
    "authentication_error": "auth",
    "permission_error": "auth",
    "not_found_error": "model_not_found",
    "server_error": "server_error",
    "api_error": "server_error",
    "invalid_request_error": "client_error",
}


def _category_from_http_status(status: int) -> str:
    if status in (401, 403):
        return "auth"
    if status == 404:
        return "model_not_found"
    if status == 429:
        return "rate_limited"
    if status == 529:
        return "overloaded"
    if 500 <= status < 600:
        return "server_error"
    if 400 <= status < 500:
        return "client_error"
    return "unknown"


def _coerce_int(val) -> int | None:
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.strip().isdigit():
        return int(val.strip())
    return None


def _dict_message(d: dict) -> str:
    """Extract a human-readable message from a dict-shaped error.

    Walks the conventional keys (``message`` → ``detail`` → ``error``) and
    returns the first non-empty string. Used both by the classifier and by
    protocols that hand-build error events from upstream JSON-RPC shapes.
    """
    for key in ("message", "detail", "error"):
        val = d.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


_FREEFORM_SIGNATURE_CATEGORY: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        (
            "session limit",
            "rate limit",
            "rate-limit",
            "too many requests",
            "quota",
            "you've hit",
            "you have hit",
            "usage limit",
        ),
        "rate_limited",
    ),
    (
        (
            "unauthorized",
            "not authenticated",
            "authentication failed",
            "not logged in",
            "please log in",
            "invalid api key",
            "token expired",
            "session expired",
            "login again",
        ),
        "auth",
    ),
    (
        (
            "model not found",
            "unknown model",
            "model unavailable",
            "no such model",
            "model does not exist",
        ),
        "model_not_found",
    ),
    (("overloaded", "temporarily unavailable", "try again later"), "overloaded"),
    (("internal server error", "server error"), "server_error"),
    (("invalid request", "bad request"), "client_error"),
)


def _category_from_freeform_message(message: str) -> str:
    low = (message or "").lower()
    if not low:
        return ""
    for needles, category in _FREEFORM_SIGNATURE_CATEGORY:
        if any(needle in low for needle in needles):
            return category
    return ""


# ── Public API ──────────────────────────────────────────────────────


def generic_agent_error(message: str, raw: dict | None = None) -> AgentError:
    """Wrap a free-form error string in an unstructured :class:`AgentError`.

    Used by protocols (Codex variants) that haven't been taught structured
    classification yet, and as the session-layer backstop when a protocol
    produced a string-only error event.
    """
    return AgentError(
        category="unknown",
        message=(message or "").strip() or "Agent returned an error (no detail)",
        retryable=False,
        raw=raw,
    )


def classify_claude_error(raw: dict) -> AgentError:
    """Walk Claude's stream-json error shape and produce a typed AgentError.

    Claude's shape varies — the same upstream failure surfaces differently
    depending on whether it happened in the CLI, in Anthropic's API, or in
    a hook. Notable cases this handles:

    * Anthropic API outage (529 Overloaded) — Claude renders a synthetic
      assistant message into ``result`` like ``"API Error: 529 Overloaded. …"``
      and sets ``is_error=true``. ``subtype`` is often the misleading
      string ``"success"`` because the CLI completed normally. Without
      parsing ``result`` for the HTTP status, we'd surface ``"success"``
      verbatim as the error message — which is what triggered this rewrite.
    * ``subtype=error_max_turns`` — agent gave up; not retryable.
    * Batch ``errors: [{type, message, status}]`` — extract directly.
    * Bare ``stop_reason`` — last-resort fallback.
    """
    # 1) errors[] array (Anthropic batch / structured error shape)
    errors = raw.get("errors")
    first_err_msg = ""
    first_err_status: int | None = None
    first_err_type = ""
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict):
            first_err_msg = _dict_message(first)
            first_err_status = _coerce_int(
                first.get("status") or first.get("http_status") or first.get("code")
            )
            type_val = first.get("type")
            if isinstance(type_val, str):
                first_err_type = type_val.strip().lower()
        elif isinstance(first, str):
            first_err_msg = first.strip()

    # 2) Synthetic "API Error: NNN ..." inside `result` (the common 529 path)
    result_text_raw = raw.get("result")
    result_text = result_text_raw.strip() if isinstance(result_text_raw, str) else ""
    parsed_api_status: int | None = None
    if result_text:
        m = _API_ERROR_RE.match(result_text)
        if m:
            try:
                parsed_api_status = int(m.group(1))
            except ValueError:
                pass

    # 3) Top-level `apiErrorStatus` (Claude Code attaches this on synthetic
    #    api-error assistant messages)
    api_status = _coerce_int(
        raw.get("apiErrorStatus") if raw.get("apiErrorStatus") is not None else raw.get("api_error_status")
    )

    # 4) `error` field — sometimes a string ("server_error"), sometimes a dict
    error_label_raw = raw.get("error")
    error_label = ""
    if isinstance(error_label_raw, str):
        error_label = error_label_raw.strip().lower()
    elif isinstance(error_label_raw, dict):
        t = error_label_raw.get("type")
        if isinstance(t, str):
            error_label = t.strip().lower()
        if not first_err_msg:
            first_err_msg = _dict_message(error_label_raw)
        if first_err_status is None:
            first_err_status = _coerce_int(error_label_raw.get("status"))

    subtype_raw = raw.get("subtype")
    subtype = subtype_raw.strip().lower() if isinstance(subtype_raw, str) else ""

    http_status = first_err_status or parsed_api_status or api_status

    signature_category = _category_from_freeform_message(
        " ".join(part for part in (first_err_msg, result_text) if part)
    )

    # ----- Category resolution -----
    if subtype == "error_max_turns":
        category = "max_turns"
    elif first_err_type in _ERROR_TYPE_CATEGORY:
        category = _ERROR_TYPE_CATEGORY[first_err_type]
    elif http_status is not None:
        category = _category_from_http_status(http_status)
    elif error_label in _ERROR_TYPE_CATEGORY:
        category = _ERROR_TYPE_CATEGORY[error_label]
    elif signature_category:
        category = signature_category
    elif subtype == "error_during_execution":
        category = "server_error"
    else:
        category = "unknown"

    # ----- Message resolution -----
    if first_err_msg:
        message = first_err_msg
    elif result_text:
        message = result_text
    elif subtype and subtype != "success":
        # Skip the misleading "success" subtype that appears alongside is_error=true.
        message = subtype.replace("_", " ")
    else:
        stop_reason_raw = raw.get("stop_reason")
        if isinstance(stop_reason_raw, str) and stop_reason_raw.strip():
            message = f"stop_reason: {stop_reason_raw.strip()}"
        else:
            message = "Claude returned an error result (no detail)"

    return AgentError(
        category=category,
        message=message,
        http_status=http_status,
        retryable=is_retryable(category),
        retry_after_ms=None,
        raw=raw,
    )


# An HTTP status embedded in free-form Codex text, but ONLY in error-ish
# context — avoids misreading "read 500 files" / "resets 8:20" as a status.
_CODEX_STATUS_RE = re.compile(
    r"(?:status|code|http|error)\s*[:=#]?\s*([45]\d\d)\b"
    r"|\b([45]\d\d)\s+(?:error|status)\b"
    r"|[\(\[]\s*([45]\d\d)\s*[\)\]]",
    re.IGNORECASE,
)

# Ordered signature → category table (first match wins). Word-based, NOT bare
# numbers, so a digit in a normal sentence can't trip a category. Matched
# against the lower-cased message.
_CODEX_SIGNATURE_CATEGORY = _FREEFORM_SIGNATURE_CATEGORY


def classify_codex_error(message: str, raw: dict | None = None) -> AgentError:
    """Classify a free-form Codex error message into a typed :class:`AgentError`.

    Codex (app-server + exec) doesn't emit a consistent machine-readable error
    code the way the Anthropic API does, so we infer the category from the
    message text plus any HTTP status it mentions in error context. Signature
    matches win over a bare status (a 429 "session limit" reads as rate_limited
    either way). Falls back to ``unknown`` — the prior behaviour — when nothing
    matches, so this only ever *adds* signal, never removes a working classification.

    Replaces the previous ``generic_agent_error`` funnel for Codex, which
    collapsed every failure (rate limits, relogin, model gone) to "unknown" and
    a non-retryable banner. The bridge keys retry policy on ``retryable`` and the
    UI keys its banner on the wire error_code, so a correct category here is what
    turns "unknown error" into an actionable "Rate limited — retry shortly".
    """
    msg = (message or "").strip()
    low = msg.lower()

    status: int | None = None
    m = _CODEX_STATUS_RE.search(msg)
    if m:
        status = int(next(g for g in m.groups() if g))

    category = ""
    for needles, cat in _CODEX_SIGNATURE_CATEGORY:
        if any(n in low for n in needles):
            category = cat
            break
    if not category and status is not None:
        category = _category_from_http_status(status)
    if not category:
        category = "unknown"

    return AgentError(
        category=category,
        message=msg or "Codex returned an error (no detail)",
        http_status=status,
        retryable=is_retryable(category),
        raw=raw,
    )
