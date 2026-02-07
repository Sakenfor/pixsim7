"""
Shared schemas for AI-assisted discovery features.

These models are used across both API and service layers for category/pack/block discovery.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SuggestedOntologyId(BaseModel):
    """A suggested ontology ID from AI analysis."""
    id: str
    label: str
    description: Optional[str] = None
    kind: str  # e.g. "action", "state", "part", "manner", "agency"
    confidence: float


class SuggestedPackEntry(BaseModel):
    """A suggested semantic pack entry."""
    pack_id: str
    pack_label: str
    parser_hints: Dict[str, List[str]]  # candidate hints for this pack
    notes: Optional[str] = None


class SuggestedActionBlock(BaseModel):
    """A suggested ActionBlock for reuse."""
    block_id: str
    prompt: str
    tags: Dict[str, Any]
    notes: Optional[str] = None


class PromptBlockCandidate(BaseModel):
    """
    Normalized prompt block candidate.

    Unifies parser segments, LLM analysis blocks, and AI suggestions into
    a single shape for downstream processing and curation.
    """
    text: str
    role: Optional[str] = None
    category: Optional[str] = None
    ontology_ids: List[str] = Field(default_factory=list)
    tags: Dict[str, Any] = Field(default_factory=dict)
    source_type: Optional[str] = None
    block_id: Optional[str] = None
    confidence: Optional[float] = None
    sentence_index: Optional[int] = None
    start_pos: Optional[int] = None
    end_pos: Optional[int] = None
    matched_keywords: List[str] = Field(default_factory=list)
    role_scores: Dict[str, float] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
