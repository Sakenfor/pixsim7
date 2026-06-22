"""Tests for the typed :class:`AgentError` surface end-to-end.

Closes the gap that produced ``Agent error: success`` log lines: when
Claude's stream-json ``result`` event carried ``is_error=true`` plus a
misleading ``subtype="success"``, the old parser surfaced the subtype
verbatim. The new classifier walks the full shape and produces a typed
:class:`AgentError` the bridge maps to a per-category error_code.

Coverage spans the four files that participate in the agent-error path:
``agent_errors`` (model + classifier + wire mapping), ``protocols``
(Claude classifier integration + Codex helper), ``session`` (typed
exception raise), ``bridge`` (wire payload formatting).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-agent-errors",
    "label": "Client agent-error model + classifier + wire mapping",
    "kind": "unit",
    "category": "client/agent-errors",
    "covers": [
        "pixsim7/client/agent_errors.py",
        "pixsim7/client/protocols.py",
        "pixsim7/client/session.py",
        "pixsim7/client/bridge.py",
    ],
    "order": 18.8,
}

import pytest

from pixsim7.client.agent_errors import (
    AGENT_ERROR_CATEGORY,
    classify_codex_error,
    generic_agent_error,
    wire_error_code,
)
from pixsim7.client.protocols import (
    AgentError,
    ClaudeProtocol,
    CodexAppServerProtocol,
    _classify_claude_error,
)
from pixsim7.client.session import AgentTaskError
from pixsim7.client.bridge import Bridge


# ── Classifier: the regression case ───────────────────────────────


class TestApiErrorOverloaded:
    """The original bug: ``subtype=success`` + ``is_error=true`` + a
    synthetic ``"API Error: 529 Overloaded..."`` rendered into ``result``.

    Old behavior surfaced the literal string ``"success"`` as the error
    message. The classifier must look at ``result`` to recover the real
    status and category.
    """

    def test_529_in_result_text_categorized_as_overloaded(self):
        raw = {
            "type": "result",
            "is_error": True,
            "subtype": "success",
            "result": (
                "API Error: 529 Overloaded. This is a server-side issue, "
                "usually temporary — try again in a moment."
            ),
            "stop_reason": "stop_sequence",
        }
        err = _classify_claude_error(raw)
        assert err.category == "overloaded"
        assert err.http_status == 529
        assert err.retryable is True
        # Surfaces the readable API error, not the misleading subtype.
        assert "529" in err.message
        assert err.message != "success"

    def test_apierror_status_field_picked_up(self):
        raw = {
            "type": "result",
            "is_error": True,
            "subtype": "success",
            "apiErrorStatus": 529,
            "error": "server_error",
            "result": "API Error: 529 Overloaded. …",
        }
        err = _classify_claude_error(raw)
        assert err.category == "overloaded"
        assert err.http_status == 529
        assert err.retryable is True


# ── Classifier: other HTTP statuses ────────────────────────────────


class TestHttpStatusCategorization:
    """One representative test per status → category mapping."""

    @pytest.mark.parametrize(
        "status, expected_category, expected_retryable",
        [
            (429, "rate_limited", True),
            (401, "auth", False),
            (403, "auth", False),
            (404, "model_not_found", False),
            (500, "server_error", True),
            (503, "server_error", True),
            (529, "overloaded", True),
            (400, "client_error", False),
            (422, "client_error", False),
        ],
    )
    def test_status_to_category(self, status, expected_category, expected_retryable):
        raw = {
            "type": "result",
            "is_error": True,
            "result": f"API Error: {status} Some message",
        }
        err = _classify_claude_error(raw)
        assert err.category == expected_category
        assert err.http_status == status
        assert err.retryable is expected_retryable


# ── Classifier: subtype-driven categories ──────────────────────────


class TestSubtypeCategorization:
    def test_error_max_turns(self):
        raw = {"type": "result", "is_error": True, "subtype": "error_max_turns"}
        err = _classify_claude_error(raw)
        assert err.category == "max_turns"
        assert err.retryable is False
        assert "max turns" in err.message

    def test_error_during_execution_defaults_to_server_error(self):
        raw = {
            "type": "result",
            "is_error": True,
            "subtype": "error_during_execution",
        }
        err = _classify_claude_error(raw)
        assert err.category == "server_error"
        assert err.retryable is True

    def test_subtype_success_alone_is_skipped(self):
        """`subtype="success"` with no other signals must NOT surface as the message."""
        raw = {"type": "result", "is_error": True, "subtype": "success"}
        err = _classify_claude_error(raw)
        assert err.message != "success"
        assert err.category == "unknown"


# ── Classifier: errors[] array shape ───────────────────────────────


class TestErrorsArrayShape:
    def test_dict_with_type_and_message(self):
        raw = {
            "type": "result",
            "is_error": True,
            "errors": [
                {"type": "overloaded_error", "message": "Anthropic is overloaded"}
            ],
        }
        err = _classify_claude_error(raw)
        assert err.category == "overloaded"
        assert err.message == "Anthropic is overloaded"
        assert err.retryable is True

    def test_dict_with_explicit_status(self):
        raw = {
            "type": "result",
            "is_error": True,
            "errors": [{"status": 429, "message": "Rate limited"}],
        }
        err = _classify_claude_error(raw)
        assert err.category == "rate_limited"
        assert err.http_status == 429
        assert err.retryable is True

    def test_authentication_error_type(self):
        raw = {
            "type": "result",
            "is_error": True,
            "errors": [{"type": "authentication_error", "message": "Bad token"}],
        }
        err = _classify_claude_error(raw)
        assert err.category == "auth"
        assert err.retryable is False
        assert err.message == "Bad token"


# ── Classifier: error field as string vs dict ──────────────────────


class TestErrorFieldShapes:
    def test_error_string_overloaded(self):
        raw = {
            "type": "result",
            "is_error": True,
            "error": "overloaded_error",
        }
        err = _classify_claude_error(raw)
        assert err.category == "overloaded"
        assert err.retryable is True

    def test_error_dict_with_status(self):
        raw = {
            "type": "result",
            "is_error": True,
            "error": {
                "type": "rate_limit_error",
                "message": "Too many requests",
                "status": 429,
            },
        }
        err = _classify_claude_error(raw)
        assert err.category == "rate_limited"
        assert err.http_status == 429
        assert err.message == "Too many requests"


# ── Classifier: fallback paths ─────────────────────────────────────


class TestFallback:
    def test_session_limit_text_is_rate_limited(self):
        raw = {
            "type": "result",
            "is_error": True,
            "subtype": "success",
            "result": "You've hit your session limit - resets 5:20am (Europe/Belgrade)",
        }
        err = _classify_claude_error(raw)
        assert err.category == "rate_limited"
        assert err.retryable is True
        assert wire_error_code(err.category) == "agent_rate_limited"

    def test_stop_reason_only(self):
        raw = {
            "type": "result",
            "is_error": True,
            "stop_reason": "refusal",
        }
        err = _classify_claude_error(raw)
        assert err.category == "unknown"
        assert err.message == "stop_reason: refusal"
        assert err.retryable is False

    def test_completely_empty(self):
        raw = {"type": "result", "is_error": True}
        err = _classify_claude_error(raw)
        assert err.category == "unknown"
        assert err.message  # non-empty, generic fallback
        assert err.retryable is False


# ── ClaudeProtocol.parse_event: end-to-end attachment ──────────────


class TestParseEventAttachesError:
    """parse_event must return ``kind=error`` with a structured ``error``
    attached, not just a free-form text string."""

    def test_overloaded_result_event_routes_to_error_with_attachment(self):
        raw = {
            "type": "result",
            "is_error": True,
            "subtype": "success",
            "result": "API Error: 529 Overloaded. …",
        }
        parsed = ClaudeProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert isinstance(parsed.error, AgentError)
        assert parsed.error.category == "overloaded"
        assert parsed.error.http_status == 529
        # text mirrors the structured message so existing callers still work.
        assert parsed.text == parsed.error.message

    def test_subtype_error_max_turns_routes_to_error(self):
        raw = {"type": "result", "subtype": "error_max_turns"}
        parsed = ClaudeProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert parsed.error is not None
        assert parsed.error.category == "max_turns"


# ── Bridge: AgentTaskError → typed error_code ──────────────────────


class TestBridgeFormatTaskError:
    """The wire contract surfaced to main-api / frontend."""

    def test_overloaded_maps_to_agent_overloaded(self):
        err = AgentError(
            category="overloaded",
            message="API Error: 529 Overloaded",
            http_status=529,
            retryable=True,
        )
        payload = Bridge._format_task_error(AgentTaskError(err))
        assert payload["error_code"] == "agent_overloaded"
        assert payload["error"] == "API Error: 529 Overloaded"
        assert payload["error_details"] == {
            "category": "overloaded",
            "http_status": 529,
            "retryable": True,
            "retry_after_ms": None,
        }

    @pytest.mark.parametrize(
        "category, expected_code",
        [
            ("overloaded", "agent_overloaded"),
            ("rate_limited", "agent_rate_limited"),
            ("auth", "agent_auth"),
            ("model_not_found", "agent_model_unavailable"),
            ("max_turns", "agent_max_turns"),
            ("server_error", "agent_server_error"),
            ("client_error", "agent_client_error"),
            ("unknown", "agent_unknown"),
        ],
    )
    def test_every_category_maps_to_stable_code(self, category, expected_code):
        err = AgentError(category=category, message="m", retryable=False)
        payload = Bridge._format_task_error(AgentTaskError(err))
        assert payload["error_code"] == expected_code

    def test_unknown_category_falls_back_to_agent_unknown(self):
        """Defensive: an out-of-band category from a future protocol must
        still produce a valid error_code rather than KeyError-ing."""
        err = AgentError(category="not_a_real_category", message="m", retryable=False)
        payload = Bridge._format_task_error(AgentTaskError(err))
        assert payload["error_code"] == "agent_unknown"

    def test_plain_runtimeerror_still_works(self):
        """Non-AgentTaskError exceptions keep the legacy ``task_error`` code."""
        payload = Bridge._format_task_error(RuntimeError("boom"))
        assert payload["error_code"] == "task_error"
        assert payload["error"] == "boom"


# ── agent_errors module: direct unit tests ─────────────────────────


class TestWireErrorCode:
    """``wire_error_code`` is the canonical category → error_code mapping.

    Lives in ``agent_errors`` so it sits next to the category vocabulary;
    bridge imports it. Every category in :data:`AGENT_ERROR_CATEGORY`
    must round-trip to a stable code so we never silently emit
    ``agent_unknown`` for a known category that was renamed in one place.
    """

    @pytest.mark.parametrize("category", AGENT_ERROR_CATEGORY)
    def test_every_canonical_category_has_a_code(self, category):
        code = wire_error_code(category)
        assert code.startswith("agent_")

    def test_out_of_band_category_falls_back(self):
        assert wire_error_code("nope") == "agent_unknown"


class TestGenericAgentError:
    """``generic_agent_error`` is the unstructured wrap used by Codex
    protocols and by the session-layer backstop."""

    def test_basic_wrap(self):
        err = generic_agent_error("kaboom")
        assert err.category == "unknown"
        assert err.message == "kaboom"
        assert err.retryable is False

    def test_empty_message_gets_fallback(self):
        err = generic_agent_error("")
        assert err.message  # non-empty
        assert err.category == "unknown"

    def test_preserves_raw(self):
        raw = {"some": "event"}
        err = generic_agent_error("kaboom", raw=raw)
        assert err.raw is raw


# ── Codex helper: typed AgentError on every error path ─────────────


class TestCodexErrorEventsAreTyped:
    """The Codex protocol routes through ``_codex_error_event`` which
    attaches an :class:`AgentError` with ``category="unknown"``. Without
    this, the session backstop would have to fabricate one — costing a
    second source of "unknown error" message text.
    """

    def test_method_error_attaches_agent_error(self):
        raw = {
            "method": "error",
            "params": {"error": {"message": "The selected model is not available"}},
        }
        parsed = CodexAppServerProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert isinstance(parsed.error, AgentError)
        assert parsed.error.category == "unknown"
        assert "selected model" in parsed.error.message.lower()
        # text mirrors error.message
        assert parsed.text == parsed.error.message

    def test_turn_failed_attaches_agent_error(self):
        raw = {
            "method": "turn/failed",
            "params": {"message": "context length exceeded"},
        }
        parsed = CodexAppServerProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert isinstance(parsed.error, AgentError)
        assert "Codex turn failed" in parsed.text
        assert "context length" in parsed.text

    def test_jsonrpc_error_envelope_attaches_agent_error(self):
        raw = {"id": 5, "error": {"message": "method not found"}}
        parsed = CodexAppServerProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert isinstance(parsed.error, AgentError)
        assert "method not found" in parsed.text

    def test_contentless_system_error_gets_actionable_message(self):
        # Codex's real-world failure shape: a bare systemError with no detail.
        # Must not surface as "unknown" — point the user at the likely cause.
        raw = {
            "method": "thread/status/changed",
            "params": {"threadId": "t1", "status": {"type": "systemError"}},
        }
        parsed = CodexAppServerProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert "unknown" not in parsed.text.lower()
        low = parsed.text.lower()
        assert "subscription" in low or "plan" in low or "sign" in low


# ── Codex signature classifier ────────────────────────────────────


class TestClassifyCodexError:
    """``classify_codex_error`` infers a category from free-form Codex text.

    Codex has no consistent machine-readable error code, so a rate limit or
    relogin used to collapse to "unknown error" + a non-retryable banner. The
    classifier recovers the signal from the message so the bridge retries and
    the UI shows an actionable banner. Only ever ADDS signal — anything it
    can't recognize stays ``unknown`` (the prior behaviour).
    """

    def test_session_limit_is_rate_limited_and_retryable(self):
        # The exact wild message that surfaced as a vague systemError first.
        err = classify_codex_error(
            "Codex turn failed: You've hit your session limit · resets 8:20pm"
        )
        assert err.category == "rate_limited"
        assert err.retryable is True
        assert wire_error_code(err.category) == "agent_rate_limited"

    def test_auth_signature(self):
        err = classify_codex_error("Codex error: not logged in — please log in to continue")
        assert err.category == "auth"
        assert err.retryable is False

    def test_http_status_in_error_context(self):
        # 503 → server_error (only 529 maps to overloaded); both are retryable.
        err = classify_codex_error("Codex error: request failed with status 503")
        assert err.http_status == 503
        assert err.category == "server_error"
        assert err.retryable is True

    def test_bare_number_in_normal_text_does_not_classify(self):
        # "500 files" must NOT read as a server error — guards the status regex.
        err = classify_codex_error("Codex turn failed: scanned 500 files, found nothing")
        assert err.category == "unknown"
        assert err.http_status is None

    def test_unrecognized_stays_unknown(self):
        err = classify_codex_error("Codex systemError")
        assert err.category == "unknown"
        assert err.retryable is False

    def test_empty_message_fallback(self):
        err = classify_codex_error("")
        assert err.message  # non-empty fallback
        assert err.category == "unknown"

    def test_rate_limit_flows_through_parse_event(self):
        raw = {
            "method": "turn/failed",
            "params": {"message": "You've hit your session limit · resets 8:20pm"},
        }
        parsed = CodexAppServerProtocol().parse_event(raw)
        assert parsed.kind == "error"
        assert parsed.error.category == "rate_limited"
        assert parsed.error.retryable is True
