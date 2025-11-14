#!/usr/bin/env python3
"""
PixSim7 Device Agent

Lightweight agent that runs on user's machine to expose local Android devices
to the PixSim7 server over ZeroTier network.

Usage:
    python device_agent.py --server https://your-server.com --token YOUR_API_TOKEN

Features:
- Auto-discovers local ADB devices
- Registers with PixSim7 server
- Heartbeat to keep connection alive
- Proxies ADB commands from server to local devices
"""

import asyncio
import aiohttp
import argparse
import uuid
import platform
import sys
import subprocess
from datetime import datetime
from typing import List, Tuple, Optional
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ADBClient:
    """Local ADB client"""
    
    def __init__(self, adb_path: str = "adb"):
        self.adb_path = adb_path
    
    async def devices(self) -> List[Tuple[str, str]]:
        """Get list of connected devices"""
        proc = await asyncio.create_subprocess_exec(
            self.adb_path, "devices",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode != 0:
            logger.error(f"ADB devices failed: {stderr.decode()}")
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
    
    async def execute(self, device_id: str, command: List[str]) -> Tuple[int, str, str]:
        """Execute ADB command on specific device"""
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
    """Device agent that connects to PixSim7 server"""
    
    def __init__(
        self,
        server_url: str,
        api_token: str,
        agent_name: Optional[str] = None,
        heartbeat_interval: int = 30
    ):
        self.server_url = server_url.rstrip('/')
        self.api_token = api_token
        self.agent_id = str(uuid.uuid4())
        self.agent_name = agent_name or f"{platform.node()}-agent"
        self.heartbeat_interval = heartbeat_interval
        self.adb = ADBClient()
        self.running = False
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def start(self):
        """Start the agent"""
        self.running = True
        self.session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.api_token}"}
        )
        
        logger.info(f"Starting Device Agent: {self.agent_name} ({self.agent_id})")
        logger.info(f"Server: {self.server_url}")
        
        try:
            # Register with server
            await self.register()
            
            # Start heartbeat loop
            await self.heartbeat_loop()
        except KeyboardInterrupt:
            logger.info("Agent stopped by user")
        except Exception as e:
            logger.error(f"Agent error: {e}", exc_info=True)
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop the agent"""
        self.running = False
        if self.session:
            await self.session.close()
        logger.info("Agent stopped")
    
    async def register(self):
        """Register agent with server"""
        url = f"{self.server_url}/api/v1/automation/agents/register"
        data = {
            "agent_id": self.agent_id,
            "name": self.agent_name,
            "host": "auto",  # Server will detect from request IP
            "port": 5037,
            "api_port": 8765,
            "version": "1.0.0",
            "os_info": f"{platform.system()} {platform.release()}"
        }
        
        try:
            async with self.session.post(url, json=data) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    logger.info(f"Registered successfully: {result}")
                else:
                    error = await resp.text()
                    logger.error(f"Registration failed ({resp.status}): {error}")
                    raise Exception(f"Registration failed: {error}")
        except Exception as e:
            logger.error(f"Failed to register: {e}")
            raise
    
    async def heartbeat(self):
        """Send heartbeat with device list"""
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
                    logger.debug(f"Heartbeat sent: {len(device_list)} devices")
                else:
                    error = await resp.text()
                    logger.warning(f"Heartbeat failed ({resp.status}): {error}")
        except Exception as e:
            logger.error(f"Failed to send heartbeat: {e}")
    
    async def heartbeat_loop(self):
        """Main heartbeat loop"""
        while self.running:
            await self.heartbeat()
            await asyncio.sleep(self.heartbeat_interval)


def main():
    parser = argparse.ArgumentParser(description="PixSim7 Device Agent")
    parser.add_argument(
        "--server",
        required=True,
        help="PixSim7 server URL (e.g., http://10.243.48.125:8001)"
    )
    parser.add_argument(
        "--token",
        required=True,
        help="API token for authentication"
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
        api_token=args.token,
        agent_name=args.name,
        heartbeat_interval=args.heartbeat
    )
    
    try:
        asyncio.run(agent.start())
    except KeyboardInterrupt:
        logger.info("Shutting down...")


if __name__ == "__main__":
    main()
