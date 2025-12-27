"""
PixSim7 Simple Prompt Parser

Lightweight, deterministic sentence-level parser with role classification.
No external dependencies beyond standard library + Pydantic.
"""

import re
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from .ontology import ACTION_VERBS
from pixsim7.backend.main.domain.ontology import match_keywords
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry


class PromptSegment(BaseModel):
    """A single segment parsed from a prompt."""
    role: str
    text: str
    start_pos: int
    end_pos: int
    sentence_index: int
    metadata: Dict[str, Any] = {}


class PromptParseResult(BaseModel):
    """Complete result of parsing a prompt into segments."""
    text: str
    segments: List[PromptSegment]


class SimplePromptParser:
    """
    Simple sentence-level parser with keyword-based role classification.

    Behavior:
    1. Split text into sentences
    2. Classify each sentence using keyword heuristics
    3. Store classification hints in metadata for future ontology work
    """

    SENTENCE_PATTERN = re.compile(r'([^.!?]+[.!?]+)')

    def __init__(
        self,
        hints: Optional[Dict[str, List[str]]] = None,
        role_registry: Optional[PromptRoleRegistry] = None,
    ):
        """
        Initialize parser with ontology keywords.

        Args:
            hints: Optional parser hints from semantic packs to augment classification.
                   Format: { 'role:character': ['minotaur', 'werecow'], ... }
        """
        self.role_registry = role_registry.clone() if role_registry else PromptRoleRegistry.default()
        self.action_verbs = set(ACTION_VERBS)
        if hints:
            self.role_registry.apply_hints(hints)
        self.role_keywords = self.role_registry.get_role_keywords()
        self.role_priorities = self.role_registry.get_role_priorities()

    async def parse(self, text: str, hints: Optional[Dict[str, List[str]]] = None) -> PromptParseResult:
        """
        Parse prompt text into classified segments.

        Args:
            text: Raw prompt text
            hints: Optional parser hints to use for this parse

        Returns:
            PromptParseResult with classified segments
        """
        if hints:
            parser = SimplePromptParser(hints=hints, role_registry=self.role_registry)
            return await parser.parse(text)

        sentences = self._split_sentences(text)
        segments: List[PromptSegment] = []

        for idx, (sentence_text, start_pos, end_pos) in enumerate(sentences):
            role, metadata = self._classify_sentence(sentence_text)
            segment = PromptSegment(
                role=role,
                text=sentence_text.strip(),
                start_pos=start_pos,
                end_pos=end_pos,
                sentence_index=idx,
                metadata=metadata,
            )
            segments.append(segment)

        return PromptParseResult(text=text, segments=segments)

    def _split_sentences(self, text: str) -> List[tuple[str, int, int]]:
        """Split text into sentences with position tracking."""
        sentences: List[tuple[str, int, int]] = []
        current_pos = 0

        matches = list(self.SENTENCE_PATTERN.finditer(text))

        if not matches:
            if text.strip():
                sentences.append((text, 0, len(text)))
            return sentences

        for match in matches:
            sentence = match.group(1)
            start = match.start(1)
            end = match.end(1)

            if sentence.strip():
                sentences.append((sentence, start, end))
            current_pos = end

        if current_pos < len(text):
            remaining = text[current_pos:].strip()
            if remaining:
                sentences.append((remaining, current_pos, len(text)))

        return sentences

    def _classify_sentence(self, text: str) -> tuple[str, Dict[str, Any]]:
        """Classify a sentence into a role using keyword heuristics."""
        text_lower = text.lower()
        metadata: Dict[str, Any] = {}
        found_roles: Dict[str, int] = {}

        for role, keywords in self.role_keywords.items():
            count = sum(1 for keyword in keywords if keyword in text_lower)
            if count > 0:
                found_roles[role] = count
                role_key = role.replace(":", "_")
                metadata[f"has_{role_key}_keywords"] = count

        words = re.findall(r'\b\w+\b', text_lower)
        has_verb = any(word in self.action_verbs for word in words)
        if has_verb:
            metadata["has_verb"] = True

        try:
            ontology_ids = match_keywords(text_lower)
            if ontology_ids:
                metadata["ontology_ids"] = ontology_ids
        except Exception:
            pass

        if "setting" in found_roles and "character" in found_roles and has_verb and "action" in self.role_keywords:
            metadata["character_action"] = True
            return ("action", metadata)
        if "character" in found_roles and has_verb and "action" in self.role_keywords:
            metadata["character_action"] = True
            return ("action", metadata)

        if found_roles:
            def sort_key(item):
                role_id, count = item
                return (count, self.role_priorities.get(role_id, 0))

            best_role = max(found_roles.items(), key=sort_key)[0]
            return (best_role, metadata)

        return ("other", metadata)


async def parse_prompt(text: str) -> PromptParseResult:
    """Convenience function to parse a prompt."""
    parser = SimplePromptParser()
    return await parser.parse(text)
