#!/usr/bin/env python3
"""
PixSim7 Device Agent

Lightweight agent that runs on user's machine to expose local Android devices
to the PixSim7 server over ZeroTier network.

Usage:
    python device_agent.py --server https://your-server.com

Features:
- Auto-discovers local ADB devices
- Pairing code flow (no token required)
- Registers with PixSim7 server after user confirms pairing
- Heartbeat to keep connection alive
"""

import asyncio
import aiohttp
import argparse
import uuid
import platform
import sys
import os
from datetime import datetime
from typing import List, Tuple, Optional
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def clear_screen():
    """Clear terminal screen."""
    os.system('cls' if os.name == 'nt' else 'clear')


def print_banner():
    """Print agent banner."""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║                   PixSim7 Device Agent                        ║
╚═══════════════════════════════════════════════════════════════╝
""")


def print_pairing_code(code: str):
    """Display pairing code prominently."""
    print(f"""
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                    Your Pairing Code:                         │
│                                                               │
│                      [ {code} ]                          │
│                                                               │
│        Enter this code in PixSim web interface                │
│        Automation → Devices → "Add Remote Agent"              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
""")


def print_status(status: str, details: str = ""):
    """Print current status."""
    icons = {
        "waiting": "⏳",
        "paired": "✅",
        "running": "🔄",
        "error": "❌",
        "offline": "⚫",
    }
    icon = icons.get(status, "•")
    print(f"\n  Status: {icon} {status.upper()}", end="")
    if details:
        print(f" - {details}", end="")
    print("\n")


class ADBClient:
    """Local ADB client."""

    def __init__(self, adb_path: str = "adb"):
        self.adb_path = adb_path

    async def devices(self) -> List[Tuple[str, str]]:
        """Get list of connected devices."""
        try:
            proc = await asyncio.create_subprocess_exec(
                self.adb_path, "devices",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.debug(f"ADB devices failed: {stderr.decode()}")
                return []

            lines = stdout.decode().strip().split('\n')[1:]  # Skip header
            devices = []
            for line in lines:
                line = line.strip()
                if line:
                    parts = line.split('\t')
                    if len(parts) == 2:
                        devices.append((parts[0], parts[1]))

            return devices
        except FileNotFoundError:
            logger.warning("ADB not found in PATH")
            return []
        except Exception as e:
            logger.debug(f"ADB error: {e}")
            return []

    async def execute(self, device_id: str, command: List[str]) -> Tuple[int, str, str]:
        """Execute ADB command on specific device."""
        try:
            cmd = [self.adb_path, "-s", device_id] + command
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            return proc.returncode, stdout.decode(), stderr.decode()
        except Exception as e:
            logger.error(f"Failed to execute ADB command: {e}")
            return 1, "", str(e)


class DeviceAgent:
    """Device agent that connects to PixSim7 server via pairing code."""

    def __init__(
        self,
        server_url: str,
        agent_name: Optional[str] = None,
        agent_host: Optional[str] = None,
        agent_id: Optional[str] = None,
        heartbeat_interval: int = 30,
        pairing_poll_interval: int = 3,
    ):
        self.server_url = server_url.rstrip('/')
        self.agent_id = agent_id or str(uuid.uuid4())
        self.skip_pairing = agent_id is not None  # Skip pairing if agent_id provided
        self.agent_name = agent_name or f"{platform.node()}-agent"
        self.agent_host = agent_host or "auto"  # ZeroTier IP or "auto" for server detection
        self.heartbeat_interval = heartbeat_interval
        self.pairing_poll_interval = pairing_poll_interval
        self.adb = ADBClient()
        self.running = False
        self.session: Optional[aiohttp.ClientSession] = None
        self.pairing_code: Optional[str] = None

    async def check_server_health(self) -> bool:
        """Check if the server is reachable and healthy."""
        url = f"{self.server_url}/health"
        try:
            async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    return True
                else:
                    logger.warning(f"Server health check returned {resp.status}")
                    return False
        except asyncio.TimeoutError:
            logger.error("Server health check timed out")
            return False
        except aiohttp.ClientError as e:
            logger.error(f"Server health check failed: {e}")
            return False

    async def start(self):
        """Start the agent."""
        self.running = True
        self.session = aiohttp.ClientSession()

        clear_screen()
        print_banner()

        print(f"  Agent Name: {self.agent_name}")
        print(f"  Agent ID:   {self.agent_id[:8]}...")
        print(f"  Agent Host: {self.agent_host}")
        print(f"  Server:     {self.server_url}")

        # Check server health
        print("\n  Checking server connectivity...", end=" ")
        sys.stdout.flush()

        if await self.check_server_health():
            print("✅ OK")
        else:
            print("❌ FAILED")
            print_status("error", f"Cannot reach server at {self.server_url}")
            print("  Troubleshooting:")
            print("    1. Check if backend is running")
            print("    2. Check ZeroTier connection: zerotier-cli status")
            print(f"    3. Try: curl {self.server_url}/health")
            return

        # Check for local devices
        devices = await self.adb.devices()
        if devices:
            print(f"  Devices:    {len(devices)} found")
            for serial, state in devices:
                print(f"              - {serial} ({state})")
        else:
            print("  Devices:    None detected (will scan after pairing)")

        try:
            if self.skip_pairing:
                # Skip pairing - use provided agent_id directly
                print(f"\n  Using existing agent_id: {self.agent_id[:8]}...")
                print_status("paired", f"Skipping pairing - using pre-registered agent")
            else:
                # Request pairing code
                await self.request_pairing()

                # Display code and wait for user to pair
                clear_screen()
                print_banner()
                print_pairing_code(self.pairing_code)
                print_status("waiting", "Waiting for you to enter code in web UI...")

                # Poll for pairing status
                paired = await self.wait_for_pairing()

                if not paired:
                    print_status("error", "Pairing failed or timed out")
                    return

                # Pairing successful
                clear_screen()
                print_banner()
                print_status("paired", f"Successfully paired as '{self.agent_name}'")

            # Start heartbeat loop
            print("  Starting heartbeat loop...")
            print(f"  Press Ctrl+C to stop\n")
            print("-" * 60)

            await self.heartbeat_loop()

        except KeyboardInterrupt:
            print("\n\n  Agent stopped by user")
        except Exception as e:
            logger.error(f"Agent error: {e}", exc_info=True)
            print_status("error", str(e))
        finally:
            await self.stop()

    async def stop(self):
        """Stop the agent."""
        self.running = False
        if self.session:
            await self.session.close()
        print("\n  Agent stopped.")

    async def request_pairing(self):
        """Request a pairing code from server."""
        url = f"{self.server_url}/api/v1/automation/agents/request-pairing"
        data = {
            "agent_id": self.agent_id,
            "name": self.agent_name,
            "host": self.agent_host,  # ZeroTier IP or "auto" for server detection
            "port": 5037,
            "api_port": 8765,
            "version": "1.0.0",
            "os_info": f"{platform.system()} {platform.release()}"
        }

        try:
            async with self.session.post(url, json=data) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    self.pairing_code = result.get("pairing_code")
                    logger.debug(f"Got pairing code: {self.pairing_code}")
                else:
                    error = await resp.text()
                    raise Exception(f"Failed to get pairing code ({resp.status}): {error}")
        except aiohttp.ClientError as e:
            raise Exception(f"Cannot connect to server: {e}")

    async def check_pairing_status(self) -> str:
        """Check if pairing has been completed."""
        url = f"{self.server_url}/api/v1/automation/agents/pairing-status/{self.agent_id}"

        try:
            async with self.session.get(url) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return result.get("status", "unknown")
                else:
                    return "error"
        except Exception as e:
            logger.debug(f"Pairing status check failed: {e}")
            return "error"

    async def wait_for_pairing(self, timeout: int = 300) -> bool:
        """Wait for user to complete pairing in web UI."""
        start_time = asyncio.get_event_loop().time()
        dots = 0

        while self.running:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                logger.warning("Pairing timeout")
                return False

            status = await self.check_pairing_status()

            if status == "paired":
                return True
            elif status == "expired":
                print("\n  Pairing code expired. Requesting new code...")
                await self.request_pairing()
                clear_screen()
                print_banner()
                print_pairing_code(self.pairing_code)
                print_status("waiting", "Waiting for you to enter code in web UI...")
            elif status == "error":
                # Transient error, keep polling
                pass

            # Show progress dots
            dots = (dots + 1) % 4
            remaining = int(timeout - elapsed)
            sys.stdout.write(f"\r  Polling... {'.' * dots}{' ' * (3 - dots)}  (timeout in {remaining}s)  ")
            sys.stdout.flush()

            await asyncio.sleep(self.pairing_poll_interval)

        return False

    async def heartbeat(self):
        """Send heartbeat with device list."""
        url = f"{self.server_url}/api/v1/automation/agents/{self.agent_id}/heartbeat"

        # Get current devices
        devices = await self.adb.devices()
        device_list = [{"serial": serial, "state": state} for serial, state in devices]

        data = {
            "devices": device_list,
            "timestamp": datetime.utcnow().isoformat()
        }

        try:
            async with self.session.post(url, json=data) as resp:
                if resp.status == 200:
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    device_count = len(device_list)
                    online = sum(1 for d in devices if d[1] == "device")
                    print(f"  [{timestamp}] Heartbeat OK - {device_count} devices ({online} online)")
                    return True
                else:
                    error = await resp.text()
                    logger.warning(f"Heartbeat failed ({resp.status}): {error}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send heartbeat: {e}")
            return False

    async def heartbeat_loop(self):
        """Main heartbeat loop."""
        consecutive_failures = 0
        max_failures = 5

        while self.running:
            success = await self.heartbeat()

            if success:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures >= max_failures:
                    print(f"\n  Too many consecutive failures ({max_failures}). Stopping...")
                    break

            await asyncio.sleep(self.heartbeat_interval)


def main():
    parser = argparse.ArgumentParser(
        description="PixSim7 Device Agent - Connect local Android devices to PixSim server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Normal pairing flow (displays code to enter in web UI)
  python device_agent.py --server http://10.243.48.125:8001

  # With explicit ZeroTier IP
  python device_agent.py --server http://10.243.48.125:8001 --host 10.243.48.200

  # Skip pairing using pre-registered agent_id (from admin/create endpoint)
  python device_agent.py --server http://10.243.48.125:8001 --agent-id abc123-def456

  # Custom name
  python device_agent.py --server http://10.243.48.125:8001 --name "LivingRoom-PC"

For testing: Use POST /api/v1/automation/agents/admin/create to create an agent
directly, then use --agent-id to connect without pairing.
        """
    )
    parser.add_argument(
        "--server",
        required=True,
        help="PixSim7 server URL (e.g., http://10.243.48.125:8001)"
    )
    parser.add_argument(
        "--host",
        help="This agent's ZeroTier IP address (default: auto-detect from server)"
    )
    parser.add_argument(
        "--agent-id",
        dest="agent_id",
        help="Use existing agent_id (skip pairing). Get this from admin/create endpoint."
    )
    parser.add_argument(
        "--name",
        help="Agent name (default: hostname-agent)"
    )
    parser.add_argument(
        "--heartbeat",
        type=int,
        default=30,
        help="Heartbeat interval in seconds (default: 30)"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    agent = DeviceAgent(
        server_url=args.server,
        agent_name=args.name,
        agent_host=args.host,
        agent_id=args.agent_id,
        heartbeat_interval=args.heartbeat
    )

    try:
        asyncio.run(agent.start())
    except KeyboardInterrupt:
        print("\n  Shutting down...")


if __name__ == "__main__":
    main()
