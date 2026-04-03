"""
Tag vocabulary registry for AI-assisted PromptFamily tagging.

Loads tag_vocabulary.yaml at import time and exposes a singleton registry
used by the tag suggester to build LLM system prompts per authoring mode.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml

_CONFIG_PATH = Path(__file__).parent / "tag_vocabulary.yaml"


@dataclass
class PrefixDef:
    prefix: str
    description: str = ""
    examples: List[str] = field(default_factory=list)


@dataclass
class ModeVocabulary:
    instruction: str
    prefixes: List[PrefixDef]
    min_tags: int = 2
    max_tags: int = 6


class TagVocabularyRegistry:
    """
    In-memory registry loaded from tag_vocabulary.yaml.

    Usage:
        vocab = tag_vocabulary_registry.get("character_design")
        # vocab.instruction, vocab.prefixes, vocab.min_tags, vocab.max_tags
    """

    def __init__(self) -> None:
        self._modes: Dict[str, ModeVocabulary] = {}
        self._fallback: Optional[ModeVocabulary] = None
        self._defaults: Dict[str, int] = {"min_tags": 2, "max_tags": 6}
        self._load()

    def _load(self) -> None:
        with open(_CONFIG_PATH) as fh:
            data = yaml.safe_load(fh)

        self._defaults = data.get("defaults", self._defaults)

        for mode_id, mode_data in data.get("modes", {}).items():
            self._modes[mode_id] = self._parse(mode_data)

        if "fallback" in data:
            self._fallback = self._parse(data["fallback"])

    def _parse(self, data: dict) -> ModeVocabulary:
        prefixes = [
            PrefixDef(
                prefix=p["prefix"],
                description=p.get("description", ""),
                examples=p.get("examples", []),
            )
            for p in data.get("prefixes", [])
        ]
        return ModeVocabulary(
            instruction=data.get("instruction", "").strip(),
            prefixes=prefixes,
            min_tags=data.get("min_tags", self._defaults.get("min_tags", 2)),
            max_tags=data.get("max_tags", self._defaults.get("max_tags", 6)),
        )

    def get(self, mode_id: Optional[str]) -> ModeVocabulary:
        """Return vocabulary for mode_id, or fallback if not found."""
        if mode_id and mode_id in self._modes:
            return self._modes[mode_id]
        return self._fallback or ModeVocabulary(
            instruction="Focus on the primary subject, visual style, and mood.",
            prefixes=[
                PrefixDef(prefix="type", examples=["scene", "character"]),
                PrefixDef(prefix="mood", examples=["calm", "tense"]),
            ],
        )

    def mode_ids(self) -> List[str]:
        return list(self._modes.keys())


tag_vocabulary_registry = TagVocabularyRegistry()
