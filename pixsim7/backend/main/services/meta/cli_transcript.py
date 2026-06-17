"""Recover lost chat replies from the Claude CLI on-disk transcript.

``ChatSession.messages`` is a lossy, denormalized snapshot of a conversation.
When a turn is interrupted/cancelled, or a bridge/backend restart lands
between the live stream and the persist step, the assistant reply never makes
it into the snapshot — the turn freezes on the trailing *user* message, which
is exactly what trips the frontend's "response lost / check again" chip
(``serverHasUnansweredUserTurn``).

The reply is not actually lost, though. The Claude CLI writes every turn to
its own JSONL transcript under
``~/.claude/projects/<mangled-cwd>/<cli_session_id>.jsonl`` — ground truth for
what the agent actually said. This module reads that transcript and recovers
the assistant tail the snapshot is missing, so the recovery path can
self-heal instead of re-confirming the loss against a snapshot that will
never gain the reply.

Only the host-run main-api can reach these files (the DBs are containerized
but the API process is not). Best-effort throughout: any IO/parse failure
degrades to "nothing recovered", never an error.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

# Engines whose transcripts use the Claude Code JSONL format this parser
# understands. Codex uses a different on-disk format/location, so it's
# deliberately excluded — recovery simply no-ops there.
CLAUDE_ENGINES = {"claude"}


def _projects_root() -> Path:
    override = os.environ.get("PIXSIM_CLAUDE_PROJECTS_DIR")
    if override:
        return Path(override)
    return Path.home() / ".claude" / "projects"


def find_transcript_path(
    cli_session_id: str,
    projects_root: Optional[Path] = None,
) -> Optional[Path]:
    """Locate ``<projects>/*/<cli_session_id>.jsonl``.

    The project subdir is Claude Code's mangled cwd; we glob across all
    projects since the CLI session id is globally unique.
    """
    if not cli_session_id:
        return None
    root = projects_root or _projects_root()
    try:
        matches = sorted(root.glob(f"*/{cli_session_id}.jsonl"))
    except OSError:
        return None
    return matches[0] if matches else None


def _extract_text(content: Any) -> str:
    """Concatenate the text blocks of a CLI message's ``content``.

    ``content`` is either a bare string or a list of typed blocks; only
    ``text`` blocks contribute (tool_use / tool_result / thinking are
    ignored), mirroring what ``ChatSession.messages`` stores.
    """
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        return "\n".join(p for p in parts if p).strip()
    return ""


def _normalize_ts(ts: Any) -> str:
    """Match the ``+00:00`` suffix the Python writers use so CLI-sourced rows
    sort consistently with bridge/frontend rows in the snapshot merge.

    The CLI stamps ISO-8601 with a ``Z`` suffix; the bridge uses
    ``utcnow().isoformat()`` (``+00:00``). ``merge_chat_messages`` sorts on
    the raw string, so a mixed suffix would misorder same-second turns.
    """
    if not isinstance(ts, str) or not ts:
        return ""
    return ts[:-1] + "+00:00" if ts.endswith("Z") else ts


def extract_chat_messages_from_transcript(
    lines: Iterable[str],
) -> List[Dict[str, Any]]:
    """Parse a Claude CLI JSONL transcript into ``{role, text, timestamp}`` rows.

    Keeps only text-bearing top-level user/assistant turns from the MAIN
    thread — sub-agent (``isSidechain``) turns, tool-only turns, and meta
    lines (``ai-title``/``mode``/``queue-operation``/…) are dropped, mirroring
    what ``ChatSession.messages`` stores.
    """
    out: List[Dict[str, Any]] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(obj, dict):
            continue
        if obj.get("type") not in ("user", "assistant"):
            continue
        if obj.get("isSidechain"):
            continue
        msg = obj.get("message")
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        if role not in ("user", "assistant"):
            continue
        text = _extract_text(msg.get("content"))
        if not text:
            continue
        out.append(
            {"role": role, "text": text, "timestamp": _normalize_ts(obj.get("timestamp"))}
        )
    return out


def has_unanswered_user_tail(snapshot: Optional[List[Any]]) -> bool:
    """True when the snapshot's last user turn has no assistant reply after it.

    This is the cheap gate the GET endpoint uses to decide whether the
    (potentially large) transcript read is worth attempting — it mirrors the
    frontend's ``serverHasUnansweredUserTurn`` trigger for the "response lost"
    chip, so we only reach for the transcript on exactly the turns that would
    otherwise be stuck.
    """
    snap = [m for m in (snapshot or []) if isinstance(m, dict)]
    if not snap:
        return False
    last_user = None
    for i in range(len(snap) - 1, -1, -1):
        if snap[i].get("role") == "user":
            last_user = i
            break
    if last_user is None:
        return False
    for j in range(last_user + 1, len(snap)):
        m = snap[j]
        if m.get("role") == "assistant":
            return False
        # A terminal abandoned marker closes the turn — not "lost", just
        # unanswered; don't bother the transcript.
        if m.get("role") == "system" and m.get("kind") == "abandoned":
            return False
    return True


def recover_missing_tail(
    snapshot: Optional[List[Any]],
    transcript_messages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Return the transcript rows that follow the snapshot's unanswered user turn.

    Returns ``[]`` when the snapshot is already complete (``has_unanswered_user_tail``
    is false), the transcript doesn't contain that user turn, or the tail it
    finds adds no assistant reply (nothing worth recovering).
    """
    if not transcript_messages or not has_unanswered_user_tail(snapshot):
        return []
    snap = [m for m in (snapshot or []) if isinstance(m, dict)]
    # The trailing unanswered user turn (guaranteed to exist by the gate).
    target = ""
    for i in range(len(snap) - 1, -1, -1):
        if snap[i].get("role") == "user":
            target = (snap[i].get("text") or "").strip()
            break
    if not target:
        return []
    # Find the LAST matching user turn in the transcript and take its tail.
    idx = None
    for i in range(len(transcript_messages) - 1, -1, -1):
        m = transcript_messages[i]
        if m["role"] == "user" and (m["text"] or "").strip() == target:
            idx = i
            break
    if idx is None:
        return []
    tail = transcript_messages[idx + 1:]
    if not any(m["role"] == "assistant" for m in tail):
        return []
    return tail


def load_recovered_tail(
    cli_session_id: str,
    snapshot: Optional[List[Any]],
    projects_root: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Find + read + parse the CLI transcript and recover the missing tail.

    Synchronous (does file IO) — call via ``run_in_threadpool`` from async
    handlers. Best-effort: returns ``[]`` on any failure or when there's
    nothing to recover.
    """
    if not has_unanswered_user_tail(snapshot):
        return []
    try:
        path = find_transcript_path(cli_session_id, projects_root)
        if not path:
            return []
        with path.open("r", encoding="utf-8") as fh:
            transcript = extract_chat_messages_from_transcript(fh)
    except OSError as exc:
        logger.warning(
            "cli_transcript_read_failed session=%s err=%s", cli_session_id, exc
        )
        return []
    return recover_missing_tail(snapshot, transcript)
