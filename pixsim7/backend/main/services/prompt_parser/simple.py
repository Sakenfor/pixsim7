"""
PixSim7 Simple Prompt Parser

Lightweight, deterministic sentence-level parser with role classification.
No external dependencies beyond standard library + Pydantic.

Replaces direct usage of prompt_dsl.PromptParser in PixSim7.
"""

import re
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from .ontology import ROLE_KEYWORDS, ACTION_VERBS


# ===== TYPES =====

class ParsedRole(str, Enum):
    """Coarse role classification for parsed blocks."""
    CHARACTER = "character"
    ACTION = "action"
    SETTING = "setting"
    MOOD = "mood"
    ROMANCE = "romance"
    OTHER = "other"


class ParsedBlock(BaseModel):
    """A single parsed block from a prompt."""
    role: ParsedRole
    text: str
    start_pos: int
    end_pos: int
    sentence_index: int
    metadata: Dict[str, Any] = {}


class ParsedPrompt(BaseModel):
    """Complete parsed prompt with all blocks."""
    text: str
    blocks: List[ParsedBlock]


# ===== PARSER =====

class SimplePromptParser:
    """
    Simple sentence-level parser with keyword-based role classification.

    Behavior:
    1. Split text into sentences
    2. Classify each sentence using keyword heuristics
    3. Store classification hints in metadata for future ontology work
    """

    # Sentence splitting pattern (similar to prompt_dsl SimpleParser)
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

        # Merge hints into role keywords if provided
        if hints:
            self._merge_hints(hints)

    def _merge_hints(self, hints: Dict[str, List[str]]) -> None:
        """
        Merge parser hints from semantic packs into role keywords.

        Args:
            hints: Hint map from semantic packs
        """
        for key, words in hints.items():
            # Handle both 'role:X' and plain 'X' formats
            role = key.replace("role:", "") if key.startswith("role:") else key

            # If this role exists in our keywords, extend it
            if role in self.role_keywords:
                for word in words:
                    if word.lower() not in [k.lower() for k in self.role_keywords[role]]:
                        self.role_keywords[role].append(word.lower())
            else:
                # New role from hints - add it
                self.role_keywords[role] = [w.lower() for w in words]

    async def parse(self, text: str, hints: Optional[Dict[str, List[str]]] = None) -> ParsedPrompt:
        """
        Parse prompt text into classified blocks.

        Args:
            text: Raw prompt text
            hints: Optional parser hints to use for this parse (overrides init hints)

        Returns:
            ParsedPrompt with classified blocks
        """
        # If hints provided at parse time, create a temporary parser with those hints
        if hints:
            parser = SimplePromptParser(hints=hints)
            return await parser.parse(text)

        # Split into sentences
        sentences = self._split_sentences(text)

        # Classify each sentence
        blocks: List[ParsedBlock] = []
        for idx, (sentence_text, start_pos, end_pos) in enumerate(sentences):
            role, metadata = self._classify_sentence(sentence_text)

            block = ParsedBlock(
                role=role,
                text=sentence_text.strip(),
                start_pos=start_pos,
                end_pos=end_pos,
                sentence_index=idx,
                metadata=metadata,
            )
            blocks.append(block)

        return ParsedPrompt(text=text, blocks=blocks)

    def _split_sentences(self, text: str) -> List[tuple[str, int, int]]:
        """
        Split text into sentences with position tracking.

        Returns:
            List of (sentence_text, start_pos, end_pos) tuples
        """
        sentences: List[tuple[str, int, int]] = []
        current_pos = 0

        # Find all sentence matches
        matches = list(self.SENTENCE_PATTERN.finditer(text))

        if not matches:
            # No sentence delimiters found - treat whole text as one sentence
            if text.strip():
                sentences.append((text, 0, len(text)))
            return sentences

        for match in matches:
            sentence = match.group(1)
            start = match.start(1)
            end = match.end(1)

            # Skip empty sentences
            if sentence.strip():
                sentences.append((sentence, start, end))

            current_pos = end

        # Handle any remaining text after last delimiter
        if current_pos < len(text):
            remaining = text[current_pos:].strip()
            if remaining:
                sentences.append((remaining, current_pos, len(text)))

        return sentences

    def _classify_sentence(self, text: str) -> tuple[ParsedRole, Dict[str, Any]]:
        """
        Classify a sentence into a role using keyword heuristics.

        Returns:
            (role, metadata) tuple with classification and hints
        """
        text_lower = text.lower()
        metadata: Dict[str, Any] = {}

        # Track what keywords we found
        found_roles: Dict[str, int] = {}

        # Check each role's keywords
        for role, keywords in self.role_keywords.items():
            count = sum(1 for keyword in keywords if keyword in text_lower)
            if count > 0:
                found_roles[role] = count
                metadata[f"has_{role}_keywords"] = count

        # Check for verbs (indicates action)
        words = re.findall(r'\b\w+\b', text_lower)
        has_verb = any(word in self.action_verbs for word in words)
        if has_verb:
            metadata["has_verb"] = True

        # Special handling for camera
        if "camera" in found_roles:
            metadata["has_camera_word"] = True
            # Camera blocks are marked as OTHER
            return (ParsedRole.OTHER, metadata)

        # Classification priority (from task spec):
        # 1. Romance (if romance keywords found)
        if "romance" in found_roles:
            return (ParsedRole.ROMANCE, metadata)

        # 2. Mood (if emotion keywords found)
        if "mood" in found_roles:
            return (ParsedRole.MOOD, metadata)

        # 3. Setting (if setting keywords found and no strong action indicators)
        if "setting" in found_roles:
            # If also has character and verb, prefer ACTION
            if "character" in found_roles and has_verb:
                return (ParsedRole.ACTION, metadata)
            return (ParsedRole.SETTING, metadata)

        # 4. Character + Action (character with verb)
        if "character" in found_roles and has_verb:
            # Mark as ACTION but note character presence
            metadata["character_action"] = True
            return (ParsedRole.ACTION, metadata)

        # 5. Character alone
        if "character" in found_roles:
            return (ParsedRole.CHARACTER, metadata)

        # 6. Action (if has verb)
        if has_verb or "action" in found_roles:
            return (ParsedRole.ACTION, metadata)

        # 7. Fallback to OTHER
        return (ParsedRole.OTHER, metadata)


# ===== CONVENIENCE FUNCTION =====

async def parse_prompt(text: str) -> ParsedPrompt:
    """
    Convenience function to parse a prompt.

    Args:
        text: Prompt text to parse

    Returns:
        ParsedPrompt with classified blocks
    """
    parser = SimplePromptParser()
    return await parser.parse(text)
