#!/usr/bin/env python3
"""
Claude Code PreToolUse hook — routes tool approval through the PixSim bridge UI.

Exit codes (Claude Code convention):
    0 = allow tool execution
    2 = deny tool execution

Reads the hook port from ~/.pixsim/hook_port (written by bridge's hook_server).
If the bridge is not running, auto-approves (fail-open).

Usage in Claude Code settings.json:
    {
      "hooks": {
        "PreToolUse": [
          {
            "matcher": "Bash|Write|Edit",
            "command": "python -m pixsim7.client.hook_pretool"
          }
        ]
      }
    }

The hook receives tool info via stdin as JSON:
    {"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}, ...}
"""
from __future__ import annotations

import json
import socket
import sys
from pathlib import Path

HOOK_PORT_FILE = Path.home() / ".pixsim" / "hook_port"
TIMEOUT_S = 120


def main() -> None:
    # Read tool info from stdin
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        data = {}

    tool_name = data.get("tool_name", "unknown")
    tool_input = data.get("tool_input", {})

    # Read port
    try:
        port = int(HOOK_PORT_FILE.read_text().strip())
    except Exception:
        # Bridge not running — auto-approve
        sys.exit(0)

    # POST /confirm
    body = json.dumps({
        "tool_name": tool_name,
        "tool_input": tool_input,
        "title": f"Tool: {tool_name}",
        "description": _describe_tool(tool_name, tool_input),
        "timeout_s": TIMEOUT_S,
    }).encode()

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

        # Read response (blocking — this is the whole point, we wait for user approval)
        sock.settimeout(TIMEOUT_S + 10)
        response = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            response += chunk
        sock.close()

        # Parse HTTP response body
        parts = response.split(b"\r\n\r\n", 1)
        resp_body = parts[1] if len(parts) > 1 else b"{}"
        result = json.loads(resp_body)

        if result.get("approved", False):
            sys.exit(0)  # allow
        else:
            sys.exit(2)  # deny

    except Exception:
        # Connection failed — auto-approve (fail-open)
        sys.exit(0)


def _describe_tool(tool_name: str, tool_input: dict) -> str:
    """Generate a human-readable description of the tool call."""
    if tool_name == "Bash" and "command" in tool_input:
        cmd = tool_input["command"]
        return f"Run command: {cmd[:200]}" if len(cmd) > 200 else f"Run command: {cmd}"
    if tool_name == "Write" and "file_path" in tool_input:
        return f"Write to file: {tool_input['file_path']}"
    if tool_name == "Edit" and "file_path" in tool_input:
        return f"Edit file: {tool_input['file_path']}"
    if tool_name in ("Read", "Glob", "Grep"):
        return f"{tool_name}: {json.dumps(tool_input)[:200]}"
    return f"{tool_name}({json.dumps(tool_input)[:200]})"


if __name__ == "__main__":
    main()
