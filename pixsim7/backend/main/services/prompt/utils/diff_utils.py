"""Diff generation utilities for prompt versioning

Provides text diffing capabilities for tracking changes between prompt versions.
"""
import difflib
from typing import List, Tuple, Optional


class DiffFormat:
    """Diff format types"""
    UNIFIED = "unified"
    CONTEXT = "context"
    HTML = "html"
    INLINE = "inline"


def generate_unified_diff(
    old_text: str,
    new_text: str,
    from_label: str = "old",
    to_label: str = "new",
    context_lines: int = 3
) -> str:
    """Generate a unified diff between two text strings

    Args:
        old_text: Original text
        new_text: Modified text
        from_label: Label for old version
        to_label: Label for new version
        context_lines: Number of context lines to show

    Returns:
        Unified diff string
    """
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)

    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=from_label,
        tofile=to_label,
        lineterm='',
        n=context_lines
    )

    return ''.join(diff)


def generate_inline_diff(old_text: str, new_text: str) -> str:
    """Generate an inline diff with +/- markers

    Args:
        old_text: Original text
        new_text: Modified text

    Returns:
        Inline diff with +/- markers
    """
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()

    matcher = difflib.SequenceMatcher(None, old_lines, new_lines)
    result = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for line in old_lines[i1:i2]:
                result.append(f"  {line}")
        elif tag == 'delete':
            for line in old_lines[i1:i2]:
                result.append(f"- {line}")
        elif tag == 'insert':
            for line in new_lines[j1:j2]:
                result.append(f"+ {line}")
        elif tag == 'replace':
            for line in old_lines[i1:i2]:
                result.append(f"- {line}")
            for line in new_lines[j1:j2]:
                result.append(f"+ {line}")

    return '\n'.join(result)


def generate_html_diff(old_text: str, new_text: str) -> str:
    """Generate an HTML diff

    Args:
        old_text: Original text
        new_text: Modified text

    Returns:
        HTML diff string
    """
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()

    diff = difflib.HtmlDiff()
    return diff.make_table(
        old_lines,
        new_lines,
        fromdesc='Old Version',
        todesc='New Version',
        context=True,
        numlines=3
    )


def get_change_summary(old_text: str, new_text: str) -> dict:
    """Generate a summary of changes between two texts

    Args:
        old_text: Original text
        new_text: Modified text

    Returns:
        Dictionary with change statistics
    """
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()

    matcher = difflib.SequenceMatcher(None, old_lines, new_lines)

    additions = 0
    deletions = 0
    modifications = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'delete':
            deletions += (i2 - i1)
        elif tag == 'insert':
            additions += (j2 - j1)
        elif tag == 'replace':
            deletions += (i2 - i1)
            additions += (j2 - j1)
            modifications += 1

    # Calculate similarity ratio
    similarity = matcher.ratio()

    return {
        "additions": additions,
        "deletions": deletions,
        "modifications": modifications,
        "similarity": round(similarity, 4),
        "total_changes": additions + deletions,
        "old_length": len(old_lines),
        "new_length": len(new_lines)
    }


def get_word_diff(old_text: str, new_text: str) -> List[Tuple[str, str]]:
    """Generate a word-level diff

    Args:
        old_text: Original text
        new_text: Modified text

    Returns:
        List of (operation, word) tuples where operation is 'equal', 'delete', or 'insert'
    """
    old_words = old_text.split()
    new_words = new_text.split()

    matcher = difflib.SequenceMatcher(None, old_words, new_words)
    result = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for word in old_words[i1:i2]:
                result.append(('equal', word))
        elif tag == 'delete':
            for word in old_words[i1:i2]:
                result.append(('delete', word))
        elif tag == 'insert':
            for word in new_words[j1:j2]:
                result.append(('insert', word))
        elif tag == 'replace':
            for word in old_words[i1:i2]:
                result.append(('delete', word))
            for word in new_words[j1:j2]:
                result.append(('insert', word))

    return result
