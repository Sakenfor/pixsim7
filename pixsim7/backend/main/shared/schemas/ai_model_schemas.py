"""
AI Model Catalog schemas for unified handling of LLMs and parsers.

Key concepts:
  - provider: who makes the model (openai, anthropic, local)
  - method: how you reach it (api, cmd, remote)
  - model: the specific model (gpt-4, claude-3.5)
"""
from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional


class AiModelKind(str, Enum):
    """Type of AI model."""
    LLM = "llm"             # Remote LLM text model
    PARSER = "parser"       # Parsing/analysis engine
    EMBEDDING = "embedding" # Text embedding model
    BOTH = "both"           # Supports both roles


class AiModelCapability(str, Enum):
    """Capabilities that AI models can provide."""
    PROMPT_EDIT = "prompt_edit"
    PROMPT_PARSE = "prompt_parse"
    TAG_SUGGEST = "tag_suggest"
    EMBEDDING = "embedding"
    ASSISTANT_CHAT = "assistant_chat"


class DeliveryMethod(str, Enum):
    """How an LLM is reached."""
    API = "api"         # Direct HTTP API call (OpenAI/Anthropic SDKs)
    CMD = "cmd"         # Local subprocess on the server
    REMOTE = "remote"   # WebSocket bridge to user's terminal
    LOCAL = "local"     # Local llama-cpp engine on the server


class AiModel(BaseModel):
    """
    Describes an AI model or parsing engine available in the system.

    This is metadata only - actual invocation goes through provider registries
    or internal engines based on provider_id and kind.
    """
    id: str = Field(..., description="Unique model ID (e.g., 'openai:gpt-4', 'anthropic:claude-3.5')")
    label: str = Field(..., description="Human-readable name (e.g., 'GPT-4', 'Claude 3.5 Sonnet')")
    provider_id: Optional[str] = Field(None, description="Provider (who makes it): openai, anthropic, local")
    provider_instance_config_id: Optional[int] = Field(
        None,
        description="Optional provider instance config ID for using a specific configuration"
    )
    kind: AiModelKind = Field(..., description="Type of model (llm, parser, or both)")
    capabilities: List[AiModelCapability] = Field(..., description="List of capabilities this model supports")
    default_for: List[AiModelCapability] = Field(default_factory=list, description="Capabilities this model is default for (hint)")
    supported_methods: List[DeliveryMethod] = Field(
        default_factory=lambda: [DeliveryMethod.API],
        description="How this model can be reached (api, cmd, remote, local)",
    )
    description: Optional[str] = Field(None, description="Optional description of the model")

    class Config:
        use_enum_values = True
