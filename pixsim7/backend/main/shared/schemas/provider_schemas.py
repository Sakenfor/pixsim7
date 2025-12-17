"""
Provider schemas - shared types for provider plugins

This module defines the shared schemas used by both video and LLM provider plugins.
"""
from enum import Enum
from pydantic import BaseModel


class ProviderKind(str, Enum):
    """Provider kind/capability type"""
    VIDEO = "video"
    LLM = "llm"
    BOTH = "both"


class ProviderManifest(BaseModel):
    """Manifest for provider plugins"""
    id: str
    name: str
    version: str
    description: str
    author: str
    kind: ProviderKind  # NEW: Distinguish between video/LLM providers
    enabled: bool = True
    requires_credentials: bool = True
    domains: list[str] = []  # Provider domains for URL detection (e.g., ["sora.com", "chatgpt.com"])
    credit_types: list[str] = []  # Valid credit types (e.g., ["web", "openapi"])
