"""
Bootstrap initialization for AI Model Registry.

This module registers default AI models and parsing engines at application startup.
"""
from pixsim7.backend.main.shared.schemas.ai_model_schemas import (
    AiModel,
    AiModelKind,
    AiModelCapability,
)
from .registry import ai_model_registry


def initialize_ai_models() -> None:
    """
    Initialize the AI model registry with default models.

    This is called at application startup to register:
    - Deterministic parsing engines (native parser configurations)
    - LLM models for prompt editing and tag suggestion
    """

    # === Parsing Engines ===

    # Native Simple Parser (default for parsing)
    ai_model_registry.register(
        AiModel(
            id="parser:native-simple",
            label="Native Simple Parser",
            provider_id="internal-parser",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            default_for=[AiModelCapability.PROMPT_PARSE],
            description="Deterministic prompt parser using PixSim7's native simple engine",
        )
    )

    # Native Strict Parser (future)
    ai_model_registry.register(
        AiModel(
            id="parser:native-strict",
            label="Native Strict Parser",
            provider_id="internal-parser",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            description="Strict deterministic parser with enhanced validation (future configuration)",
        )
    )

    # === LLM Models ===

    # OpenAI GPT-4o Mini (default for prompt editing)
    ai_model_registry.register(
        AiModel(
            id="openai:gpt-4o-mini",
            label="GPT-4o Mini",
            provider_id="openai-llm",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.TAG_SUGGEST,
            ],
            default_for=[AiModelCapability.PROMPT_EDIT],
            description="OpenAI GPT-4o Mini for prompt editing and tag suggestions",
        )
    )

    # Anthropic Claude 3.5
    ai_model_registry.register(
        AiModel(
            id="anthropic:claude-3.5",
            label="Claude 3.5 Sonnet",
            provider_id="anthropic-llm",
            kind=AiModelKind.LLM,
            capabilities=[AiModelCapability.PROMPT_EDIT],
            description="Anthropic Claude 3.5 Sonnet for prompt editing",
        )
    )

    # OpenAI GPT-4
    ai_model_registry.register(
        AiModel(
            id="openai:gpt-4",
            label="GPT-4",
            provider_id="openai-llm",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.TAG_SUGGEST,
            ],
            description="OpenAI GPT-4 for prompt editing and tag suggestions",
        )
    )

    # === Command LLM Models ===

    # Command LLM (user-defined local command)
    ai_model_registry.register(
        AiModel(
            id="cmd:default",
            label="Command LLM (Default)",
            provider_id="cmd-llm",
            kind=AiModelKind.LLM,
            capabilities=[AiModelCapability.PROMPT_EDIT],
            description=(
                "LLM via local CLI command. Configure via CMD_LLM_COMMAND and "
                "CMD_LLM_ARGS environment variables."
            ),
        )
    )

    # === Embedding Models ===

    # OpenAI text-embedding-3-small (default for embeddings)
    ai_model_registry.register(
        AiModel(
            id="openai:text-embedding-3-small",
            label="Text Embedding 3 Small",
            provider_id="openai-embedding",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            default_for=[AiModelCapability.EMBEDDING],
            description="OpenAI text-embedding-3-small (768 dims) for semantic similarity",
        )
    )

    # OpenAI text-embedding-3-large
    ai_model_registry.register(
        AiModel(
            id="openai:text-embedding-3-large",
            label="Text Embedding 3 Large",
            provider_id="openai-embedding",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            description="OpenAI text-embedding-3-large (768 dims) for high-quality semantic similarity",
        )
    )

    # Command Embedding (user-defined local command)
    ai_model_registry.register(
        AiModel(
            id="cmd:embedding-default",
            label="Command Embedding (Default)",
            provider_id="cmd-embedding",
            kind=AiModelKind.EMBEDDING,
            capabilities=[AiModelCapability.EMBEDDING],
            description=(
                "Embedding via local CLI command. Configure via CMD_EMBEDDING_COMMAND "
                "environment variable."
            ),
        )
    )
