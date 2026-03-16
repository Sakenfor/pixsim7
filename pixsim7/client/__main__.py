"""
PixSim Client — local agent manager.

Usage:
    python -m pixsim7.client                              # 1 Claude session
    python -m pixsim7.client --pool-size 2                # 2 parallel sessions
    python -m pixsim7.client --dangerously-skip-permissions
    python -m pixsim7.client --model sonnet --pool-size 3
    python -m pixsim7.client --url ws://remote:8000/api/v1/ws/agent-cmd

All unrecognized flags are passed to Claude CLI.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from pixsim7.client.agent_pool import AgentPool
from pixsim7.client.bridge import Bridge


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PixSim Client — managed AI agent sessions connected to pixsim backend",
        epilog="All unrecognized flags (e.g. --dangerously-skip-permissions, --model sonnet) are passed to Claude CLI.",
    )
    parser.add_argument(
        "--url",
        default="ws://localhost:8000/api/v1/ws/agent-cmd",
        help="Backend WebSocket URL",
    )
    parser.add_argument(
        "--pool-size",
        type=int,
        default=1,
        help="Number of parallel Claude sessions (default: 1)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Task execution timeout in seconds (default: 120)",
    )
    parser.add_argument(
        "--claude-command",
        default="claude",
        help="Claude CLI executable (default: claude)",
    )
    parser.add_argument(
        "--no-auto-restart",
        action="store_true",
        help="Disable automatic restart of crashed sessions",
    )

    args, claude_args = parser.parse_known_args()
    if claude_args and claude_args[0] == "--":
        claude_args = claude_args[1:]

    print()
    print("  ==================================")
    print("       PixSim AI Client")
    print("  ==================================")
    print()
    print(f"  Backend:    {args.url}")
    print(f"  Pool size:  {args.pool_size}")
    print(f"  Timeout:    {args.timeout}s")
    if claude_args:
        print(f"  Claude args: {' '.join(claude_args)}")
    print()

    pool = AgentPool(
        pool_size=args.pool_size,
        claude_args=claude_args,
        claude_command=args.claude_command,
        auto_restart=not args.no_auto_restart,
    )

    bridge = Bridge(
        pool=pool,
        url=args.url,
    )

    async def run() -> None:
        started = await pool.start()
        if started == 0:
            print("  No sessions started. Check that Claude CLI is installed.", file=sys.stderr)
            return

        try:
            await bridge.run()
        except KeyboardInterrupt:
            print("\n  Shutting down...")
        finally:
            await pool.stop()

    asyncio.run(run())


if __name__ == "__main__":
    main()
