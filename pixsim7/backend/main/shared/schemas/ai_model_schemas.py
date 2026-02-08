"""
AI Model Catalog schemas for unified handling of LLMs and parsers.
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


class AiModel(BaseModel):
    """
    Describes an AI model or parsing engine available in the system.

    This is metadata only - actual invocation goes through provider registries
    or internal engines based on provider_id and kind.
    """
    id: str = Field(..., description="Unique model ID (e.g., 'openai:gpt-4.1-mini', 'prompt-dsl:simple')")
    label: str = Field(..., description="Human-readable name (e.g., 'GPT-4.1 Mini', 'Prompt-DSL Simple')")
    provider_id: Optional[str] = Field(None, description="Provider ID for LLM models, or internal engine identifier")
    provider_instance_config_id: Optional[int] = Field(
        None,
        description="Optional provider instance config ID for using a specific configuration"
    )
    kind: AiModelKind = Field(..., description="Type of model (llm, parser, or both)")
    capabilities: List[AiModelCapability] = Field(..., description="List of capabilities this model supports")
    default_for: List[AiModelCapability] = Field(default_factory=list, description="Capabilities this model is default for (hint)")
    description: Optional[str] = Field(None, description="Optional description of the model")

    class Config:
        use_enum_values = True
