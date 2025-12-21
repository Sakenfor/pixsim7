"""
Command LLM Provider Plugin

LLM provider that executes a local CLI command for prompt editing.
Auto-discovered and registered via provider plugin system.

Configuration:
    Set these environment variables to configure the provider:
    - CMD_LLM_COMMAND: The base command to execute (required)
    - CMD_LLM_ARGS: Space-separated additional arguments (optional)
    - CMD_LLM_TIMEOUT: Timeout in seconds (default: 60)

Command Contract:
    Input JSON (via stdin):
        {
            "task": "edit_prompt",
            "prompt": "original prompt text",
            "instruction": "formatted instruction for editing",
            "system_prompt": "system prompt for the LLM",
            "model": "model-id",
            "context": {}
        }

    Output JSON (via stdout):
        { "edited_prompt": "edited prompt text" }

Example:
    export CMD_LLM_COMMAND="python"
    export CMD_LLM_ARGS="/path/to/my_llm_script.py"
"""

from pixsim7.backend.main.services.llm.adapters import CommandLlmProvider
from pixsim7.backend.main.domain.providers.schemas import ProviderManifest, ProviderKind


# ===== PROVIDER MANIFEST =====

manifest = ProviderManifest(
    id="cmd-llm",
    name="Command LLM",
    version="1.0.0",
    description="LLM provider that runs a local CLI command for prompt editing",
    author="PixSim Team",
    kind=ProviderKind.LLM,
    enabled=True,
    requires_credentials=False,  # Uses environment config, not API keys
)


# ===== PROVIDER INSTANCE =====

# Create provider instance (will be registered in LLM registry)
provider = CommandLlmProvider()


# ===== LIFECYCLE HOOKS (Optional) =====

def on_register():
    """Called when provider is registered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.cmd_llm")
    logger.info("Command LLM provider registered")


def on_unregister():
    """Called when provider is unregistered"""
    from pixsim_logging import configure_logging
    logger = configure_logging("provider.cmd_llm")
    logger.info("Command LLM provider unregistered")
