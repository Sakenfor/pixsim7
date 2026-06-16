"""
Agent protocol adapters.

Each agent CLI (Claude Code, Codex, etc.) speaks a different protocol.
Adapters normalize the differences so AgentCmdSession can work with any of them.

To add a new agent:
  1. Create a subclass of AgentProtocol
  2. Register it in PROTOCOL_REGISTRY
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Re-export from the error model module. Existing imports
# (`from pixsim7.client.protocols import AgentError, _classify_claude_error`)
# keep working — tests and external callers don't need to change.
from pixsim7.client.agent_errors import (
    AGENT_ERROR_CATEGORY,
    AgentError,
    _dict_message,
    classify_claude_error as _classify_claude_error,
    classify_codex_error as _classify_codex_error,
)

__all__ = [
    "AGENT_ERROR_CATEGORY",
    "AgentError",
    "AgentProtocol",
    "ClaudeProtocol",
    "CodexAppServerProtocol",
    "CodexExecProtocol",
    "ParsedEvent",
    "PROTOCOL_REGISTRY",
    "get_protocol",
]


@dataclass
class ParsedEvent:
    """Normalized event from any agent protocol."""
    kind: str          # "init", "progress", "result", "error", "other"
    text: str = ""     # result text or progress detail
    session_id: Optional[str] = None
    model: Optional[str] = None
    duration_ms: int = 0
    raw: dict | None = None
    error: AgentError | None = None    # populated when kind == "error"


# Map of CLI-specific flags to their equivalents in other CLIs.
# If a flag has no equivalent, it's dropped.
_ARG_TRANSLATIONS: dict[str, dict[str, str | None]] = {
    "--dangerously-skip-permissions": {
        "claude": "--dangerously-skip-permissions",
        "codex": "--dangerously-bypass-approvals-and-sandbox",
    },
    "--dangerously-bypass-approvals-and-sandbox": {
        "claude": "--dangerously-skip-permissions",
        "codex": "--dangerously-bypass-approvals-and-sandbox",
    },
}


class AgentProtocol:
    """Base protocol adapter."""

    name: str = "unknown"

    def translate_args(self, extra_args: list[str] | None) -> list[str]:
        """Translate CLI-specific flags for this protocol."""
        if not extra_args:
            return []
        result = []
        for arg in extra_args:
            mapping = _ARG_TRANSLATIONS.get(arg)
            if mapping:
                translated = mapping.get(self.name)
                if translated:
                    result.append(translated)
                # else: drop the arg (no equivalent for this CLI)
            else:
                result.append(arg)
        return result

    def build_start_cmd(
        self,
        command: str,
        *,
        resume_session_id: str | None = None,
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        extra_args: list[str] | None = None,
    ) -> list[str]:
        raise NotImplementedError

    def build_message_payload(self, message: str, images: list[dict] | None = None) -> str | None:
        """Build stdin payload for a message. Return None if the message is passed via cmd args."""
        raise NotImplementedError

    def is_long_running(self) -> bool:
        """True if the process stays alive between messages (Claude). False if one process per message (Codex)."""
        return True

    def supports_runtime_control(self) -> bool:
        """True if the live process accepts ``control_request`` frames over stdin
        to change settings (e.g. model) mid-session without a respawn/resume.

        Only the Claude stream-json transport does. Codex (single-turn or
        JSON-RPC app-server) does not — its model/effort are spawn-time.
        """
        return False

    def build_control_request(self, request_id: str, subtype: str, **fields) -> str | None:
        """Build a stdin ``control_request`` frame, or None if unsupported.

        The envelope (verified against the Claude CLI) is::

            {"type":"control_request","request_id":<id>,
             "request":{"subtype":<subtype>, **fields}}

        The CLI replies with a ``control_response`` carrying the same
        ``request_id``. Only subtypes the CLI whitelists are honoured
        (``set_model`` is the one we use).
        """
        return None

    def parse_event(self, raw: dict) -> ParsedEvent:
        """Parse a raw JSON event from stdout into a normalized ParsedEvent."""
        raise NotImplementedError

    def static_models(self) -> list[dict]:
        """Return a static model list for engines that don't support dynamic probes.

        Override in subclasses to provide known models when the engine
        can't be probed via JSON-RPC model/list.  Returns [] by default.
        """
        return []


def _describe_hook_event(raw: dict) -> str:
    """Build a human-readable description of a hook lifecycle event."""
    hook_type = raw.get("hook_type", raw.get("hook", ""))
    status = raw.get("status", "")
    tool_name = raw.get("tool_name", "")

    if hook_type == "PreToolUse":
        if status == "started":
            return f"Awaiting approval: {tool_name}" if tool_name else "Awaiting tool approval..."
        if status == "completed":
            exit_code = raw.get("exit_code", raw.get("exitCode", 0))
            if exit_code == 2:
                return f"Tool denied: {tool_name}" if tool_name else "Tool denied"
            return f"Tool approved: {tool_name}" if tool_name else "Tool approved"
        if status == "error":
            return f"Hook error: {tool_name}" if tool_name else "Hook error"
    if hook_type == "PostToolUse":
        return f"Post-tool hook: {tool_name}" if tool_name else "Post-tool hook"

    # Generic fallback
    return f"Hook: {hook_type} {status}".strip()


def _describe_tool_use(block: dict) -> str:
    """Build a human-readable description of a tool_use block."""
    name = block.get("name", "?")
    inp = block.get("input") or {}
    if not isinstance(inp, dict):
        return f"Tool: {name}"

    if name in ("Read", "read"):
        path = inp.get("file_path", "")
        return f"Reading {_short_path(path)}" if path else f"Tool: {name}"
    if name in ("Edit", "edit"):
        path = inp.get("file_path", "")
        return f"Editing {_short_path(path)}" if path else f"Tool: {name}"
    if name in ("Write", "write"):
        path = inp.get("file_path", "")
        return f"Writing {_short_path(path)}" if path else f"Tool: {name}"
    if name in ("Bash", "bash"):
        cmd = inp.get("command", "")
        return f"Running: {cmd[:120]}" if cmd else f"Tool: {name}"
    if name in ("Grep", "grep"):
        pat = inp.get("pattern", "")
        path = inp.get("path", "")
        suffix = f" in {_short_path(path)}" if path else ""
        return f"Searching: {pat[:80]}{suffix}" if pat else f"Tool: {name}"
    if name in ("Glob", "glob"):
        pat = inp.get("pattern", "")
        return f"Finding: {pat}" if pat else f"Tool: {name}"
    if name in ("Agent", "agent"):
        desc = inp.get("description", "")
        return f"Agent: {desc[:100]}" if desc else f"Tool: {name}"
    # Generic fallback: tool name + first string-valued input key
    for v in inp.values():
        if isinstance(v, str) and len(v) > 3:
            return f"{name}: {v[:100]}"
    return f"Tool: {name}"


def _short_path(path: str) -> str:
    """Shorten a file path to last 3 segments for readability."""
    if not path:
        return path
    parts = path.replace("\\", "/").split("/")
    return "/".join(parts[-3:]) if len(parts) > 3 else path


def _codex_reasoning_text(item: dict) -> str:
    """Join the text fragments of a Codex `reasoning` item.

    The app-server reasoning item carries two arrays — ``summary`` (model-authored
    reasoning summary) and ``content`` (raw chain-of-thought) — each a list of
    ``{"type": "...", "text": ...}`` entries. Both come back EMPTY unless the
    session is launched with reasoning summaries enabled (see
    ``model_reasoning_summary`` in CodexAppServerProtocol.build_start_cmd); in
    that case this returns "" and the caller falls back to a generic beat.
    """
    parts: list[str] = []
    for key in ("summary", "content"):
        seq = item.get(key)
        if not isinstance(seq, list):
            continue
        for el in seq:
            if isinstance(el, dict):
                txt = el.get("text") or el.get("summary") or ""
            elif isinstance(el, str):
                txt = el
            else:
                txt = ""
            if txt:
                parts.append(str(txt).strip())
    return "\n".join(p for p in parts if p).strip()


def _describe_codex_tool_item(item: dict) -> str:
    """Human-readable beat for a Codex tool-ish item (command / MCP / web search).

    Mirrors the Claude-side _describe_tool_use phrasing so both agents read the
    same in the thinking bubble. Returns "" for item types that aren't tools.
    """
    it = str(item.get("type") or "")
    if it in {"commandExecution", "command_execution"}:
        # commandActions[].command is the cleaned inner command (no shell
        # wrapper); fall back to the raw command string.
        cmd = ""
        actions = item.get("commandActions")
        if isinstance(actions, list) and actions and isinstance(actions[0], dict):
            cmd = str(actions[0].get("command") or "")
        if not cmd:
            raw_cmd = item.get("command")
            cmd = " ".join(str(c) for c in raw_cmd) if isinstance(raw_cmd, list) else str(raw_cmd or "")
        cmd = cmd.strip()
        return f"Running: {cmd[:120]}" if cmd else "Running command"
    if it in {"mcpToolCall", "mcp_tool_call"}:
        name = str(item.get("name") or item.get("tool") or "?")
        server = str(item.get("server") or item.get("serverName") or "")
        return f"Using tool: {server + '.' if server else ''}{name}"
    if it in {"webSearch", "web_search"}:
        q = str(item.get("query") or "").strip()
        return f"Searching the web: {q[:100]}" if q else "Searching the web"
    return ""


def _codex_error_event(prefix: str, raw: dict, *, detail: str = "") -> ParsedEvent:
    """Build a structured error :class:`ParsedEvent` for Codex protocols.

    Codex events come in many shapes (``codex/event/error``, ``turn/failed``,
    MCP startup failures, ``thread/status/changed → systemError``) but they
    all collapse to "prefix + truncated detail" — and they all need a typed
    :class:`AgentError` so the session-layer raise becomes an
    :class:`AgentTaskError` instead of a bare ``RuntimeError``. The combined
    "prefix: detail" text is run through :func:`classify_codex_error` so a
    rate-limit / auth / model-gone signature in the message surfaces as the
    right category (and ``retryable``) instead of collapsing to "unknown".
    """
    detail_text = (detail or "").strip()
    suffix = f": {detail_text[:300]}" if detail_text else ""
    text = f"{prefix}{suffix}"
    return ParsedEvent(
        kind="error",
        text=text,
        error=_classify_codex_error(text, raw),
        raw=raw,
    )


class ClaudeProtocol(AgentProtocol):
    """Claude Code: long-running process, stream-json stdin/stdout."""

    name = "claude"

    def static_models(self) -> list[dict]:
        """Claude Code doesn't support JSON-RPC model/list — return known models.

        IDs match the short names used by the frontend dropdown and accepted
        by ``claude --model``: ``opus``, ``sonnet``, ``haiku``.
        """
        return [
            {"id": "opus", "model": "opus", "label": "Opus", "is_default": True, "hidden": False, "input_modalities": ["text", "image"]},
            {"id": "sonnet", "model": "sonnet", "label": "Sonnet", "is_default": False, "hidden": False, "input_modalities": ["text", "image"]},
            {"id": "haiku", "model": "haiku", "label": "Haiku", "is_default": False, "hidden": False, "input_modalities": ["text", "image"]},
        ]

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, model=None, reasoning_effort=None, extra_args=None):
        # --include-partial-messages: stream incremental thinking/text deltas as
        # `stream_event` lines. Without it the CLI emits a content block only once
        # it is COMPLETE, so an extended-thinking phase or a long single reply is
        # pure stdout silence — and session.py's inactivity watchdog (which only
        # re-arms on real stdout) can't tell "thinking hard" from "wedged" and
        # kills healthy turns at AGENT_IDLE_GAP_SECONDS. These deltas reset
        # `silent_since` every token, turning a dead reasoning gap into a live,
        # self-extending one. They parse to kind="other" (inert beyond keeping the
        # turn alive); the complete assistant/user events still arrive as before.
        cmd = [command, "--print", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose", "--include-hook-events", "--include-partial-messages"]
        if resume_session_id:
            # A resume needs ONLY the session id. The conversation already has
            # its model, reasoning effort, and system prompt baked into history;
            # re-asserting any of them makes the headless stream-json resume
            # replay the stored assistant thinking blocks under a changed config,
            # which the API rejects with 400 "thinking blocks ... cannot be
            # modified". Plain interactive `claude --resume <id>` passes none of
            # these — which is why the bug never surfaces in a cmd terminal. The
            # --append-system-prompt guard learned this first; --model/--effort
            # get the same treatment. (Explicit model/effort *changes* already
            # route to a fresh _spawn_session, so nothing is lost here.)
            cmd.extend(["--resume", resume_session_id])
        else:
            if model:
                cmd.extend(["--model", model])
            if reasoning_effort:
                cmd.extend(["--effort", reasoning_effort])
            if system_prompt:
                cmd.extend(["--append-system-prompt", system_prompt])
        if mcp_config_path:
            cmd.extend(["--mcp-config", mcp_config_path])
        cmd.extend(self.translate_args(extra_args))
        return cmd

    def build_message_payload(self, message, images=None):
        import json
        content: list[dict] = [{"type": "text", "text": message}]
        for img in (images or []):
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": img.get("media_type", "image/png"), "data": img["data"]},
            })
        return json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n"

    def is_long_running(self):
        return True

    def supports_runtime_control(self):
        return True

    def build_control_request(self, request_id, subtype, **fields):
        import json
        return json.dumps({
            "type": "control_request",
            "request_id": request_id,
            "request": {"subtype": subtype, **fields},
        }) + "\n"

    def parse_event(self, raw):
        t = raw.get("type", "")
        if t == "system":
            return ParsedEvent(kind="init", session_id=raw.get("session_id"), model=raw.get("model"), raw=raw)
        if t == "result":
            # Claude's stream-json emits "result" events for BOTH success and
            # failure. Failure cases set ``is_error: true`` (and/or a
            # ``subtype`` that starts with ``error_``) and omit the ``result``
            # field — so reading ``raw["result"]`` returns "" and the session
            # would silently complete with empty text. The frontend then renders
            # the bare "No response from agent" fallback because no error
            # field was set anywhere downstream.
            #
            # The trigger we hit in the wild: a resume-id Claude doesn't know
            # (e.g. tab's ``session_id`` is a server-mint UUID, not Claude's
            # real cli_session_id) — Claude rejects ``--resume`` and emits
            # exactly this shape with ``duration_ms=0``. Route to kind=error
            # so session.py:711 raises a RuntimeError with a useful message.
            subtype = str(raw.get("subtype") or "")
            if raw.get("is_error") or subtype.startswith("error"):
                err = _classify_claude_error(raw)
                return ParsedEvent(kind="error", text=err.message, error=err, raw=raw)
            return ParsedEvent(
                kind="result", text=raw.get("result", ""), session_id=raw.get("session_id"),
                duration_ms=raw.get("duration_ms", 0), raw=raw,
            )
        if t == "error":
            err = _classify_claude_error(raw)
            return ParsedEvent(kind="error", text=err.message, error=err, raw=raw)
        if t == "assistant":
            content = raw.get("message", {}).get("content", [{}])
            block = content[0] if isinstance(content, list) and content else content
            bt = block.get("type", "")
            if bt == "tool_use":
                return ParsedEvent(kind="progress", text=_describe_tool_use(block), raw=raw)
            if bt == "thinking":
                return ParsedEvent(kind="progress", text="Thinking...", raw=raw)
            if bt == "text":
                return ParsedEvent(kind="progress", text=block.get("text", "")[:100], raw=raw)
        # Hook lifecycle events (from --include-hook-events)
        if t == "hook":
            return ParsedEvent(kind="progress", text=_describe_hook_event(raw), raw=raw)
        return ParsedEvent(kind="other", raw=raw)


class CodexExecProtocol(AgentProtocol):
    """Codex CLI exec mode: one process per turn, JSONL output via exec --json."""

    name = "codex-exec"

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, model=None, reasoning_effort=None, extra_args=None):
        if resume_session_id:
            cmd = [command, "exec", "resume", resume_session_id, "--json"]
        else:
            cmd = [command, "exec", "--json"]
        if model:
            cmd.extend(["--model", model])
        if reasoning_effort:
            cmd.extend(["-c", f"model_reasoning_effort={reasoning_effort}"])
        # Codex doesn't support --mcp-config or --append-system-prompt per-invocation
        cmd.extend(self.translate_args(extra_args))
        return cmd

    def build_message_payload(self, message, images=None):
        return message + "\n"

    def is_long_running(self):
        return False

    def parse_event(self, raw):
        t = raw.get("type", "")
        if t == "thread.started":
            return ParsedEvent(kind="init", session_id=raw.get("thread_id"), raw=raw)
        if t == "turn.completed":
            return ParsedEvent(kind="result", text="", duration_ms=0, raw=raw)
        if t == "item.completed":
            item = raw.get("item", {})
            if item.get("type") == "agent_message":
                return ParsedEvent(kind="progress", text=item.get("text", ""), raw=raw)
            if item.get("type") == "tool_call":
                return ParsedEvent(kind="progress", text=f"Using tool: {item.get('name', '?')}", raw=raw)
        if t == "turn.started":
            return ParsedEvent(kind="progress", text="Thinking...", raw=raw)
        return ParsedEvent(kind="other", raw=raw)


class CodexAppServerProtocol(AgentProtocol):
    """Codex app-server: long-running JSON-RPC over stdio. Full multi-turn + MCP tools."""

    name = "codex"

    # Safe defaults for bridge-launched sessions — override user's global
    # config.toml values that may be incompatible with non-default models.
    BRIDGE_CONFIG_DEFAULTS: dict[str, str] = {
        "model_reasoning_effort": "high",
        # Without this the app-server emits `reasoning` items with EMPTY
        # summary/content arrays, so the panel can only show a static
        # "Thinking..." — there is no reasoning text to stream. "auto" lets the
        # model surface concise reasoning summaries that parse_event forwards as
        # thinking beats. Dial to "detailed" (or add show_raw_agent_reasoning)
        # for more verbosity.
        "model_reasoning_summary": "auto",
    }

    # Codex accepts these effort values. Normalize stale/legacy values from
    # saved profiles so Claude-oriented settings do not break Codex startup.
    _VALID_REASONING_EFFORTS = {"low", "medium", "high", "xhigh"}
    _REASONING_EFFORT_ALIASES = {
        "max": "xhigh",
        "minimal": "low",
    }

    @classmethod
    def _normalize_reasoning_effort(cls, value: str | None) -> str | None:
        raw = str(value or "").strip().lower()
        if not raw:
            return None
        if raw in cls._VALID_REASONING_EFFORTS:
            return raw
        mapped = cls._REASONING_EFFORT_ALIASES.get(raw)
        if mapped in cls._VALID_REASONING_EFFORTS:
            return mapped
        return None

    # Auth method forced for every bridge-spawned codex session. The
    # machine-global ~/.codex/config.toml may set preferred_auth_method
    # = "apikey" (a platform key), but subscription-only models like
    # gpt-5.3-codex are NOT served by the platform API and 404. The
    # bridge must ride the user's ChatGPT/Codex subscription auth (tokens
    # already in the shared ~/.codex/auth.json). Passed as a CLI `-c`
    # override — highest precedence, applied on every spawn regardless of
    # cwd / workdir cache / project-config discovery.
    BRIDGE_PREFERRED_AUTH_METHOD: str = "chatgpt"

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, model=None, reasoning_effort=None, extra_args=None):
        # app-server is always long-running; resume is handled via thread/resume RPC
        cmd = [command, "app-server"]
        if self.BRIDGE_PREFERRED_AUTH_METHOD:
            cmd.extend(["-c", f"preferred_auth_method={self.BRIDGE_PREFERRED_AUTH_METHOD}"])
        # Enable reasoning summaries so `reasoning` items carry text to stream as
        # thinking beats (else they arrive empty — see BRIDGE_CONFIG_DEFAULTS).
        cmd.extend(["-c", f"model_reasoning_summary={self.BRIDGE_CONFIG_DEFAULTS['model_reasoning_summary']}"])
        if model:
            cmd.extend(["-c", f"model={model}"])
        normalized_effort = self._normalize_reasoning_effort(reasoning_effort)
        # Profile-level reasoning effort takes priority
        if normalized_effort:
            cmd.extend(["-c", f"model_reasoning_effort={normalized_effort}"])
        elif model:
            # Non-default model — apply safe default since user's config.toml
            # reasoning effort (e.g. xhigh) may not be supported by this model
            cmd.extend(["-c", f"model_reasoning_effort={self.BRIDGE_CONFIG_DEFAULTS['model_reasoning_effort']}"])
        # No CLI flags for system prompt or MCP per invocation.
        # MCP is configured via Codex config layers. Bridge sets a per-focus workdir that
        # contains a project-local .codex/config.toml for MCP + enabled_tools filtering.
        # mcp_config_path is ignored.
        # System prompt is injected via message preamble in the bridge, not via CLI flag.
        return cmd

    def build_message_payload(self, message, images=None):
        """Build a JSON-RPC turn/start request. Returns None — handled specially in send_message."""
        # The session handles the full JSON-RPC flow (initialize, thread/start, turn/start)
        # We encode the user message as a turn/start payload
        import json
        user_input: list[dict] = [{"type": "text", "text": message}]
        for img in (images or []):
            if img.get("data"):
                # base64 image — write to temp file for localImage
                pass  # TODO: image support via localImage
        # Return the input array as JSON — session code will wrap it in turn/start
        return json.dumps(user_input)

    def is_long_running(self):
        return True

    def needs_jsonrpc_init(self) -> bool:
        """This protocol requires JSON-RPC initialize + thread/start before messages."""
        return True

    def parse_event(self, raw):
        """Parse JSON-RPC notifications from app-server."""
        method = str(raw.get("method", "") or "")
        method_norm = method.replace(".", "/")
        params = raw.get("params", {})
        rid = raw.get("id")

        # Response to initialize (id=0)
        if rid == 0 and "result" in raw:
            return ParsedEvent(kind="init", raw=raw)

        # Response to thread/start (id=1) — contains thread ID
        if rid == 1 and "result" in raw:
            thread = raw["result"].get("thread", {})
            return ParsedEvent(kind="init", session_id=thread.get("id"), raw=raw)

        # Response to turn/start (id >= 2) — ack
        if rid is not None and rid >= 2 and "result" in raw:
            result_obj = raw.get("result")
            if isinstance(result_obj, dict):
                status = str(result_obj.get("status", "")).strip().lower()
                if status in {"completed", "done", "ok"} or result_obj.get("done") is True:
                    text = (
                        str(result_obj.get("text", "") or "")
                        or str(result_obj.get("response", "") or "")
                        or str(result_obj.get("output", "") or "")
                    )
                    return ParsedEvent(kind="result", text=text, raw=raw)
            return ParsedEvent(kind="other", raw=raw)

        # JSON-RPC error response (response envelope, not a notification).
        if "error" in raw:
            err = raw["error"]
            detail = _dict_message(err) if isinstance(err, dict) else str(err)
            return _codex_error_event("Codex error", raw, detail=detail)

        # Codex internal error notification — contains the actual error message
        if method_norm == "codex/event/error":
            msg = params.get("msg", params)
            detail = _dict_message(msg) if isinstance(msg, dict) else str(msg)
            return _codex_error_event("Codex error", raw, detail=detail)
        if method_norm == "error":
            err = params.get("error", params)
            detail = _dict_message(err) if isinstance(err, dict) else ""
            if not detail:
                detail = str(params.get("message", "") or "Unknown error")
            return _codex_error_event("Codex error", raw, detail=detail)

        # Streaming text deltas
        if method_norm in {"item/agentMessage/delta", "item/agent_message/delta"}:
            delta = params.get("delta")
            if not isinstance(delta, str):
                delta = params.get("text", "")
            return ParsedEvent(kind="progress", text=str(delta or ""), raw=raw)

        # Item lifecycle (started / updated / completed). Each carries a typed
        # item: agentMessage, reasoning, commandExecution, mcpToolCall, webSearch.
        # We forward these as progress "beats" so the thinking bubble shows real
        # steps instead of a single static "Thinking...". Beats are emitted on a
        # SINGLE phase per item to avoid started+completed duplicates:
        #   • agentMessage — already streamed via item/agentMessage/delta above;
        #     forward the completed text too as a non-streaming fallback.
        #   • reasoning    — text lands on completed (started is empty); forward it.
        #   • tool-ish     — forward on started so the beat shows WHILE it runs.
        if method_norm in {"item/started", "item/updated", "item/completed"}:
            item = params.get("item", {})
            if isinstance(item, dict):
                item_type = str(item.get("type", "") or "")
                if item_type in {"agentMessage", "agent_message"}:
                    if method_norm == "item/completed":
                        return ParsedEvent(kind="progress", text=str(item.get("text", "") or ""), raw=raw)
                    return ParsedEvent(kind="other", raw=raw)
                if item_type == "reasoning":
                    rtext = _codex_reasoning_text(item)
                    if rtext:
                        return ParsedEvent(kind="progress", text=rtext, raw=raw)
                    # Empty (reasoning summaries disabled) — nothing to show; the
                    # turn/started "Thinking..." already covers the idle state.
                    return ParsedEvent(kind="other", raw=raw)
                tool_desc = _describe_codex_tool_item(item)
                if tool_desc and method_norm == "item/started":
                    return ParsedEvent(kind="progress", text=tool_desc, raw=raw)
                return ParsedEvent(kind="other", raw=raw)

        # Turn completed — final event
        if method_norm in {"turn/completed", "turn/complete"}:
            return ParsedEvent(kind="result", text="", duration_ms=0, raw=raw)

        # Turn started
        if method_norm in {"turn/started", "turn/start"}:
            return ParsedEvent(kind="progress", text="Thinking...", raw=raw)

        # Terminal turn errors
        if method_norm in {"turn/failed", "turn/error", "turn/cancelled", "turn/aborted"}:
            detail = (
                _dict_message(params)
                or str(params.get("error", "") or "")
                or "turn failed"
            )
            return _codex_error_event("Codex turn failed", raw, detail=detail)

        # MCP startup progress
        if method_norm == "codex/event/mcp_startup_update":
            msg = params.get("msg", params)
            server = msg.get("server", "unknown")
            status = msg.get("status", {})
            state = status.get("state", "")
            if state == "failed":
                err = status.get("error", "unknown error")
                return _codex_error_event(f"MCP startup failed for {server}", raw, detail=str(err))
            if state == "ready":
                return ParsedEvent(kind="progress", text=f"MCP ready: {server}", raw=raw)
            if state == "starting":
                return ParsedEvent(kind="progress", text=f"MCP starting: {server}", raw=raw)
            if state == "cancelled":
                return ParsedEvent(kind="progress", text=f"MCP cancelled: {server}", raw=raw)

        # MCP startup summary
        if method_norm == "codex/event/mcp_startup_complete":
            msg = params.get("msg", params)
            ready = msg.get("ready", []) or []
            failed = msg.get("failed", []) or []
            if failed:
                details = "; ".join(
                    f"{entry.get('server', 'unknown')}: {entry.get('error', 'unknown error')}"
                    for entry in failed
                )
                return _codex_error_event("MCP startup failed", raw, detail=details)
            if ready:
                return ParsedEvent(kind="progress", text=f"MCP tools loaded: {', '.join(ready)}", raw=raw)
            return ParsedEvent(kind="progress", text="MCP startup complete (no servers ready)", raw=raw)

        # Thread status
        if method_norm == "thread/status/changed":
            status = params.get("status", "")
            # status can be a string ("active") or dict ({"type": "systemError"})
            if isinstance(status, dict):
                status_type = status.get("type", "")
                if status_type in ("systemError", "error"):
                    err = params.get("error", "")
                    err_text = _dict_message(err) if isinstance(err, dict) else str(err or "")
                    detail = _dict_message(status) or _dict_message(params) or err_text
                    # Codex frequently emits a bare `{status: {type: systemError}}`
                    # with NO message/code (confirmed via raw-event logging). A
                    # literal "unknown" tells the user nothing; this failure mode
                    # is most often plan/model-access or auth (e.g. a ChatGPT plan
                    # that no longer covers the Codex model) or a transient
                    # upstream fault. Surface that actionable guess instead.
                    if not detail:
                        detail = (
                            "Codex sent no detail — usually your plan/subscription "
                            "no longer covers this model or you're signed out; "
                            "otherwise a transient upstream fault. Check Codex "
                            "sign-in / subscription, then retry."
                        )
                    return _codex_error_event(f"Codex {status_type}", raw, detail=detail)
                return ParsedEvent(kind="progress", text=f"Status: {status_type}", raw=raw)
            if status:
                return ParsedEvent(kind="progress", text=f"Status: {status}", raw=raw)

        return ParsedEvent(kind="other", raw=raw)


# ── Registry ────────────────────────────────────────────────────────

PROTOCOL_REGISTRY: dict[str, AgentProtocol] = {
    "claude": ClaudeProtocol(),
    "codex": CodexAppServerProtocol(),
    "codex-exec": CodexExecProtocol(),  # fallback single-turn mode
}


def get_protocol(command: str) -> AgentProtocol:
    """Resolve protocol from command name. Falls back to Claude protocol."""
    name = command.split("/")[-1].split("\\")[-1].replace(".exe", "")
    return PROTOCOL_REGISTRY.get(name, PROTOCOL_REGISTRY["claude"])
