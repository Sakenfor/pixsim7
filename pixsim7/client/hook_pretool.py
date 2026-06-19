#!/usr/bin/env python3
"""
Claude Code PreToolUse hook — routes tool prompts through the PixSim bridge UI.

Dispatches by ``tool_name``:

* ``AskUserQuestion`` → render each question as a ConfirmationCard ``choice``
  prompt, collect the user's selections, and emit a PreToolUse JSON response
  whose ``updatedInput.answers`` dict supplies the answers (documented Claude
  Code mechanism — Claude treats the supplied ``answers`` as if the native
  AskUserQuestion UI had run). Multi-select questions are not yet supported
  by the bridge protocol; the hook logs a warning to stderr and falls back to
  single-select.

* Anything else → legacy approve/deny gate using process exit codes
  (0 = allow, 2 = deny), preserved for Bash/Write/Edit-style approval flows.

Reads the hook port from ``~/.pixsim/hook_port`` (written by the bridge's
HookServer). If the bridge is not running, fail-open (exit 0 — let Claude
proceed normally).

Usage in ``.claude/settings.json`` (current Claude Code hook schema):

    {
      "hooks": {
        "PreToolUse": [
          {
            "matcher": "AskUserQuestion",
            "hooks": [
              {"type": "command", "command": "python -m pixsim7.client.hook_pretool"}
            ]
          }
        ]
      }
    }

The hook receives the standard PreToolUse stdin payload:

    {"session_id": "...", "tool_name": "AskUserQuestion", "tool_input": {...}, ...}
"""
from __future__ import annotations

import json
import os
import socket
import sys
from pathlib import Path
from typing import Optional

HOOK_PORT_FILE = Path.home() / ".pixsim" / "hook_port"
TIMEOUT_S = 120


def main() -> None:
    # Bridge ownership gate. The hook is configured globally in the user's
    # ~/.claude settings, so it fires for EVERY Claude CLI on the machine —
    # not just sessions spawned by the pixsim bridge. Bridge-spawned
    # sessions carry PIXSIM_BRIDGE_MANAGED=1 (set by token_manager.py:117
    # and bridge.py via the pool's session env). Foreign Claude CLIs (the
    # user's own terminal, scheduled jobs, other tools) lack it; if those
    # post to /confirm, _hook_confirm's `cli_session_id` reverse-lookup
    # misses, the synthetic_fallback synthesizes a hook task id, and the
    # backend broadcasts the confirmation into every in-flight chat tab on
    # the bridge — exactly the cross-tab leak we hit. Skip cleanly so
    # foreign sessions use Claude Code's native UI instead.
    # Plan: agent-confirmation-hooks / cross-tab-fanout-fix.
    if not os.environ.get("PIXSIM_BRIDGE_MANAGED"):
        return

    # Read tool info from stdin (PreToolUse payload).
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        data = {}

    tool_name = data.get("tool_name", "unknown")
    tool_input = data.get("tool_input", {}) if isinstance(data.get("tool_input"), dict) else {}
    # Plan: agent-confirmation-hooks / cross-tab-fanout-fix.
    # Claude's session_id == our bridge's cli_session_id. Forwarding it
    # to /confirm lets Bridge._hook_confirm reverse-map to the originating
    # task_id and avoid the heartbeat fan-out that otherwise broadcasts
    # this prompt into every active chat tab.
    cli_session_id = str(data.get("session_id") or "").strip() or None

    if tool_name == "AskUserQuestion":
        _handle_ask_user_question(tool_input, cli_session_id=cli_session_id)
        return

    if tool_name == "EnterPlanMode":
        _handle_enter_plan_mode(cli_session_id=cli_session_id)
        return

    if tool_name == "ExitPlanMode":
        _handle_exit_plan_mode(tool_input, cli_session_id=cli_session_id)
        return

    # MCP tools (mcp__*) are gated by the MCP server itself
    # (mcp_server.handle_call_tool → _request_mcp_tool_approval) — the only
    # cross-engine gate, since Codex never reads .claude/. The launcher's
    # catch-all matcher (mcp__pixsim__.*) routes them here ONLY so a tool
    # registered after the last apply-hook-config isn't silently denied by
    # Claude Code. Auto-allow and let the in-server gate decide; prompting here
    # too would pop a second ConfirmationCard for the same call.
    if tool_name.startswith("mcp__"):
        sys.exit(0)

    _handle_approval(tool_name, tool_input, cli_session_id=cli_session_id)


