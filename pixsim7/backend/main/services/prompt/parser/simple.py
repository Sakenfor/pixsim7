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
from pixsim7.backend.main.services.prompt.role_registry import (
    PromptRoleRegistry,
    PromptRoleDefinition,
    DEFAULT_DYNAMIC_PRIORITY,
)


class RoleKeywordOverrides(BaseModel):
    """Per-role keyword patches."""
    add: List[str] = []
    remove: List[str] = []


class SimpleParserConfig(BaseModel):
    """Configuration for SimplePromptParser behavior.

    Strategy toggles control which parsing features are active.
    All default to True for full analysis; disable individual
    features to reduce false positives or processing overhead.
    """
    # Section pre-pass
    enable_section_parsing: bool = True
    section_label_confidence: float = 0.9
    # Keyword matching strategies
    enable_stemming: bool = True
    enable_negation: bool = True
    # Heuristics
    enable_action_inference: bool = True
    enable_ontology_resolution: bool = True
    # Classification threshold — roles scoring below this are discarded
    min_confidence: float = 0.0
    # Role classification tuning
    default_role: str = "other"
    disabled_roles: List[str] = []
    role_keywords: Dict[str, RoleKeywordOverrides] = {}


class PromptSection(BaseModel):
    """A section of prompt text delimited by an explicit header like 'CAMERA:'."""
    label: Optional[str]       # None for unsectioned preamble
    text: str                  # Body text (after the header)
    start_pos: int
    end_pos: int
    header_start: Optional[int] = None
    header_end: Optional[int] = None


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
    sections: Optional[List[PromptSection]] = None


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

    # Matches lines like "CABIN INTERIOR:" or "Body Language:" on their own line.
    # Requires at least 2 characters in the label, colon at end, nothing else on line.
    SECTION_HEADER = re.compile(
        r'^[ \t]*([A-Z][A-Za-z /&\-]{1,}?)\s*:\s*$',
        re.MULTILINE,
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
        config: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize parser with ontology keywords.

        Args:
            hints: Optional parser hints from semantic packs to augment classification.
                   Format: { 'role:character': ['minotaur', 'werecow'], ... }
            config: Optional config dict for parser behavior (section parsing, thresholds).
        """
        self.config = SimpleParserConfig(**(config or {}))
        self.role_registry = role_registry.clone() if role_registry else PromptRoleRegistry.default()
        action_verbs = [v.lower() for v in self.role_registry.get_action_verbs() if isinstance(v, str)]
        self.action_verbs = set(action_verbs)
        # Pre-compute stemmed action verbs for matching
        self.action_verb_stems = {stem(v) for v in action_verbs}
        if hints:
            self.role_registry.apply_hints(hints)
        self.role_keywords = self.role_registry.get_role_keywords()
        self.role_priorities = self.role_registry.get_role_priorities()

        # Apply config-driven role overrides
        if self.config.disabled_roles:
            for role_id in self.config.disabled_roles:
                self.role_keywords.pop(role_id, None)

        if self.config.role_keywords:
            for role_id, overrides in self.config.role_keywords.items():
                if role_id not in self.role_keywords:
                    # Role doesn't exist yet — create it with added keywords
                    if overrides.add:
                        self.role_keywords[role_id] = list(overrides.add)
                    continue
                current = self.role_keywords[role_id]
                if overrides.remove:
                    remove_lower = {k.lower() for k in overrides.remove}
                    current = [k for k in current if k.lower() not in remove_lower]
                if overrides.add:
                    existing_lower = {k.lower() for k in current}
                    current.extend(k for k in overrides.add if k.lower() not in existing_lower)
                self.role_keywords[role_id] = current

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
            parser = SimplePromptParser(hints=hints, role_registry=self.role_registry, config=self.config.model_dump())
            return await parser.parse(text)

        sections = self._split_sections(text) if self.config.enable_section_parsing else []
        has_sections = len(sections) > 1 or (len(sections) == 1 and sections[0].label is not None)

        if has_sections:
            # Auto-register dynamic roles for section labels
            for section in sections:
                if section.label is not None:
                    normalized = self._normalize_section_label(section.label)
                    if not self.role_registry.has_role(normalized):
                        self.role_registry.register_role(
                            PromptRoleDefinition(
                                id=normalized,
                                label=section.label.strip().title(),
                                keywords=[],
                                action_verbs=[],
                                priority=DEFAULT_DYNAMIC_PRIORITY,
                            )
                        )
                        # Refresh keyword/priority caches after registration
                        self.role_keywords = self.role_registry.get_role_keywords()
                        self.role_priorities = self.role_registry.get_role_priorities()

        segments: List[PromptSegment] = []
        sentence_idx = 0

        if has_sections:
            for section in sections:
                sentences = self._split_sentences(section.text)
                for sentence_text, local_start, local_end in sentences:
                    role, metadata, confidence, matched_kw, role_scores = self._classify_sentence(sentence_text)

                    # Adjust positions to be relative to the full original text
                    abs_start = section.start_pos + local_start
                    abs_end = section.start_pos + local_end

                    if section.label is not None:
                        section_role = self._normalize_section_label(section.label)
                        metadata["inferred_role"] = role
                        metadata["section_label"] = section.label.strip()
                        role = section_role
                        confidence = max(confidence, self.config.section_label_confidence)

                    segment = PromptSegment(
                        role=role,
                        text=sentence_text.strip(),
                        start_pos=abs_start,
                        end_pos=abs_end,
                        sentence_index=sentence_idx,
                        metadata=metadata,
                        confidence=confidence,
                        matched_keywords=matched_kw,
                        role_scores=role_scores,
                    )
                    segments.append(segment)
                    sentence_idx += 1
        else:
            sentences = self._split_sentences(text)
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

        return PromptParseResult(
            text=text,
            segments=segments,
            sections=sections if has_sections else None,
        )

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

    def _split_sections(self, text: str) -> List[PromptSection]:
        """
        Split text into sections delimited by explicit headers like 'CAMERA:'.

        Returns a list of PromptSection objects. If no headers are found,
        returns a single section with label=None covering the entire text.
        """
        matches = list(self.SECTION_HEADER.finditer(text))

        if not matches:
            return [PromptSection(
                label=None,
                text=text,
                start_pos=0,
                end_pos=len(text),
            )]

        sections: List[PromptSection] = []

        # Text before first header → unlabeled preamble
        first_header_start = matches[0].start()
        if first_header_start > 0:
            preamble_text = text[:first_header_start]
            if preamble_text.strip():
                sections.append(PromptSection(
                    label=None,
                    text=preamble_text,
                    start_pos=0,
                    end_pos=first_header_start,
                ))

        for i, match in enumerate(matches):
            label = match.group(1).strip()
            header_start = match.start()
            header_end = match.end()

            # Body runs from end of header line to start of next header (or EOF)
            body_start = header_end
            if i + 1 < len(matches):
                body_end = matches[i + 1].start()
            else:
                body_end = len(text)

            body_text = text[body_start:body_end]

            sections.append(PromptSection(
                label=label,
                text=body_text,
                start_pos=body_start,
                end_pos=body_end,
                header_start=header_start,
                header_end=header_end,
            ))

        return sections

    @staticmethod
    def _normalize_section_label(label: str) -> str:
        """Normalize a section label to a snake_case role ID."""
        return re.sub(r'[\s\-]+', '_', label.strip()).lower()

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
        negated_words: Set[str] = set()
        if self.config.enable_negation:
            negated_words = get_negated_words(text_lower)
            if negated_words:
                metadata["negated_words"] = list(negated_words)

        # Extract words from text for matching
        words_in_text = set(re.findall(r'\b\w+\b', text_lower))
        stemmed_words = {stem(w) for w in words_in_text} if self.config.enable_stemming else set()

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
        has_verb = False
        if self.config.enable_action_inference:
            has_verb = self._has_action_verb(words_in_text, stemmed_words, negated_words)
            if has_verb:
                metadata["has_verb"] = True

        # Resolve ontology IDs from already-matched keywords.
        # This replaces the separate match_keywords() call so that ontology
        # matching inherits stemming + negation from the parser pass above.
        if self.config.enable_ontology_resolution and self._keyword_to_ontology:
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
        best_role = self.config.default_role
        confidence = 0.0

        # Special case: character + verb = action
        if (
            self.config.enable_action_inference
            and "character" in role_scores
            and has_verb
            and "action" in self.role_keywords
        ):
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

        # Apply min_confidence threshold
        if confidence < self.config.min_confidence:
            best_role = self.config.default_role
            confidence = 0.0

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

            # Stem match (only when stemming is enabled)
            if stemmed_words:
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

            # Stem match (only when stemming is enabled)
            if stemmed_words:
                word_stem = stem(word)
                if word_stem in self.action_verb_stems:
                    return True

        return False


async def parse_prompt(text: str) -> PromptParseResult:
    """Convenience function to parse a prompt."""
    parser = SimplePromptParser()
    return await parser.parse(text)
