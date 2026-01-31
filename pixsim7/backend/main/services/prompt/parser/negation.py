"""
PixSim7 Negation Detection

Pattern-based negation detection for prompt parsing.
Identifies negated terms that should be excluded from role classification.

Purpose:
- "not a vampire" should NOT match "vampire" for character role
- "without any wolves" should NOT match "wolves"
- "never walks" should NOT match action verb "walks"
"""

import re
from typing import List, Set, Tuple, NamedTuple
from dataclasses import dataclass


@dataclass
class NegatedSpan:
    """A span of text that is negated."""
    start: int
    end: int
    pattern: str  # Which negation pattern matched
    negated_text: str  # The text that is negated


# Negation patterns with their scope (how many words they negate)
# Pattern format: (regex, scope_words)
# scope_words = -1 means "until end of clause/sentence"
NEGATION_PATTERNS = [
    # "not a/an X" - negates the noun phrase
    (r"\bnot\s+(?:a|an)\s+", 3),
    # "not X" - general negation
    (r"\bnot\s+", 2),
    # "no X" - negates the following noun/noun phrase
    (r"\bno\s+", 2),
    # "without X" or "without any X" - negates noun phrase
    (r"\bwithout\s+(?:any\s+)?", 3),
    # "never X" - negates the verb/action
    (r"\bnever\s+", 2),
    # "isn't/aren't/wasn't/weren't a/an X"
    (r"\b(?:isn't|aren't|wasn't|weren't)\s+(?:a|an\s+)?", 3),
    # "doesn't/don't/didn't X"
    (r"\b(?:doesn't|don't|didn't)\s+", 2),
    # "cannot/can't X"
    (r"\b(?:cannot|can't)\s+", 2),
    # "won't/wouldn't X"
    (r"\b(?:won't|wouldn't)\s+", 2),
    # "neither X nor Y"
    (r"\bneither\s+", 4),
    # "none of the X"
    (r"\bnone\s+of\s+(?:the\s+)?", 3),
    # "lack of X" / "lacking X"
    (r"\b(?:lack|lacking)\s+(?:of\s+)?", 2),
    # "absence of X"
    (r"\babsence\s+of\s+", 2),
    # "free from X" / "free of X"
    (r"\bfree\s+(?:from|of)\s+", 2),
]


def find_negated_spans(text: str) -> List[NegatedSpan]:
    """
    Find all negated spans in text.

    Args:
        text: Text to analyze

    Returns:
        List of NegatedSpan objects indicating negated regions
    """
    text_lower = text.lower()
    spans: List[NegatedSpan] = []

    for pattern, scope in NEGATION_PATTERNS:
        for match in re.finditer(pattern, text_lower):
            start = match.end()  # Negation starts after the pattern

            # Determine end of negated span
            if scope == -1:
                # Until end of clause (marked by punctuation or conjunction)
                clause_end = re.search(r'[.,;:!?]|\b(?:but|however|although)\b', text_lower[start:])
                if clause_end:
                    end = start + clause_end.start()
                else:
                    end = len(text)
            else:
                # Count words
                words_after = text_lower[start:].split()
                word_count = min(scope, len(words_after))
                if word_count > 0:
                    # Find the position after 'scope' words
                    remaining = text_lower[start:]
                    pos = 0
                    for i in range(word_count):
                        # Skip whitespace
                        while pos < len(remaining) and remaining[pos].isspace():
                            pos += 1
                        # Skip word
                        while pos < len(remaining) and not remaining[pos].isspace():
                            pos += 1
                    end = start + pos
                else:
                    end = start

            if end > start:
                negated_text = text[start:end].strip()
                spans.append(NegatedSpan(
                    start=start,
                    end=end,
                    pattern=pattern,
                    negated_text=negated_text
                ))

    # Sort by start position and merge overlapping spans
    spans.sort(key=lambda s: s.start)
    return spans


def get_negated_words(text: str) -> Set[str]:
    """
    Extract all words that appear in negated context.

    Args:
        text: Text to analyze

    Returns:
        Set of lowercase words that are negated
    """
    spans = find_negated_spans(text)
    negated_words: Set[str] = set()

    for span in spans:
        words = re.findall(r'\b\w+\b', span.negated_text.lower())
        negated_words.update(words)

    return negated_words


def is_word_negated(text: str, word: str, word_start: int) -> bool:
    """
    Check if a specific word occurrence is negated.

    Args:
        text: Full text
        word: The word to check
        word_start: Start position of the word in text

    Returns:
        True if this word occurrence is within a negated span
    """
    spans = find_negated_spans(text)
    word_end = word_start + len(word)

    for span in spans:
        # Word is negated if it falls within the negated span
        if span.start <= word_start < span.end:
            return True
        # Also check if span overlaps with word
        if word_start <= span.start < word_end:
            return True

    return False


def filter_negated_keywords(
    text: str,
    keywords: Set[str],
    keyword_positions: dict[str, List[int]] | None = None
) -> Tuple[Set[str], Set[str]]:
    """
    Split keywords into non-negated and negated sets.

    Args:
        text: Text to analyze
        keywords: Set of keywords found in text
        keyword_positions: Optional dict mapping keywords to their positions

    Returns:
        Tuple of (non_negated_keywords, negated_keywords)
    """
    negated_words = get_negated_words(text)

    non_negated: Set[str] = set()
    negated: Set[str] = set()

    for keyword in keywords:
        # Check if keyword (or any of its words) is negated
        keyword_words = set(keyword.lower().split())
        if keyword_words & negated_words:
            negated.add(keyword)
        else:
            non_negated.add(keyword)

    return non_negated, negated


def remove_negated_from_text(text: str) -> str:
    """
    Return text with negated portions removed.

    Useful for keyword matching that should ignore negated content.

    Args:
        text: Original text

    Returns:
        Text with negated spans replaced by spaces (preserving positions)
    """
    spans = find_negated_spans(text)
    if not spans:
        return text

    result = list(text)
    for span in spans:
        for i in range(span.start, min(span.end, len(result))):
            result[i] = ' '

    return ''.join(result)