# ──────────────────────────────────────────────────────────────────────────
# AskUserQuestion — render each question as a ConfirmationCard choice prompt
# ──────────────────────────────────────────────────────────────────────────

def _handle_ask_user_question(tool_input: dict, *, cli_session_id: Optional[str] = None) -> None:
    questions = tool_input.get("questions") or []
    if not isinstance(questions, list) or not questions:
        # Nothing to ask — let the tool proceed via its default path.
        sys.exit(0)

    answers: dict[str, str] = {}
    for q in questions:
        if not isinstance(q, dict):
            continue
        question_text = (q.get("question") or q.get("header") or "").strip()
        options = q.get("options") or []
        if not question_text or not isinstance(options, list) or not options:
            continue  # malformed question — skip rather than blocking the call

        multi_select = bool(q.get("multiSelect"))

        # id = stringified index so we can map id→label after /confirm returns.
        choices = []
        for i, opt in enumerate(options):
            if isinstance(opt, dict):
                label = (opt.get("label") or "").strip() or f"Option {i + 1}"
                description = opt.get("description")
            else:
                label = str(opt)
                description = None
            entry = {"id": str(i), "label": label}
            if description:
                entry["description"] = description
            choices.append(entry)

        payload = {
            "title": (q.get("header") or "Question").strip(),
            "description": question_text,
            "interaction_type": "multi_choice" if multi_select else "choice",
            "choices": choices,
            "timeout_s": TIMEOUT_S,
        }
        if cli_session_id:
            payload["cli_session_id"] = cli_session_id
        result = _post_confirm(payload)
        if result is None:
            # Bridge offline — fail-open so Claude isn't blocked; it'll get
            # the SDK's default reply, same as today's unmounted behaviour.
            sys.exit(0)

        if not result.get("approved"):
            _emit_deny("User did not answer the question.")
            return

        answers[question_text] = _resolve_answer_label(result, choices, multi_select)

    _emit_choice_as_denial(answers)


def _resolve_answer_label(result: dict, choices: list[dict], multi_select: bool) -> str:
    """Convert the /confirm response into the human-readable answer string.

    For single-select: maps the singular ``choice`` (id) to the matching
    option's label. For multi-select: maps the plural ``choices`` list of
    ids to a comma-joined string of labels (matching Claude Code's
    documented multi-select answer format).
    """
    def _label_for(chosen_id: str) -> str:
        try:
            return choices[int(chosen_id)]["label"]
        except (ValueError, IndexError, KeyError, TypeError):
            return chosen_id  # fall through with raw id if mapping fails

    if multi_select:
        ids = result.get("choices") or []
        if not isinstance(ids, list):
            return str(ids)
        labels = [_label_for(str(cid)) for cid in ids]
        return ", ".join(labels)

    return _label_for(result.get("choice") or "")


