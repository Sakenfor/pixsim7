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


class AgentProtocol:
    """Base protocol adapter."""

    def build_start_cmd(
        self,
        command: str,
        *,
        resume_session_id: str | None = None,
        system_prompt: str | None = None,
        mcp_config_path: str | None = None,
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

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, extra_args=None):
        cmd = [command, "--print", "--output-format", "stream-json", "--input-format", "stream-json", "--verbose"]
        if resume_session_id:
            cmd.extend(["--resume", resume_session_id])
        if system_prompt:
            cmd.extend(["--append-system-prompt", system_prompt])
        if mcp_config_path:
            cmd.extend(["--mcp-config", mcp_config_path])
        cmd.extend(extra_args or [])
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


class CodexProtocol(AgentProtocol):
    """Codex CLI: one process per turn, JSONL output via exec --json."""

    def build_start_cmd(self, command, *, resume_session_id=None, system_prompt=None, mcp_config_path=None, extra_args=None):
        if resume_session_id:
            cmd = [command, "exec", "resume", resume_session_id, "--json"]
        else:
            cmd = [command, "exec", "--json"]
        if system_prompt:
            # Codex doesn't have --append-system-prompt; prepend to the prompt instead
            pass  # handled in build_message_payload
        if mcp_config_path:
            cmd.extend(["--mcp-config", mcp_config_path])
        cmd.extend(extra_args or [])
        return cmd

    def build_message_payload(self, message, images=None):
        # Codex reads prompt from stdin (plain text, not JSON)
        return message + "\n"

    def is_long_running(self):
        return False  # one process per turn

    def parse_event(self, raw):
        t = raw.get("type", "")
        if t == "thread.started":
            return ParsedEvent(kind="init", session_id=raw.get("thread_id"), raw=raw)
        if t == "turn.completed":
            # Final event — signal result (text accumulated from item.completed)
            return ParsedEvent(kind="result", text="", duration_ms=0, raw=raw)
        if t == "item.completed":
            item = raw.get("item", {})
            if item.get("type") == "agent_message":
                # Accumulate text — not the final result yet (turn.completed is)
                return ParsedEvent(kind="progress", text=item.get("text", ""), raw=raw)
            if item.get("type") == "tool_call":
                return ParsedEvent(kind="progress", text=f"Using tool: {item.get('name', '?')}", raw=raw)
        if t == "turn.started":
            return ParsedEvent(kind="progress", text="Thinking...", raw=raw)
        return ParsedEvent(kind="other", raw=raw)


# ── Registry ────────────────────────────────────────────────────────

PROTOCOL_REGISTRY: dict[str, AgentProtocol] = {
    "claude": ClaudeProtocol(),
    "codex": CodexProtocol(),
}


def get_protocol(command: str) -> AgentProtocol:
    """Resolve protocol from command name. Falls back to Claude protocol."""
    name = command.split("/")[-1].split("\\")[-1].replace(".exe", "")
    return PROTOCOL_REGISTRY.get(name, PROTOCOL_REGISTRY["claude"])
