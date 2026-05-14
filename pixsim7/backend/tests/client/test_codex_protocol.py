"""Unit tests for Codex app-server protocol normalization/parsing."""

from __future__ import annotations

TEST_SUITE = {
    "id": "client-codex-protocol",
    "label": "Client Codex Protocol Tests",
    "kind": "unit",
    "category": "client/protocols",
    "covers": [
        "pixsim7/client/protocols.py",
    ],
    "order": 18.7,
}

import pytest

try:
    from pixsim7.client.protocols import CodexAppServerProtocol

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


class TestCodexReasoningEffortNormalization:
    def test_maps_claude_max_to_xhigh(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="max")
        assert "model_reasoning_effort=xhigh" in cmd

    def test_maps_minimal_to_low(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="minimal")
        assert "model_reasoning_effort=low" in cmd

    def test_invalid_effort_falls_back_to_safe_default_for_non_default_model(self):
        p = CodexAppServerProtocol()
        cmd = p.build_start_cmd("codex", model="gpt-5.3-codex", reasoning_effort="weird")
        assert "model_reasoning_effort=high" in cmd


class TestCodexErrorParsing:
    def test_parses_method_error_notification(self):
        p = CodexAppServerProtocol()
        evt = {
            "method": "error",
            "params": {"error": {"message": "The selected model is not available"}},
        }
        parsed = p.parse_event(evt)
        assert parsed.kind == "error"
        assert "selected model" in parsed.text.lower()