def _emit_choice_as_denial(answers: dict[str, str]) -> None:
    """Deny the AskUserQuestion call, encoding the user's choices in the reason.

    Why deny rather than allow-with-updatedInput.answers: although the hook
    spec documents ``updatedInput.answers`` for AskUserQuestion, the tool's
    internal Node.js handler still executes after the hook returns ``allow``
    (per docs: *"this still lets the tool execute with pre-filled
    answers — it doesn't skip execution"*). In our non-interactive
    subprocess setup it crashes on an internal ``.map()`` over undefined
    widget state. Denying short-circuits that handler entirely and surfaces
    ``permissionDecisionReason`` to Claude as feedback, which the model
    parses as the user's answer.
    """
    if not answers:
        # Shouldn't happen — caller guards against empty answers — but be
        # defensive so we never silently drop the user's input.
        _emit_deny("User declined to answer.")
        return

    if len(answers) == 1:
        question, label = next(iter(answers.items()))
        reason = f'User selected: "{label}" for: {question}'
    else:
        parts = [f'  - {q}: "{label}"' for q, label in answers.items()]
        reason = "User's answers:\n" + "\n".join(parts)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def _emit_allow() -> None:
    """Approve the tool call AND skip Claude Code's own confirmation prompt.

    Exit-code 0 with no output only means "the hook didn't block" — Claude Code
    then runs its native permission/confirmation flow. For ExitPlanMode /
    EnterPlanMode that native flow is the plan-mode UI, which has no surface in
    the headless bridge subprocess: it never gets answered, comes back as an
    error, and the model stays wedged in plan mode (the "exit appears but isn't
    recognized" symptom). Emitting an explicit ``permissionDecision: "allow"``
    tells Claude Code to proceed without that second prompt, since the user
    already approved via our card. (Confirmed against the PreToolUse hook
    contract: only an explicit "allow" decision bypasses the native prompt.)
    """
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }))
    sys.exit(0)


