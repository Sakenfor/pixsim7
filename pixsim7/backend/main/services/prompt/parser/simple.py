"""
PixSim7 Simple Prompt Parser

Lightweight, deterministic sentence-level parser with role classification.
No external dependencies beyond standard library + Pydantic.
"""

import re
from typing import List, Optional, Dict, Any, Set
from pydantic import BaseModel

from .stemmer import stem, find_stem_matches
from .negation import get_negated_words, filter_negated_keywords
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry


class PromptSegment(BaseModel):
    """A single segment parsed from a prompt."""
    role: str
    text: str
    start_pos: int
    end_pos: int
    sentence_index: int
    metadata: Dict[str, Any] = {}
    confidence: float = 0.0
    matched_keywords: List[str] = []
    role_scores: Dict[str, float] = {}


class PromptParseResult(BaseModel):
    """Complete result of parsing a prompt into segments."""
    text: str
    segments: List[PromptSegment]


class SimplePromptParser:
    """
    Simple sentence-level parser with keyword-based role classification.

    Behavior:
    1. Split text into sentences (handles unicode punctuation)
    2. Classify each sentence using keyword heuristics with stemming
    3. Exclude negated terms from classification
    4. Return confidence scores and matched keywords
    """

    # Extended sentence pattern to handle unicode punctuation
    # Matches: . ! ? ... — – (em/en dashes as sentence breaks)
    SENTENCE_PATTERN = re.compile(
        r'([^.!?\u2026\u2014\u2013]+[.!?\u2026]+)|'  # Standard + ellipsis (…)
        r'([^.!?\u2026\u2014\u2013]+[\u2014\u2013](?=\s|$))'  # Em/en dash as break
    )

    @staticmethod
    def _normalize_keyword_text(value: str) -> str:
        """Normalize delimiters so '_' and '-' behave like spaces."""
        normalized = re.sub(r"[_-]+", " ", value.lower())
        return " ".join(normalized.split())

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
        action_verbs = [v.lower() for v in self.role_registry.get_action_verbs() if isinstance(v, str)]
        self.action_verbs = set(action_verbs)
        # Pre-compute stemmed action verbs for matching
        self.action_verb_stems = {stem(v) for v in action_verbs}
        if hints:
            self.role_registry.apply_hints(hints)
        self.role_keywords = self.role_registry.get_role_keywords()
        self.role_priorities = self.role_registry.get_role_priorities()

        # Build keyword→ontology_ids lookup from vocab registry so the parser
        # can resolve ontology IDs during its existing matching pass (with
        # stemming + negation) instead of running a separate match_keywords().
        self._keyword_to_ontology: Dict[str, List[str]] = {}
        try:
            from pixsim7.backend.main.shared.ontology.vocabularies import get_registry
            raw_keyword_to_ontology = get_registry().get_keyword_to_ids()
            normalized_keyword_to_ontology: Dict[str, List[str]] = {}
            for keyword, item_ids in raw_keyword_to_ontology.items():
                norm = self._normalize_keyword_text(keyword)
                if not norm:
                    continue
                existing = normalized_keyword_to_ontology.setdefault(norm, [])
                for item_id in item_ids:
                    if item_id not in existing:
                        existing.append(item_id)
            self._keyword_to_ontology = normalized_keyword_to_ontology
        except Exception:
            pass

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
            role, metadata, confidence, matched_kw, role_scores = self._classify_sentence(sentence_text)
            segment = PromptSegment(
                role=role,
                text=sentence_text.strip(),
                start_pos=start_pos,
                end_pos=end_pos,
                sentence_index=idx,
                metadata=metadata,
                confidence=confidence,
                matched_keywords=matched_kw,
                role_scores=role_scores,
            )
            segments.append(segment)

        return PromptParseResult(text=text, segments=segments)

    def _split_sentences(self, text: str) -> List[tuple[str, int, int]]:
        """
        Split text into sentences with position tracking.

        Handles:
        - Standard punctuation: . ! ?
        - Unicode ellipsis: …
        - Em/en dashes as breaks: — –
        """
        sentences: List[tuple[str, int, int]] = []

        # First, try the regex pattern
        matches = list(self.SENTENCE_PATTERN.finditer(text))

        if not matches:
            # No sentence-ending punctuation found - treat as single sentence
            if text.strip():
                sentences.append((text, 0, len(text)))
            return sentences

        current_pos = 0

        for match in matches:
            # Get the matched group (either group 1 or group 2)
            sentence = match.group(1) or match.group(2)
            if sentence is None:
                continue

            start = match.start()
            end = match.end()

            # Handle any text before this match that wasn't captured
            if start > current_pos:
                prefix = text[current_pos:start].strip()
                if prefix:
                    sentences.append((prefix, current_pos, start))

            if sentence.strip():
                sentences.append((sentence, start, end))
            current_pos = end

        # Handle remaining text after last match
        if current_pos < len(text):
            remaining = text[current_pos:].strip()
            if remaining:
                sentences.append((remaining, current_pos, len(text)))

        return sentences

    def _classify_sentence(
        self, text: str
    ) -> tuple[str, Dict[str, Any], float, List[str], Dict[str, float]]:
        """
        Classify a sentence into a role using keyword heuristics.

        Returns:
            Tuple of (role, metadata, confidence, matched_keywords, role_scores)
        """
        text_lower = text.lower()
        normalized_text = self._normalize_keyword_text(text_lower)
        metadata: Dict[str, Any] = {}
        role_scores: Dict[str, float] = {}
        all_matched_keywords: List[str] = []

        # Get negated words to exclude from matching
        negated_words = get_negated_words(text_lower)
        if negated_words:
            metadata["negated_words"] = list(negated_words)

        # Extract words from text for matching
        words_in_text = set(re.findall(r'\b\w+\b', text_lower))
        stemmed_words = {stem(w) for w in words_in_text}

        # Match keywords for each role using stemming
        for role, keywords in self.role_keywords.items():
            matched = self._match_keywords_with_stemming(
                text_lower,
                normalized_text,
                words_in_text,
                stemmed_words,
                set(keywords),
                negated_words,
            )

            if matched:
                # Calculate score based on match count
                score = len(matched) / max(len(keywords), 1)
                role_scores[role] = round(score, 3)

                role_key = role.replace(":", "_")
                metadata[f"has_{role_key}_keywords"] = len(matched)
                metadata[f"matched_{role_key}"] = list(matched)
                all_matched_keywords.extend(matched)

        # Check for action verbs using stemming
        has_verb = self._has_action_verb(words_in_text, stemmed_words, negated_words)
        if has_verb:
            metadata["has_verb"] = True

        # Resolve ontology IDs from already-matched keywords.
        # This replaces the separate match_keywords() call so that ontology
        # matching inherits stemming + negation from the parser pass above.
        if self._keyword_to_ontology:
            seen_ids: Set[str] = set()
            ontology_ids: List[str] = []
            for kw in all_matched_keywords:
                normalized_keyword = self._normalize_keyword_text(kw)
                for oid in self._keyword_to_ontology.get(normalized_keyword, []):
                    if oid not in seen_ids:
                        seen_ids.add(oid)
                        ontology_ids.append(oid)
            if ontology_ids:
                metadata["ontology_ids"] = ontology_ids

        # Determine best role
        best_role = "other"
        confidence = 0.0

        # Special case: character + verb = action
        if "character" in role_scores and has_verb and "action" in self.role_keywords:
            metadata["character_action"] = True
            best_role = "action"
            # Combine character and action scores
            char_score = role_scores.get("character", 0)
            action_score = role_scores.get("action", 0)
            confidence = min(0.95, (char_score + action_score + 0.3) / 2)
            role_scores["action"] = max(role_scores.get("action", 0), confidence)

        elif role_scores:
            # Pick best role by score, then priority
            def sort_key(item: tuple[str, float]) -> tuple[float, int]:
                role_id, score = item
                return (score, self.role_priorities.get(role_id, 0))

            best_role, confidence = max(role_scores.items(), key=sort_key)

        # Remove duplicates from matched keywords while preserving order
        seen: Set[str] = set()
        unique_matched: List[str] = []
        for kw in all_matched_keywords:
            if kw not in seen:
                seen.add(kw)
                unique_matched.append(kw)

        return (best_role, metadata, round(confidence, 3), unique_matched, role_scores)

    def _match_keywords_with_stemming(
        self,
        text_lower: str,
        normalized_text: str,
        words_in_text: Set[str],
        stemmed_words: Set[str],
        keywords: Set[str],
        negated_words: Set[str],
    ) -> Set[str]:
        """
        Match keywords against text using stemming, excluding negated terms.

        Args:
            text_lower: Lowercase text
            words_in_text: Set of words in text
            stemmed_words: Set of stemmed words in text
            keywords: Keywords to match
            negated_words: Words to exclude (negated)

        Returns:
            Set of matched keywords
        """
        matched: Set[str] = set()

        for keyword in keywords:
            keyword_lower = keyword.lower()
            keyword_normalized = self._normalize_keyword_text(keyword_lower)

            # Skip if keyword is negated
            if keyword_lower in negated_words:
                continue

            # Multi-word keywords: check substring
            if ' ' in keyword_normalized:
                if keyword_normalized in normalized_text:
                    # Check if any word in the phrase is negated
                    phrase_words = set(keyword_normalized.split())
                    if not (phrase_words & negated_words):
                        matched.add(keyword)
                continue

            # Single word: direct match
            if keyword_normalized in words_in_text:
                matched.add(keyword)
                continue

            # Stem match
            keyword_stem = stem(keyword_normalized)
            if keyword_stem in stemmed_words:
                # Verify the matched stem isn't from a negated word
                # by checking if any non-negated word has this stem
                for word in words_in_text:
                    if word not in negated_words and stem(word) == keyword_stem:
                        matched.add(keyword)
                        break

        return matched

    def _has_action_verb(
        self,
        words_in_text: Set[str],
        stemmed_words: Set[str],
        negated_words: Set[str],
    ) -> bool:
        """
        Check if text contains an action verb (not negated).

        Uses stemming to match verb forms.
        """
        for word in words_in_text:
            if word in negated_words:
                continue

            # Direct match
            if word in self.action_verbs:
                return True

            # Stem match
            word_stem = stem(word)
            if word_stem in self.action_verb_stems:
                return True

        return False


async def parse_prompt(text: str) -> PromptParseResult:
    """Convenience function to parse a prompt."""
    parser = SimplePromptParser()
    return await parser.parse(text)
