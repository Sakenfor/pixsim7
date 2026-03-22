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


@dataclass
class ParsedEvent:
    """Normalized event from any agent protocol."""
    kind: str          # "init", "progress", "result", "error", "other"
    text: str = ""     # result text or progress detail
    session_id: Optional[str] = None
    model: Optional[str] = None
    duration_ms: int = 0
    raw: dict | None = None


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

    def parse_event(self, raw: dict) -> ParsedEvent:
        """Parse a raw JSON event from stdout into a normalized ParsedEvent."""
        raise NotImplementedError


class ClaudeProtocol(AgentProtocol):
    """Claude Code: long-running process, stream-json stdin/stdout."""

    name = "claude"

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, model=None, reasoning_effort=None, extra_args=None):
        cmd = [command, "--print", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"]
        if model:
            cmd.extend(["--model", model])
        if reasoning_effort:
            cmd.extend(["--effort", reasoning_effort])
        if resume_session_id:
            cmd.extend(["--resume", resume_session_id])
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

    def parse_event(self, raw):
        t = raw.get("type", "")
        if t == "system":
            return ParsedEvent(kind="init", session_id=raw.get("session_id"), model=raw.get("model"), raw=raw)
        if t == "result":
            return ParsedEvent(
                kind="result", text=raw.get("result", ""), session_id=raw.get("session_id"),
                duration_ms=raw.get("duration_ms", 0), raw=raw,
            )
        if t == "error":
            err = raw.get("error", {})
            msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
            return ParsedEvent(kind="error", text=msg, raw=raw)
        if t == "assistant":
            content = raw.get("message", {}).get("content", [{}])
            block = content[0] if isinstance(content, list) and content else content
            bt = block.get("type", "")
            if bt == "tool_use":
                return ParsedEvent(kind="progress", text=f"Using tool: {block.get('name', '?')}", raw=raw)
            if bt == "thinking":
                return ParsedEvent(kind="progress", text="Thinking...", raw=raw)
            if bt == "text":
                return ParsedEvent(kind="progress", text=block.get("text", "")[:100], raw=raw)
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
    }

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, model=None, reasoning_effort=None, extra_args=None):
        # app-server is always long-running; resume is handled via thread/resume RPC
        cmd = [command, "app-server"]
        if model:
            cmd.extend(["-c", f"model={model}"])
        # Profile-level reasoning effort takes priority
        if reasoning_effort:
            cmd.extend(["-c", f"model_reasoning_effort={reasoning_effort}"])
        elif model:
            # Non-default model — apply safe default since user's config.toml
            # reasoning effort (e.g. xhigh) may not be supported by this model
            cmd.extend(["-c", f"model_reasoning_effort={self.BRIDGE_CONFIG_DEFAULTS['model_reasoning_effort']}"])
        # No CLI flags for system prompt or MCP — configured globally
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
        method = raw.get("method", "")
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
            return ParsedEvent(kind="other", raw=raw)

        # Error responses
        if "error" in raw:
            return ParsedEvent(kind="error", text=raw["error"].get("message", ""), raw=raw)

        # Codex internal error event — contains the actual error message
        if method == "codex/event/error":
            msg = params.get("msg", params)
            message = msg.get("message", "") if isinstance(msg, dict) else str(msg)
            return ParsedEvent(kind="error", text=f"Codex error: {message[:300]}", raw=raw)

        # Streaming text deltas
        if method == "item/agentMessage/delta":
            return ParsedEvent(kind="progress", text=params.get("delta", ""), raw=raw)

        # Agent message completed — contains full text
        if method == "item/completed":
            item = params.get("item", {})
            if item.get("type") == "agentMessage":
                return ParsedEvent(kind="progress", text=item.get("text", ""), raw=raw)

        # Turn completed — final event
        if method == "turn/completed":
            return ParsedEvent(kind="result", text="", duration_ms=0, raw=raw)

        # Turn started
        if method == "turn/started":
            return ParsedEvent(kind="progress", text="Thinking...", raw=raw)

        # MCP startup progress
        if method == "codex/event/mcp_startup_update":
            msg = params.get("msg", params)
            server = msg.get("server", "unknown")
            status = msg.get("status", {})
            state = status.get("state", "")
            if state == "failed":
                err = status.get("error", "unknown error")
                return ParsedEvent(kind="error", text=f"MCP startup failed for {server}: {err}", raw=raw)
            if state == "ready":
                return ParsedEvent(kind="progress", text=f"MCP ready: {server}", raw=raw)
            if state == "starting":
                return ParsedEvent(kind="progress", text=f"MCP starting: {server}", raw=raw)
            if state == "cancelled":
                return ParsedEvent(kind="progress", text=f"MCP cancelled: {server}", raw=raw)

        # MCP startup summary
        if method == "codex/event/mcp_startup_complete":
            msg = params.get("msg", params)
            ready = msg.get("ready", []) or []
            failed = msg.get("failed", []) or []
            if failed:
                details = "; ".join(
                    f"{entry.get('server', 'unknown')}: {entry.get('error', 'unknown error')}"
                    for entry in failed
                )
                return ParsedEvent(kind="error", text=f"MCP startup failed: {details}", raw=raw)
            if ready:
                return ParsedEvent(kind="progress", text=f"MCP tools loaded: {', '.join(ready)}", raw=raw)
            return ParsedEvent(kind="progress", text="MCP startup complete (no servers ready)", raw=raw)

        # Thread status
        if method == "thread/status/changed":
            status = params.get("status", "")
            # status can be a string ("active") or dict ({"type": "systemError"})
            if isinstance(status, dict):
                status_type = status.get("type", "")
                if status_type in ("systemError", "error"):
                    detail = status.get("message", "") or status.get("detail", "") or params.get("message", "") or params.get("error", "")
                    return ParsedEvent(kind="error", text=f"Codex {status_type}: {detail or 'unknown'}", raw=raw)
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