def _emit_deny(reason: str) -> None:
    """Deny the tool call; Claude surfaces ``reason`` as feedback."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


# ──────────────────────────────────────────────────────────────────────────
# EnterPlanMode — confirm before Claude switches into plan mode
# ──────────────────────────────────────────────────────────────────────────

def _handle_enter_plan_mode(*, cli_session_id: Optional[str] = None) -> None:
    """Surface an approve/reject card before Claude enters plan mode.

    EnterPlanMode is otherwise allow-listed (auto-approved), so Claude can slip
    into plan mode unprompted. Hooking it lets the user decline an unsolicited
    planning detour from the chat panel.

    Approve → ``exit 0`` lets Claude enter plan mode and start planning.
    Reject  → deny so Claude proceeds with the work directly instead of planning
              (a bare denial could leave it re-trying EnterPlanMode).
    """
    payload = {
        "tool_name": "EnterPlanMode",
        "title": "Enter plan mode?",
        "description": (
            "Claude wants to plan this out before making changes. Approve to let "
            "it research and draft a plan for your review, or reject to have it "
            "proceed directly."
        ),
        "interaction_type": "approve_deny",
        "timeout_s": TIMEOUT_S,
    }
    if cli_session_id:
        payload["cli_session_id"] = cli_session_id

    result = _post_confirm(payload)
    if result is None:
        # Bridge offline — fail-open so Claude isn't blocked; matches the
        # native default of proceeding when no UI is mounted.
        sys.exit(0)

    if result.get("approved", False):
        _emit_allow()  # allow — enter plan mode and begin planning (skip native prompt)

    note = (result.get("note") or result.get("reason") or "").strip()
    reason = (
        f"User declined plan mode: {note}"
        if note
        else "User declined plan mode — proceed directly with the task instead of planning."
    )
    _emit_deny(reason)


# ──────────────────────────────────────────────────────────────────────────
# ExitPlanMode — render the proposed plan as an approve/deny card
# ──────────────────────────────────────────────────────────────────────────

def _handle_exit_plan_mode(tool_input: dict, *, cli_session_id: Optional[str] = None) -> None:
    """Surface the plan-mode confirmation in the chat panel.

    Like AskUserQuestion this is UI routing, not a security gate: Claude has
    finished planning and wants to start executing. We render the proposed
    plan (``tool_input["plan"]``, markdown) as a ConfirmationCard so the user
    can approve or reject it from the AI assistant chat panel instead of the
    native TUI (which never shows in the bridge subprocess).

    Approve  → ``exit 0`` lets Claude leave plan mode and begin work.
    Reject   → deny with the user's note as ``permissionDecisionReason`` so
               Claude stays in plan mode and revises, mirroring the native
               "keep planning" path.
    """
    plan = (tool_input.get("plan") or "").strip()

    payload = {
        "tool_name": "ExitPlanMode",
        "title": "Ready to code?",
        "description": plan or "Claude has finished planning and is ready to start.",
        "interaction_type": "approve_deny",
        "timeout_s": TIMEOUT_S,
    }
    if cli_session_id:
        payload["cli_session_id"] = cli_session_id

    result = _post_confirm(payload)
    if result is None:
        # Bridge offline — fail-open so Claude isn't blocked; matches the
        # native default of proceeding when no UI is mounted.
        sys.exit(0)

    if result.get("approved", False):
        _emit_allow()  # allow — exit plan mode and begin executing (skip native prompt)

    # Rejected: keep planning. Forward any note the user left so Claude can
    # revise rather than just re-proposing the same plan.
    note = (result.get("note") or result.get("reason") or "").strip()
    reason = (
        f"User wants to keep planning. Revision request: {note}"
        if note
        else "User rejected the plan and wants to keep planning. Revise the plan and call ExitPlanMode again."
    )
    _emit_deny(reason)


# ──────────────────────────────────────────────────────────────────────────
# Legacy approve/deny path — Bash / Write / Edit etc. via exit codes
# ──────────────────────────────────────────────────────────────────────────

def _handle_approval(
    tool_name: str, tool_input: dict, *, cli_session_id: Optional[str] = None
) -> None:
    payload = {
        "tool_name": tool_name,
        "tool_input": tool_input,
        "title": f"Tool: {tool_name}",
        "description": _describe_tool(tool_name, tool_input),
        "timeout_s": TIMEOUT_S,
    }
    if cli_session_id:
        payload["cli_session_id"] = cli_session_id
    result = _post_confirm(payload)
    if result is None:
        # Bridge offline — fail-open.
        sys.exit(0)

    if result.get("approved", False):
        sys.exit(0)  # allow
    else:
        sys.exit(2)  # deny


def _describe_tool(tool_name: str, tool_input: dict) -> str:
    """Generate a human-readable description of the tool call."""
    if tool_name == "Bash" and "command" in tool_input:
        cmd = tool_input["command"]
        return f"Run command: {cmd[:200]}" if len(cmd) > 200 else f"Run command: {cmd}"
    if tool_name == "Write" and "file_path" in tool_input:
        return f"Write to file: {tool_input['file_path']}"
    if tool_name == "Edit" and "file_path" in tool_input:
        return f"Edit file: {tool_input['file_path']}"
    if tool_name in ("Task", "Agent"):
        desc = tool_input.get("description") or tool_input.get("subagent_type") or ""
        return f"Run subagent: {desc}" if desc else "Run a subagent task"
    if tool_name == "SlashCommand" and "command" in tool_input:
        return f"Run slash command: {tool_input['command']}"
    if tool_name in ("Read", "Glob", "Grep"):
        return f"{tool_name}: {json.dumps(tool_input)[:200]}"
    return f"{tool_name}({json.dumps(tool_input)[:200]})"


# ──────────────────────────────────────────────────────────────────────────
# Hook server I/O (shared by both paths)
# ──────────────────────────────────────────────────────────────────────────

def _post_confirm(payload: dict) -> Optional[dict]:
    """POST to the bridge's /confirm endpoint; return parsed response or None.

    Returns ``None`` when the bridge isn't running or the request fails —
    callers should treat that as fail-open and let Claude proceed normally.
    """
    try:
        port = int(HOOK_PORT_FILE.read_text().strip())
    except Exception:
        return None

    body = json.dumps(payload).encode()
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=5)
        request = (
            f"POST /confirm HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{port}\r\n"
            f"Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        ).encode() + body
        sock.sendall(request)

        # Blocking read — the bridge holds the response open while it waits
        # for the user. ``+10`` covers WS roundtrip + render latency.
        sock.settimeout(TIMEOUT_S + 10)
        response = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
        sock.close()

        parts = response.split(b"\r\n\r\n", 1)
        resp_body = parts[1] if len(parts) > 1 else b"{}"
        return json.loads(resp_body)
    except Exception:
        return None


if __name__ == "__main__":
    main()
