"""Tests for CLI-transcript recovery of lost chat replies.

Covers the pure parse/recover helpers and the file-locating glue in
``services/meta/cli_transcript`` — the machinery that lets the
"response lost / check again" path self-heal by reading the Claude CLI's
on-disk transcript when ``ChatSession.messages`` froze on an unanswered
user turn.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "cli-transcript-recovery",
    "label": "CLI Transcript Recovery",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "chat",
    "covers": [
        "pixsim7/backend/main/services/meta/cli_transcript.py",
    ],
    "order": 33,
}

import json

import pytest

try:
    from pixsim7.backend.main.services.meta import cli_transcript as ct

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


def _line(type_, role, text, ts, *, sidechain=False, blocks=None):
    """Build a Claude-CLI JSONL line. ``blocks`` overrides ``content``."""
    content = blocks if blocks is not None else [{"type": "text", "text": text}]
    return json.dumps(
        {
            "type": type_,
            "isSidechain": sidechain,
            "timestamp": ts,
            "message": {"role": role, "content": content},
        }
    )


# --- extract_chat_messages_from_transcript -------------------------------

def test_extract_keeps_text_user_and_assistant():
    lines = [
        _line("user", "user", "hi", "2026-06-16T19:54:54.896Z"),
        _line("assistant", "assistant", "hello", "2026-06-16T19:55:00.368Z"),
    ]
    out = ct.extract_chat_messages_from_transcript(lines)
    assert out == [
        {"role": "user", "text": "hi", "timestamp": "2026-06-16T19:54:54.896+00:00"},
        {"role": "assistant", "text": "hello", "timestamp": "2026-06-16T19:55:00.368+00:00"},
    ]


def test_extract_drops_meta_sidechain_and_toolonly():
    lines = [
        json.dumps({"type": "ai-title", "message": {"role": "assistant", "content": "x"}}),
        json.dumps({"type": "queue-operation"}),
        _line("assistant", "assistant", "subagent", "2026-06-16T20:00:00Z", sidechain=True),
        # tool-only assistant turn → no text blocks → dropped
        _line("assistant", "assistant", "", "2026-06-16T20:00:01Z",
              blocks=[{"type": "tool_use", "name": "Read", "input": {}}]),
        # tool_result-only user turn → dropped
        _line("user", "user", "", "2026-06-16T20:00:02Z",
              blocks=[{"type": "tool_result", "content": "..."}]),
        _line("assistant", "assistant", "real reply", "2026-06-16T20:00:03Z"),
    ]
    out = ct.extract_chat_messages_from_transcript(lines)
    assert out == [
        {"role": "assistant", "text": "real reply", "timestamp": "2026-06-16T20:00:03+00:00"},
    ]


def test_extract_tolerates_malformed_lines():
    lines = ["", "not json", "{}", _line("user", "user", "ok", "2026-06-16T19:00:00Z")]
    out = ct.extract_chat_messages_from_transcript(lines)
    assert [m["text"] for m in out] == ["ok"]


# --- has_unanswered_user_tail --------------------------------------------

def test_unanswered_tail_true_when_user_is_last():
    snap = [
        {"role": "user", "text": "q1"},
        {"role": "assistant", "text": "a1"},
        {"role": "user", "text": "q2"},
    ]
    assert ct.has_unanswered_user_tail(snap) is True


def test_unanswered_tail_false_when_assistant_follows():
    snap = [{"role": "user", "text": "q"}, {"role": "assistant", "text": "a"}]
    assert ct.has_unanswered_user_tail(snap) is False


def test_unanswered_tail_false_on_abandoned_marker():
    snap = [
        {"role": "user", "text": "q"},
        {"role": "system", "text": "no reply", "kind": "abandoned"},
    ]
    assert ct.has_unanswered_user_tail(snap) is False


def test_unanswered_tail_false_on_empty_or_none():
    assert ct.has_unanswered_user_tail(None) is False
    assert ct.has_unanswered_user_tail([]) is False


def test_unanswered_tail_ignores_trailing_system_note():
    # A non-abandoned system note after the user turn (e.g. "Bridge
    # disconnected") must NOT count as an answer.
    snap = [
        {"role": "user", "text": "q"},
        {"role": "system", "text": "Bridge disconnected"},
    ]
    assert ct.has_unanswered_user_tail(snap) is True


# --- recover_missing_tail ------------------------------------------------

def test_recover_returns_assistant_tail_after_user_turn():
    snap = [
        {"role": "user", "text": "q1"},
        {"role": "assistant", "text": "a1"},
        {"role": "user", "text": "the lost question"},
    ]
    transcript = [
        {"role": "user", "text": "q1", "timestamp": "t0"},
        {"role": "assistant", "text": "a1", "timestamp": "t1"},
        {"role": "user", "text": "the lost question", "timestamp": "t2"},
        {"role": "assistant", "text": "the recovered reply", "timestamp": "t3"},
        {"role": "assistant", "text": "follow-up", "timestamp": "t4"},
    ]
    tail = ct.recover_missing_tail(snap, transcript)
    assert [m["text"] for m in tail] == ["the recovered reply", "follow-up"]


def test_recover_empty_when_snapshot_complete():
    snap = [{"role": "user", "text": "q"}, {"role": "assistant", "text": "a"}]
    transcript = [
        {"role": "user", "text": "q", "timestamp": "t0"},
        {"role": "assistant", "text": "a", "timestamp": "t1"},
    ]
    assert ct.recover_missing_tail(snap, transcript) == []


def test_recover_empty_when_user_turn_absent_from_transcript():
    snap = [{"role": "user", "text": "not in transcript"}]
    transcript = [{"role": "user", "text": "different", "timestamp": "t0"},
                  {"role": "assistant", "text": "a", "timestamp": "t1"}]
    assert ct.recover_missing_tail(snap, transcript) == []


def test_recover_empty_when_tail_has_no_assistant():
    snap = [{"role": "user", "text": "q"}]
    transcript = [{"role": "user", "text": "q", "timestamp": "t0"}]
    assert ct.recover_missing_tail(snap, transcript) == []


# --- find_transcript_path / load_recovered_tail (filesystem) -------------

def test_find_transcript_path_globs_across_projects(tmp_path):
    proj = tmp_path / "G--code-pixsim7"
    proj.mkdir()
    f = proj / "sess-xyz.jsonl"
    f.write_text("{}", encoding="utf-8")
    found = ct.find_transcript_path("sess-xyz", projects_root=tmp_path)
    assert found == f
    assert ct.find_transcript_path("missing", projects_root=tmp_path) is None
    assert ct.find_transcript_path("", projects_root=tmp_path) is None


def test_load_recovered_tail_end_to_end(tmp_path):
    proj = tmp_path / "proj"
    proj.mkdir()
    (proj / "sess-1.jsonl").write_text(
        "\n".join(
            [
                _line("user", "user", "the lost question", "2026-06-16T23:21:06.923Z"),
                _line("assistant", "assistant", "recovered!", "2026-06-16T23:21:12.509Z"),
            ]
        ),
        encoding="utf-8",
    )
    snap = [{"role": "user", "text": "the lost question"}]
    tail = ct.load_recovered_tail("sess-1", snap, projects_root=tmp_path)
    assert [m["text"] for m in tail] == ["recovered!"]


def test_load_recovered_tail_noop_when_complete(tmp_path):
    snap = [{"role": "user", "text": "q"}, {"role": "assistant", "text": "a"}]
    # Cheap gate short-circuits before any filesystem access.
    assert ct.load_recovered_tail("sess-1", snap, projects_root=tmp_path) == []


def test_load_recovered_tail_missing_file(tmp_path):
    snap = [{"role": "user", "text": "q"}]
    assert ct.load_recovered_tail("nope", snap, projects_root=tmp_path) == []
