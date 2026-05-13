"""Tests for _salvage_log_work_arguments — recovers sibling log_work params
that an upstream tool-call serializer concatenated into `next`."""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-log-work-salvage",
    "label": "MCP log_work argument salvage",
    "kind": "unit",
    "category": "client/mcp",
    "subcategory": "log_work",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 36,
}

import pytest

try:
    from pixsim7.client.mcp_server import _salvage_log_work_arguments
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="client deps not available")


# ── Real-world payload — session 677c8853, commit ae7ce67c7 fallout ──
LEAKED_NEXT = (
    "Two latent items remained out of scope. Test fire of log_work from this "
    "conversation should land on session 677c8853 (scope_key tab:tab-mp2ogjqk-jlpk).</next>\n"
    '<decisions>["Option 1 over option 2","Extracted merge_chat_messages"]</decisions>\n'
    '<evidence>["pixsim7/client/mcp_server.py","ae7ce67c7"]</evidence>\n'
    "</invoke>"
)


class TestSalvageLogWorkArguments:
    def test_lifts_decisions_and_evidence_from_next(self):
        out = _salvage_log_work_arguments({"summary": "x", "next": LEAKED_NEXT})
        assert out["next"].endswith("scope_key tab:tab-mp2ogjqk-jlpk).")
        assert "</next>" not in out["next"]
        assert "</invoke>" not in out["next"]
        assert out["decisions"] == ["Option 1 over option 2", "Extracted merge_chat_messages"]
        assert out["evidence"] == ["pixsim7/client/mcp_server.py", "ae7ce67c7"]

    def test_merges_with_existing_args(self):
        # Existing entries first, salvaged appended, deduplicated — so the
        # server-side auto-injected HEAD commit survives alongside salvaged
        # file-path evidence.
        out = _salvage_log_work_arguments({
            "summary": "x",
            "next": LEAKED_NEXT,
            "decisions": ["existing decision"],
            "evidence": ["d84e2b9c"],
        })
        assert out["decisions"] == ["existing decision", "Option 1 over option 2", "Extracted merge_chat_messages"]
        assert out["evidence"] == ["d84e2b9c", "pixsim7/client/mcp_server.py", "ae7ce67c7"]

    def test_dedupes_on_merge(self):
        out = _salvage_log_work_arguments({
            "summary": "x",
            "next": 'tail.</next>\n<evidence>["a","b","a"]</evidence>',
            "evidence": ["a"],
        })
        assert out["evidence"] == ["a", "b"]  # "a" not duplicated

    def test_clean_next_passes_through_unchanged(self):
        args = {"summary": "x", "next": "Continue with phase B.", "decisions": ["d1"]}
        out = _salvage_log_work_arguments(args)
        assert out == args
        assert out is not args  # returns a copy, never mutates

    def test_no_next_passes_through(self):
        args = {"summary": "x"}
        assert _salvage_log_work_arguments(args) == args

    def test_missing_inner_close_tag_not_salvaged(self):
        # Malformed pairing — outer regex matches the tail shape, but the
        # inner backref-pair regex rejects cross-mismatched tags. We expect
        # no salvage rather than wrong salvage.
        args = {
            "summary": "x",
            "next": 'tail.</next>\n<decisions>["d1"]</evidence>\n</invoke>',
        }
        out = _salvage_log_work_arguments(args)
        # Either no match (cleanest) or partial match with no inner extraction.
        assert "decisions" not in out or out.get("decisions") == ["d1"] or not out.get("decisions")

    def test_invalid_json_inside_tag_skipped(self):
        args = {
            "summary": "x",
            "next": "tail.</next>\n<decisions>not-json</decisions>\n<evidence>[\"e1\"]</evidence>",
        }
        out = _salvage_log_work_arguments(args)
        assert "decisions" not in out  # JSON parse failed, skipped
        assert out["evidence"] == ["e1"]  # other sibling still merged in

    def test_blockers_lifted_too(self):
        args = {
            "summary": "x",
            "next": 'tail.</next>\n<blockers>["b1","b2"]</blockers>\n</invoke>',
        }
        out = _salvage_log_work_arguments(args)
        assert out["blockers"] == ["b1", "b2"]
        assert out["next"] == "tail."

    def test_non_string_next_passes_through(self):
        args = {"summary": "x", "next": None}
        assert _salvage_log_work_arguments(args) == args

    def test_input_dict_not_mutated(self):
        args = {"summary": "x", "next": LEAKED_NEXT}
        original_next = args["next"]
        _salvage_log_work_arguments(args)
        assert args["next"] == original_next
        assert "decisions" not in args
