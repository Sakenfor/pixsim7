"""
Remote Command LLM Provider Plugin

LLM provider that dispatches tasks to a user's terminal via WebSocket.
Enables using subscription-based AI (Claude Pro, ChatGPT Plus) without API keys.

Usage:
    1. Start the backend server
    2. User runs: python scripts/agent_bridge.py
    3. Provider becomes available when a terminal is connected
    4. Tasks are dispatched to the user's terminal for local execution
"""

from pixsim7.backend.main.services.llm.adapters import RemoteCommandLlmProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="remote-cmd-llm",
    name="Remote Command LLM",
    version="1.0.0",
    description="LLM provider that dispatches to user terminals via WebSocket",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=True,
    requires_credentials=False,
)


# ===== PROVIDER INSTANCE =====

provider = RemoteCommandLlmProvider()


# ===== LIFECYCLE HOOKS =====

def on_register():
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.remote_cmd_llm")
    logger.info("Remote Command LLM provider registered")


def on_unregister():
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.remote_cmd_llm")
    logger.info("Remote Command LLM provider unregistered")
