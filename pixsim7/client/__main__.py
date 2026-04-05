"""
PixSim Client — local agent manager.

Usage:
    python -m pixsim7.client                              # Bridge mode (default)
    python -m pixsim7.client --pool-size 2                # 2 parallel sessions
    python -m pixsim7.client login                        # Authenticate & store token
    python -m pixsim7.client mcp-config                   # Generate MCP config for standalone Claude
    python -m pixsim7.client --url ws://remote:8000/api/v1/ws/agent-cmd

All unrecognized flags are passed to Claude CLI.
"""
from __future__ import annotations

import argparse
import asyncio
import sys


def _cmd_bridge(args, extra_args: list[str]) -> None:
    """Default: run the WebSocket bridge with agent session pool."""
    from pixsim7.client.log import init_client_logging
    init_client_logging()

    from pixsim7.client.agent_pool import AgentPool, detect_engines
    from pixsim7.client.bridge import Bridge

    # Resolve engines: explicit --engines, or legacy --claude-command, or auto-detect
    if args.engines:
        engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    elif args.claude_command != "claude":
        engines = [args.claude_command]  # explicit override
    else:
        engines = None  # auto-detect

    print()
    print("  ==================================")
    print("       PixSim AI Client")
    print("  ==================================")
    print()
    resume = getattr(args, 'resume_session', None)
    detected = engines or detect_engines()

    # Check login status for scope display
    from pixsim7.client.bridge import Bridge
    _has_valid_token = not args.shared and Bridge._get_valid_token() is not None
    _scope_label = "shared" if args.shared or not _has_valid_token else "user-scoped"

    print(f"  Backend:    {args.url}")
    print(f"  Scope:      {_scope_label}")
    print(f"  Engines:    {', '.join(detected)}")
    print(f"  Pool size:  {args.pool_size}")
    print(f"  Timeout:    {args.timeout}s")
    if resume:
        print(f"  Resume:     {resume}")
    if extra_args:
        print(f"  Extra args: {' '.join(extra_args)}")
    print()

    pool = AgentPool(
        pool_size=args.pool_size,
        extra_args=extra_args,
        engines=engines,
        command=args.claude_command,
        auto_restart=not args.no_auto_restart,
    )
    if resume:
        pool._resume_session_id = resume

    bridge = Bridge(
        pool=pool,
        url=args.url,
        shared=args.shared,
        hook_port=args.hook_port,
    )

    async def run() -> None:
        started = await pool.start()
        if started == 0:
            print("  No agent sessions started. Check that agent CLIs are installed.", file=sys.stderr)
            return

        try:
            await bridge.run()
        except KeyboardInterrupt:
            print("\n  Shutting down...")
        finally:
            await pool.stop()

    asyncio.run(run())


def _cmd_login(args) -> None:
    """Authenticate with the backend and store the token."""
    from pixsim7.client.auth import login_and_store

    login_and_store(
        api_url=args.api_url,
        username=args.username,
        password=args.password,
    )


def _cmd_mcp_config(args) -> None:
    """Generate an MCP config JSON for standalone Claude use."""
    from pixsim7.client.auth import get_stored_token, TOKEN_FILE_PATH

    import json
    import os

    token = get_stored_token()
    if not token:
        print("No stored token. Run: python -m pixsim7.client login", file=sys.stderr)
        sys.exit(1)

    mcp_server_script = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "mcp_server.py"
    )

    config = {
        "mcpServers": {
            "pixsim": {
                "command": sys.executable,
                "args": [mcp_server_script],
                "env": {
                    "PIXSIM_API_URL": args.api_url,
                    "PIXSIM_API_TOKEN": token,
                    "PIXSIM_TOKEN_FILE": TOKEN_FILE_PATH,
                    "PIXSIM_SCOPE": args.scope,
                },
            }
        }
    }

    output = args.output
    if output:
        with open(output, "w") as f:
            json.dump(config, f, indent=2)
        print(f"MCP config written to: {output}")
        print(f"Usage: claude --mcp-config {output}")
    else:
        print(json.dumps(config, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PixSim Client — managed AI agent sessions connected to pixsim backend",
        epilog="All unrecognized flags (e.g. --dangerously-skip-permissions, --model sonnet) are passed to Claude CLI.",
    )
    subparsers = parser.add_subparsers(dest="command")

    # -- login ---------------------------------------------------------------
    login_parser = subparsers.add_parser("login", help="Authenticate and store API token")
    login_parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    login_parser.add_argument("--username", "-u", help="Username or email (prompts if omitted)")
    login_parser.add_argument("--password", "-p", help="Password (prompts if omitted)")

    # -- mcp-config ----------------------------------------------------------
    mcp_parser = subparsers.add_parser("mcp-config", help="Generate MCP config for standalone Claude")
    mcp_parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    mcp_parser.add_argument("--scope", default="dev", choices=["user", "dev"], help="Tool scope")
    mcp_parser.add_argument("-o", "--output", help="Output file path (prints to stdout if omitted)")

    # -- bridge (default) — auto-detects available engines ----------
    parser.add_argument("--url", default="ws://localhost:8000/api/v1/ws/agent-cmd", help="Backend WebSocket URL")
    parser.add_argument("--engines", default=None, help="Comma-separated agent engines (default: auto-detect). E.g. claude,codex")
    parser.add_argument("--pool-size", type=int, default=1, help="Number of parallel sessions for the primary engine (default: 1)")
    parser.add_argument("--timeout", type=int, default=120, help="Task execution timeout in seconds (default: 120)")
    parser.add_argument("--claude-command", default="claude", help="[deprecated] Use --engines instead. Claude CLI executable path.")
    parser.add_argument("--resume-session", default=None, help="Session UUID to resume")
    parser.add_argument("--no-auto-restart", action="store_true", help="Disable automatic restart of crashed sessions")
    parser.add_argument("--shared", action="store_true", help="Run as shared bridge (no user token). Default: user-scoped if logged in.")
    parser.add_argument("--hook-port", type=int, default=0, help="Port for hook HTTP server (0 = auto). Writes port to ~/.pixsim/hook_port.")

    args, claude_args = parser.parse_known_args()
    if claude_args and claude_args[0] == "--":
        claude_args = claude_args[1:]

    if args.command == "login":
        _cmd_login(args)
    elif args.command == "mcp-config":
        _cmd_mcp_config(args)
    else:
        _cmd_bridge(args, claude_args)


if __name__ == "__main__":
    main()
