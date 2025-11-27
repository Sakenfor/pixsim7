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
    - Deterministic parsing engines (prompt-dsl)
    - LLM models for prompt editing and tag suggestion
    """

    # === Parsing Engines ===

    # Prompt-DSL Simple Parser (default for parsing)
    ai_model_registry.register(
        AiModel(
            id="prompt-dsl:simple",
            label="Prompt-DSL Simple",
            provider_id="internal-prompt-dsl",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            default_for=[AiModelCapability.PROMPT_PARSE],
            description="Deterministic prompt parser using the prompt-dsl simple engine",
        )
    )

    # Prompt-DSL Strict Parser (future)
    ai_model_registry.register(
        AiModel(
            id="prompt-dsl:strict",
            label="Prompt-DSL Strict",
            provider_id="internal-prompt-dsl",
            kind=AiModelKind.PARSER,
            capabilities=[AiModelCapability.PROMPT_PARSE],
            description="Strict deterministic prompt parser with enhanced validation",
        )
    )

    # === LLM Models ===

    # OpenAI GPT-4.1 Mini (default for prompt editing)
    ai_model_registry.register(
        AiModel(
            id="openai:gpt-4.1-mini",
            label="GPT-4.1 Mini",
            provider_id="openai-llm",
            kind=AiModelKind.LLM,
            capabilities=[
                AiModelCapability.PROMPT_EDIT,
                AiModelCapability.TAG_SUGGEST,
            ],
            default_for=[AiModelCapability.PROMPT_EDIT],
            description="OpenAI GPT-4.1 Mini for prompt editing and tag suggestions",
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
