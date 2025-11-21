"""Text similarity utilities for prompt versioning

Provides lightweight similarity scoring without heavy ML dependencies.
"""
from typing import Set
import re
import difflib


def calculate_text_similarity(text1: str, text2: str, method: str = "combined") -> float:
    """Calculate similarity score between two texts

    Args:
        text1: First text
        text2: Second text
        method: 'combined' (default), 'sequence', 'token', or 'ngram'

    Returns:
        Similarity score between 0 and 1
    """
    if method == "sequence":
        return _sequence_similarity(text1, text2)
    elif method == "token":
        return _token_similarity(text1, text2)
    elif method == "ngram":
        return _ngram_similarity(text1, text2)
    else:  # combined
        # Weighted average of multiple methods
        seq_sim = _sequence_similarity(text1, text2)
        tok_sim = _token_similarity(text1, text2)
        ngram_sim = _ngram_similarity(text1, text2)
        return (seq_sim * 0.3 + tok_sim * 0.4 + ngram_sim * 0.3)


def _sequence_similarity(text1: str, text2: str) -> float:
    """Calculate similarity using SequenceMatcher (like diff)"""
    return difflib.SequenceMatcher(None, text1.lower(), text2.lower()).ratio()


def _token_similarity(text1: str, text2: str) -> float:
    """Calculate similarity based on word overlap (Jaccard similarity)"""
    tokens1 = set(_tokenize(text1))
    tokens2 = set(_tokenize(text2))

    if not tokens1 and not tokens2:
        return 1.0
    if not tokens1 or not tokens2:
        return 0.0

    intersection = tokens1 & tokens2
    union = tokens1 | tokens2

    return len(intersection) / len(union)


def _ngram_similarity(text1: str, text2: str, n: int = 3) -> float:
    """Calculate similarity using character n-grams"""
    ngrams1 = _get_ngrams(text1.lower(), n)
    ngrams2 = _get_ngrams(text2.lower(), n)

    if not ngrams1 and not ngrams2:
        return 1.0
    if not ngrams1 or not ngrams2:
        return 0.0

    intersection = ngrams1 & ngrams2
    union = ngrams1 | ngrams2

    return len(intersection) / len(union)


def _tokenize(text: str) -> list:
    """Split text into tokens (words)"""
    # Remove punctuation and split on whitespace
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    return [t for t in text.split() if t]


def _get_ngrams(text: str, n: int) -> Set[str]:
    """Generate character n-grams from text"""
    text = text.replace(' ', '')
    return set(text[i:i+n] for i in range(len(text) - n + 1))


def find_duplicate_prompts(
    prompts: list[str],
    threshold: float = 0.9
) -> list[tuple[int, int, float]]:
    """Find near-duplicate prompts in a list

    Args:
        prompts: List of prompt texts
        threshold: Minimum similarity to consider duplicate

    Returns:
        List of (index1, index2, similarity) tuples
    """
    duplicates = []

    for i in range(len(prompts)):
        for j in range(i + 1, len(prompts)):
            similarity = calculate_text_similarity(prompts[i], prompts[j])
            if similarity >= threshold:
                duplicates.append((i, j, similarity))

    return duplicates


def extract_keywords(text: str, top_n: int = 10) -> list[str]:
    """Extract important keywords from prompt text

    Args:
        text: Prompt text
        top_n: Number of keywords to extract

    Returns:
        List of keywords
    """
    # Simple frequency-based extraction
    # Filter out common stop words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'should', 'could', 'may', 'might', 'must', 'can'
    }

    tokens = _tokenize(text)
    # Count frequency, excluding stop words
    freq = {}
    for token in tokens:
        if token not in stop_words and len(token) > 2:
            freq[token] = freq.get(token, 0) + 1

    # Sort by frequency
    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)

    return [word for word, _ in sorted_keywords[:top_n]]
