"""
Bootstrap initialization for AI Model Registry.

This module registers default AI models and parsing engines at application startup.

Provider IDs are clean names (openai, anthropic, local) — not delivery methods.
The `supported_methods` field declares how each model can be reached.
"""
from pixsim7.backend.main.shared.schemas.ai_model_schemas import (
    AiModel,
    AiModelKind,
    AiModelCapability,
    DeliveryMethod,
)
from .registry import ai_model_registry


def initialize_ai_models() -> None:
    """
    Initialize the AI model registry with default models.

    This is called at application startup to register:
    - Deterministic parsing engines (native parser configurations)
    - LLM models for prompt editing, tag suggestion, and assistant chat
    - Embedding models
    """

    # === Parsing Engines ===

    ai_model_registry.register(
        AiModel(
            id="parser:native-simple",
            label="Native Simple Parser",
            provider_id="internal-parser",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            default_for=[AiModelCapability.PROMPT_PARSE],
            supported_methods=[],
            description="Deterministic prompt parser using PixSim7's native simple engine",
        )
    )

    ai_model_registry.register(
        AiModel(
            id="parser:native-strict",
            label="Native Strict Parser",
            provider_id="internal-parser",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            supported_methods=[],
            description="Strict deterministic parser with enhanced validation (future configuration)",
        )
    )

    # === LLM Models ===

    # OpenAI GPT-4o Mini (default for prompt editing)
    ai_model_registry.register(
        AiModel(
            id="openai:gpt-4o-mini",
            label="GPT-4o Mini",
            provider_id="openai",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.TAG_SUGGEST,
                AiModelCapability.ASSISTANT_CHAT,
            ],
            default_for=[AiModelCapability.PROMPT_EDIT],
            supported_methods=[DeliveryMethod.API, DeliveryMethod.CMD],
            description="OpenAI GPT-4o Mini — fast, cost-effective",
        )
    )

    # OpenAI GPT-4
    ai_model_registry.register(
        AiModel(
            id="openai:gpt-4",
            label="GPT-4",
            provider_id="openai",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.TAG_SUGGEST,
                AiModelCapability.ASSISTANT_CHAT,
            ],
            supported_methods=[DeliveryMethod.API, DeliveryMethod.CMD],
            description="OpenAI GPT-4",
        )
    )

    # Anthropic Claude 3.5 Sonnet
    ai_model_registry.register(
        AiModel(
            id="anthropic:claude-3.5",
            label="Claude 3.5 Sonnet",
            provider_id="anthropic",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.ASSISTANT_CHAT,
            ],
            default_for=[AiModelCapability.ASSISTANT_CHAT],
            supported_methods=[DeliveryMethod.API, DeliveryMethod.REMOTE],
            description="Anthropic Claude 3.5 Sonnet — via API or bridge with MCP tools",
        )
    )

    # Local LLM (SmolLM2 etc.)
    ai_model_registry.register(
        AiModel(
            id="local:smollm2",
            label="SmolLM2 (Local)",
            provider_id="local",
            kind=AiModelKind.LLM,
            capabilities=[AiModelCapability.PROMPT_EDIT],
            supported_methods=[DeliveryMethod.LOCAL],
            description="Local llama-cpp SmolLM2 model",
        )
    )

    # Command LLM (user-defined local command)
    ai_model_registry.register(
        AiModel(
            id="cmd:default",
            label="Command LLM (Default)",
            provider_id="cmd",
            kind=AiModelKind.LLM,
            capabilities=[AiModelCapability.PROMPT_EDIT],
            supported_methods=[DeliveryMethod.CMD],
            description=(
                "LLM via local CLI command. Configure via CMD_LLM_COMMAND and "
                "CMD_LLM_ARGS environment variables."
            ),
        )
    )

    # === Embedding Models ===

    ai_model_registry.register(
        AiModel(
            id="openai:text-embedding-3-small",
            label="Text Embedding 3 Small",
            provider_id="openai",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            default_for=[AiModelCapability.EMBEDDING],
            supported_methods=[DeliveryMethod.API],
            description="OpenAI text-embedding-3-small (768 dims) for semantic similarity",
        )
    )

    ai_model_registry.register(
        AiModel(
            id="openai:text-embedding-3-large",
            label="Text Embedding 3 Large",
            provider_id="openai",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            supported_methods=[DeliveryMethod.API],
            description="OpenAI text-embedding-3-large (768 dims) for high-quality semantic similarity",
        )
    )

    ai_model_registry.register(
        AiModel(
            id="cmd:embedding-default",
            label="Command Embedding (Default)",
            provider_id="cmd",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            supported_methods=[DeliveryMethod.CMD],
            description=(
                "Embedding via local CLI command. Configure via CMD_EMBEDDING_COMMAND "
                "environment variable."
            ),
        )
    )
