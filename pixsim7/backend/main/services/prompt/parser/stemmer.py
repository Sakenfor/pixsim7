"""
PixSim7 Lightweight Stemmer

Simple suffix-stripping stemmer for keyword matching.
No external dependencies - handles common English verb forms.

Purpose:
- Match "walking" to "walk", "entered" to "enter", etc.
- Improve keyword matching accuracy in prompt parsing
"""

import re
from typing import Set


# Irregular verb forms that shouldn't be stemmed normally
IRREGULAR_STEMS = {
    # past tense irregulars
    "ran": "run",
    "sat": "sit",
    "stood": "stand",
    "held": "hold",
    "told": "tell",
    "said": "say",
    "came": "come",
    "went": "go",
    "saw": "see",
    "knew": "know",
    "took": "take",
    "gave": "give",
    "found": "find",
    "thought": "think",
    "felt": "feel",
    "left": "leave",
    "kept": "keep",
    "began": "begin",
    "spoke": "speak",
    "brought": "bring",
    "caught": "catch",
    "taught": "teach",
    "sought": "seek",
    "bought": "buy",
    "fought": "fight",
    "lay": "lie",
    "led": "lead",
    "met": "meet",
    "paid": "pay",
    "read": "read",
    "sent": "send",
    "spent": "spend",
    "lost": "lose",
    "made": "make",
    "heard": "hear",
    "slept": "sleep",
    "woke": "wake",
    "wore": "wear",
    "wrote": "write",
    "rode": "ride",
    "rose": "rise",
    "drove": "drive",
    "broke": "break",
    "chose": "choose",
    "froze": "freeze",
    "shook": "shake",
    "stole": "steal",
    "flew": "fly",
    "grew": "grow",
    "threw": "throw",
    "drew": "draw",
    "knew": "know",
    "blew": "blow",
}

# Words that look like they have suffixes but shouldn't be stemmed
EXCEPTIONS = {
    "this", "his", "is", "was", "has", "does", "goes", "series",
    "species", "always", "sometimes", "perhaps", "yes", "no",
    "bed", "red", "led", "shed", "fled", "sped", "bred", "shred",
    "wed", "ahead", "instead", "overhead", "widespread",
    "being", "thing", "nothing", "something", "anything", "everything",
    "ring", "bring", "spring", "string", "swing", "sing", "king", "wing",
    "evening", "morning", "ceiling", "feeling", "meaning",
}


def stem(word: str) -> str:
    """
    Reduce a word to its stem/base form.

    Handles common English suffixes:
    - -ing (walking -> walk)
    - -ed (walked -> walk)
    - -es (watches -> watch)
    - -s (walks -> walk)

    Args:
        word: Word to stem (case-insensitive)

    Returns:
        Stemmed word in lowercase
    """
    word = word.lower().strip()

    if not word or len(word) < 3:
        return word

    # Check exceptions first
    if word in EXCEPTIONS:
        return word

    # Check irregular forms
    if word in IRREGULAR_STEMS:
        return IRREGULAR_STEMS[word]

    # Handle -ing
    if word.endswith("ing") and len(word) > 4:
        base = word[:-3]
        # running -> run (doubled consonant)
        if len(base) >= 2 and base[-1] == base[-2] and base[-1] not in "aeiou":
            return base[:-1]
        # making -> make (silent e)
        if len(base) >= 2 and base[-1] not in "aeiou" and base not in EXCEPTIONS:
            # Try adding 'e' back for words like "making" -> "make"
            if base + "e" in _common_bases:
                return base + "e"
            return base
        return base

    # Handle -ed
    if word.endswith("ed") and len(word) > 3:
        base = word[:-2]
        # walked -> walk
        if len(base) >= 2:
            # stopped -> stop (doubled consonant)
            if len(base) >= 2 and base[-1] == base[-2] and base[-1] not in "aeiou":
                return base[:-1]
            # liked -> like (silent e restoration)
            if base[-1] not in "aeiou" and base + "e" in _common_bases:
                return base + "e"
            return base
        return base

    # Handle -ied -> -y (tried -> try)
    if word.endswith("ied") and len(word) > 4:
        return word[:-3] + "y"

    # Handle -ies -> -y (tries -> try)
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"

    # Handle -es (watches -> watch, goes -> go)
    if word.endswith("es") and len(word) > 3:
        base = word[:-2]
        # watches -> watch, pushes -> push
        if base.endswith(("ch", "sh", "ss", "x", "z")):
            return base
        # goes -> go, does -> do
        if base.endswith("o"):
            return base
        # Otherwise just remove -s
        return word[:-1]

    # Handle -s (walks -> walk)
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]

    return word


# Common base forms for silent-e restoration
_common_bases = {
    "make", "take", "come", "give", "have", "like", "live", "love",
    "move", "use", "close", "create", "dance", "escape", "fade",
    "gaze", "hate", "hope", "joke", "leave", "name", "pace", "raise",
    "save", "share", "smile", "stare", "taste", "trace", "wake", "wave",
    "write", "ride", "rise", "drive", "arrive", "survive", "strive",
    "caress", "embrace", "stroke", "whisper", "desire", "admire",
}


def stem_set(words: Set[str]) -> Set[str]:
    """
    Stem a set of words and return both original and stemmed forms.

    Args:
        words: Set of words to process

    Returns:
        Set containing both original words and their stems
    """
    result = set(words)
    for word in words:
        stemmed = stem(word)
        if stemmed != word:
            result.add(stemmed)
    return result


def stems_match(word1: str, word2: str) -> bool:
    """
    Check if two words share the same stem.

    Args:
        word1: First word
        word2: Second word

    Returns:
        True if stems match
    """
    return stem(word1) == stem(word2)


def find_stem_matches(text: str, keywords: Set[str]) -> Set[str]:
    """
    Find keywords in text using stem matching.

    Args:
        text: Text to search in
        keywords: Keywords to look for

    Returns:
        Set of matched keywords (original keyword forms)
    """
    words_in_text = set(re.findall(r'\b\w+\b', text.lower()))
    stemmed_text_words = {stem(w) for w in words_in_text}

    matches = set()
    for keyword in keywords:
        keyword_lower = keyword.lower()
        # Direct match
        if keyword_lower in words_in_text:
            matches.add(keyword)
        # Stem match
        elif stem(keyword_lower) in stemmed_text_words:
            matches.add(keyword)

    return matches
