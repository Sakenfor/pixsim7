"""
PixSim7 Simple Prompt Parser

Lightweight, deterministic sentence-level parser with role classification.
No external dependencies beyond standard library + Pydantic.
"""

import re
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from .ontology import ROLE_KEYWORDS, ACTION_VERBS
from pixsim7.backend.main.domain.ontology import match_keywords
from pixsim7.backend.main.domain.prompt.enums import PromptSegmentRole


class PromptSegment(BaseModel):
    """A single segment parsed from a prompt."""
    role: PromptSegmentRole
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

    def __init__(self, hints: Optional[Dict[str, List[str]]] = None):
        """
        Initialize parser with ontology keywords.

        Args:
            hints: Optional parser hints from semantic packs to augment classification.
                   Format: { 'role:character': ['minotaur', 'werecow'], ... }
        """
        self.role_keywords = ROLE_KEYWORDS.copy()
        self.action_verbs = set(ACTION_VERBS)

        if hints:
            self._merge_hints(hints)

    def _merge_hints(self, hints: Dict[str, List[str]]) -> None:
        """Merge parser hints from semantic packs into role keywords."""
        for key, words in hints.items():
            if key.startswith("role:"):
                role = key.replace("role:", "")
            else:
                continue

            if role not in self.role_keywords:
                continue

            existing = [k.lower() for k in self.role_keywords[role]]
            for word in words:
                w = word.lower()
                if w not in existing:
                    self.role_keywords[role].append(w)

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
            parser = SimplePromptParser(hints=hints)
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

    def _classify_sentence(self, text: str) -> tuple[PromptSegmentRole, Dict[str, Any]]:
        """Classify a sentence into a role using keyword heuristics."""
        text_lower = text.lower()
        metadata: Dict[str, Any] = {}
        found_roles: Dict[str, int] = {}

        for role, keywords in self.role_keywords.items():
            count = sum(1 for keyword in keywords if keyword in text_lower)
            if count > 0:
                found_roles[role] = count
                metadata[f"has_{role}_keywords"] = count

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

        # Camera → OTHER
        if "camera" in found_roles:
            metadata["has_camera_word"] = True
            return (PromptSegmentRole.OTHER, metadata)

        # Priority: romance > mood > setting > character+action > character > action > other
        if "romance" in found_roles:
            return (PromptSegmentRole.ROMANCE, metadata)

        if "mood" in found_roles:
            return (PromptSegmentRole.MOOD, metadata)

        if "setting" in found_roles:
            if "character" in found_roles and has_verb:
                return (PromptSegmentRole.ACTION, metadata)
            return (PromptSegmentRole.SETTING, metadata)

        if "character" in found_roles and has_verb:
            metadata["character_action"] = True
            return (PromptSegmentRole.ACTION, metadata)

        if "character" in found_roles:
            return (PromptSegmentRole.CHARACTER, metadata)

        if has_verb or "action" in found_roles:
            return (PromptSegmentRole.ACTION, metadata)

        return (PromptSegmentRole.OTHER, metadata)


async def parse_prompt(text: str) -> PromptParseResult:
    """Convenience function to parse a prompt."""
    parser = SimplePromptParser()
    return await parser.parse(text)
