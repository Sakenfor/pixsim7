"""PixSim7 device agent.

A standalone agent that exposes a machine's local Android (ADB) devices to the
PixSim7 server over ZeroTier via the pairing-code flow.

Two ways to run it:

- On a machine that has the repo / package installed::

      python -m pixsim7.automation.agent --server http://<host>:8001

- On a remote machine that only has Python + ``aiohttp`` + ADB + ZeroTier
  (no repo): copy the single file ``device_agent.py`` from this directory and
  run it directly::

      python device_agent.py --server http://<host>:8001

  The module deliberately keeps **zero** ``pixsim7.*`` imports so it stays
  copyable as a single file. Do not add intra-package imports here.
"""

from .device_agent import ADBClient, DeviceAgent, main

__all__ = ["ADBClient", "DeviceAgent", "main"]
