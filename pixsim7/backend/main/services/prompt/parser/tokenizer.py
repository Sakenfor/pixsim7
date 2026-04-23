"""
Prompt tokenizer — line-level lexer and parser.

Pure Python port of packages/core/prompt/src/grammar.ts.
No external dependencies. No regex.

The lexer scans left-to-right and emits typed tokens.  RUN tokens
preserve the raw character and repeat count so downstream consumers
(recipes, i2v DSL interpreters) can assign semantics without the
lexer baking any in.

The line-level parser classifies each line as a section header, a
relation (IDENT op IDENT), or prose.  Neither stage raises: unknown
characters become TEXT tokens; unrecognised lines become prose nodes.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field
from typing import List, Optional, Literal

# ── load grammar rules from generated JSON ─────────────────────────────────

_RULES_PATH = pathlib.Path(__file__).parent / "grammar_rules.json"
_GRAMMAR_RULES: dict = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
_HEADER_PATTERNS: dict[str, dict] = {
    p["id"]: p for p in _GRAMMAR_RULES["header_patterns"]
}
_RELATION_OP_CHARS: frozenset[str] = frozenset(_GRAMMAR_RULES["relation"]["op_chars"])

# ── token kinds ────────────────────────────────────────────────────────────

TokenKind = Literal[
    "IDENT",    # [A-Za-z][A-Za-z0-9_]*
    "NUMBER",   # [0-9]+
    "RUN",      # consecutive run of one of: = < > _
    "COLON",    # :
    "LPAREN",   # (
    "RPAREN",   # )
    "PLUS",     # +
    "WS",       # [ \t]+
    "NEWLINE",  # \n or \r\n or \r
    "TEXT",     # any other single character (fallback)
]

RunChar = Literal["=", "<", ">", "_"]

RUN_CHARS: frozenset[str] = frozenset("=<>_")


@dataclass(slots=True)
class Token:
    kind: TokenKind
    start: int
    end: int
    text: str
    run_char: Optional[RunChar] = None   # only on RUN
    run_n: Optional[int] = None          # only on RUN


# ── lexer ──────────────────────────────────────────────────────────────────

def _is_letter(c: str) -> bool:
    return "a" <= c <= "z" or "A" <= c <= "Z"

def _is_upper(c: str) -> bool:
    return "A" <= c <= "Z"

def _is_digit(c: str) -> bool:
    return "0" <= c <= "9"

def _is_ident(c: str) -> bool:
    return _is_letter(c) or _is_digit(c) or c == "_"


def lex(text: str) -> List[Token]:
    """Tokenise *text* into a list of Tokens. Never raises."""
    out: List[Token] = []
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]

        # newlines
        if ch in ("\n", "\r"):
            start = i
            if ch == "\r" and i + 1 < n and text[i + 1] == "\n":
                i += 2
            else:
                i += 1
            out.append(Token("NEWLINE", start, i, text[start:i]))
            continue

        # horizontal whitespace
        if ch in (" ", "\t"):
            start = i
            while i < n and text[i] in (" ", "\t"):
                i += 1
            out.append(Token("WS", start, i, text[start:i]))
            continue

        # run of =, <, >, _
        if ch in RUN_CHARS:
            start = i
            c = ch
            while i < n and text[i] == c:
                i += 1
            out.append(Token("RUN", start, i, text[start:i], run_char=c, run_n=i - start))
            continue

        # identifier: [A-Za-z][A-Za-z0-9_]*
        # NOTE: underscore inside a run of letters stays part of the IDENT
        # (consistent with the TS grammar). Standalone `___` between
        # non-ident chars becomes a RUN token (handled above).
        if _is_letter(ch):
            start = i
            i += 1
            while i < n and _is_ident(text[i]):
                i += 1
            out.append(Token("IDENT", start, i, text[start:i]))
            continue

        # digit run
        if _is_digit(ch):
            start = i
            while i < n and _is_digit(text[i]):
                i += 1
            out.append(Token("NUMBER", start, i, text[start:i]))
            continue

        # single-char punctuation / fallback
        start = i
        i += 1
        if ch == ":":
            kind: TokenKind = "COLON"
        elif ch == "(":
            kind = "LPAREN"
        elif ch == ")":
            kind = "RPAREN"
        elif ch == "+":
            kind = "PLUS"
        else:
            kind = "TEXT"
        out.append(Token(kind, start, i, ch))

    return out


# ── line splitting ─────────────────────────────────────────────────────────

@dataclass(slots=True)
class _LineSlice:
    from_idx: int    # first token index (inclusive)
    to_idx: int      # last token index (exclusive), NEWLINE not included
    start: int       # source char start of line content
    end: int         # source char end of line content (before NEWLINE)
    next: int        # source char index of start of next line (after NEWLINE)


def _split_lines(tokens: List[Token], source: str) -> List[_LineSlice]:
    lines: List[_LineSlice] = []
    from_idx = 0
    line_start = 0

    for i, tok in enumerate(tokens):
        if tok.kind == "NEWLINE":
            lines.append(_LineSlice(from_idx, i, line_start, tok.start, tok.end))
            from_idx = i + 1
            line_start = tok.end

    # trailing line (no final newline, or source has chars after last newline)
    if from_idx <= len(tokens) - 1 or line_start < len(source):
        lines.append(_LineSlice(from_idx, len(tokens), line_start, len(source), len(source)))

    return lines


# ── line-level AST ─────────────────────────────────────────────────────────

@dataclass(slots=True)
class HeaderLine:
    kind: str = "header"
    pattern: str = ""        # PatternId: colon | assignment | assignment_arrow | angle_bracket | freestanding
    label: str = ""
    start: int = 0
    end: int = 0
    body_start: int = 0


@dataclass(slots=True)
class RelationLine:
    """
    A line of the form  IDENT op IDENT  where op is a run of < / > / =
    (or a compound like ==>).  Semantics are left to the recipe layer.
    """
    kind: str = "relation"
    lhs: Optional[str] = None
    rhs: Optional[str] = None
    raw: str = ""             # full operator string, e.g. ">>>>>>>"
    leading_char: Optional[str] = None   # dominant char before terminal
    terminal_char: Optional[str] = None  # final directional char
    run: int = 0              # total operator length
    start: int = 0
    end: int = 0


@dataclass(slots=True)
class ProseLine:
    kind: str = "prose"
    text: str = ""
    start: int = 0
    end: int = 0


LineNode = HeaderLine | RelationLine | ProseLine


# ── pattern helpers (values come from grammar_rules.json) ─────────────────

def _pat(id: str) -> dict:
    return _HEADER_PATTERNS[id]


def _is_upper_ident(text: str) -> bool:
    if not text or not _is_upper(text[0]):
        return False
    return all(_is_upper(c) or _is_digit(c) or c == "_" for c in text[1:])


def _is_all_upper(label: str) -> bool:
    return not any("a" <= c <= "z" for c in label)


def _try_assemble_mixed_label(
    tokens: List[Token], from_idx: int, to_idx: int
) -> Optional[str]:
    """
    Join IDENT / NUMBER / WS / TEXT(-&/) tokens into a label string.
    Returns None if any token is incompatible.
    """
    if from_idx >= to_idx:
        return None
    first = tokens[from_idx]
    if first.kind != "IDENT" or not _is_upper(first.text[0]):
        return None

    parts: List[str] = []
    prev_ws = False
    for i in range(from_idx, to_idx):
        t = tokens[i]
        if t.kind in ("IDENT", "NUMBER"):
            parts.append(t.text)
            prev_ws = False
        elif t.kind == "WS":
            if not prev_ws:
                parts.append(" ")
            prev_ws = True
        elif t.kind == "TEXT" and t.text in ("-", "&", "/"):
            parts.append(t.text)
            prev_ws = False
        else:
            return None
    return "".join(parts).strip()


def _trim_ws(
    tokens: List[Token], from_idx: int, to_idx: int
) -> tuple[int, int]:
    f, t = from_idx, to_idx
    while f < t and tokens[f].kind == "WS":
        f += 1
    while t > f and tokens[t - 1].kind == "WS":
        t -= 1
    return f, t


def _parse_line(line: _LineSlice, tokens: List[Token]) -> LineNode:
    i = line.from_idx
    while i < line.to_idx and tokens[i].kind == "WS":
        i += 1
    end = line.to_idx
    while end > i and tokens[end - 1].kind == "WS":
        end -= 1

    raw_text = "".join(t.text for t in tokens[line.from_idx:line.to_idx])
    prose = ProseLine(text=raw_text, start=line.start, end=line.end)

    if i >= end:
        return prose

    first = tokens[i]

    # ── angle_bracket: > LABEL < (line-terminal) ──────────────────────────
    p = _pat("angle_bracket")
    if first.kind == "RUN" and first.run_char == ">" and first.run_n == 1:
        last = tokens[end - 1]
        if last.kind == "RUN" and last.run_char == "<" and last.run_n == 1 and end - 1 > i:
            lf, lt = _trim_ws(tokens, i + 1, end - 1)
            if lt > lf:
                label = _try_assemble_mixed_label(tokens, lf, lt)
                if label and len(label) >= p["label_min"] and _is_all_upper(label):
                    return HeaderLine("header", "angle_bracket", label, line.start, line.end, line.next)

    if first.kind != "IDENT" or not _is_upper(first.text[0]):
        return _try_relation(line, tokens, i, end, prose)

    # ── colon header: Label: (possibly multi-word, line-terminal) ─────────
    p = _pat("colon")
    for k in range(i, end):
        if tokens[k].kind == "COLON":
            after = k + 1
            while after < end and tokens[after].kind == "WS":
                after += 1
            if after == end:
                lf, lt = _trim_ws(tokens, i, k)
                label = _try_assemble_mixed_label(tokens, lf, lt)
                if label and p["label_min"] <= len(label) <= p["label_max"]:
                    return HeaderLine("header", "colon", label, line.start, line.end, line.next)
            break

    if not _is_upper_ident(first.text):
        return _try_relation(line, tokens, i, end, prose)

    # ── assignment: LABEL = ... ───────────────────────────────────────────
    p = _pat("assignment")
    k = i + 1
    if k < end and tokens[k].kind == "WS":
        k += 1
    if k < end and tokens[k].kind == "RUN" and tokens[k].run_char == "=":
        label = first.text
        if p["label_min"] <= len(label) <= p["label_max"]:
            after = k + 1
            while after < end and tokens[after].kind == "WS":
                after += 1
            body_start = tokens[after].start if after < end else line.next
            return HeaderLine("header", "assignment", label, line.start, line.end, body_start)

    # ── assignment_arrow: LABEL > ... (WS before > mandatory) ────────────
    p = _pat("assignment_arrow")
    k = i + 1
    if k < end and tokens[k].kind == "WS":
        k += 1
        if k < end and tokens[k].kind == "RUN" and tokens[k].run_char == ">":
            label = first.text
            if p["label_min"] <= len(label) <= p["label_max"]:
                after = k + 1
                while after < end and tokens[after].kind == "WS":
                    after += 1
                body_start = tokens[after].start if after < end else line.next
                return HeaderLine("header", "assignment_arrow", label, line.start, line.end, body_start)

    # ── freestanding: LABEL (line-terminal) ──────────────────────────────
    p = _pat("freestanding")
    if i + 1 == end:
        label = first.text
        if p["label_min"] <= len(label) <= p["label_max"]:
            return HeaderLine("header", "freestanding", label, line.start, line.end, line.next)

    return _try_relation(line, tokens, i, end, prose)


def _try_relation(
    line: _LineSlice,
    tokens: List[Token],
    i: int,
    end: int,
    fallback: ProseLine,
) -> LineNode:
    """
    Try to parse IDENT? RUN(op) IDENT? as a relation node.
    Both operands are optional (e.g. standalone `=====>` has no LHS/RHS).
    """
    if i >= end:
        return fallback

    # Collect optional leading IDENT
    lhs: Optional[str] = None
    k = i
    if tokens[k].kind == "IDENT":
        lhs = tokens[k].text
        k += 1
        if k < end and tokens[k].kind == "WS":
            k += 1

    # Must have at least one RUN token from the relation op_chars set
    if k >= end or tokens[k].kind != "RUN" or tokens[k].run_char not in _RELATION_OP_CHARS:
        return fallback

    # Collect contiguous RUN tokens that form the operator (stay within op_chars)
    op_start = k
    while k < end and tokens[k].kind == "RUN" and tokens[k].run_char in _RELATION_OP_CHARS:
        k += 1
    op_end = k

    if op_start == op_end:
        return fallback

    raw_op = "".join(t.text for t in tokens[op_start:op_end])
    run_total = sum(t.run_n or 0 for t in tokens[op_start:op_end])

    # Derive leading char (dominant non-terminal) and terminal char
    op_toks = tokens[op_start:op_end]
    terminal_char: Optional[str] = op_toks[-1].run_char if op_toks[-1].run_char in ("<", ">") else None
    leading_char: Optional[str] = op_toks[0].run_char if len(op_toks) > 1 else None

    # Optional trailing WS + IDENT
    if k < end and tokens[k].kind == "WS":
        k += 1
    rhs: Optional[str] = None
    if k < end and tokens[k].kind == "IDENT":
        rhs = tokens[k].text
        k += 1

    # For a relation, only accept if at least one of lhs/rhs is present
    # OR the line is nothing but the operator (e.g. `=====>` alone).
    if lhs is None and rhs is None and k < end:
        return fallback

    return RelationLine(
        lhs=lhs,
        rhs=rhs,
        raw=raw_op,
        leading_char=leading_char,
        terminal_char=terminal_char,
        run=run_total,
        start=line.start,
        end=line.end,
    )


def parse_lines(tokens: List[Token], source: str) -> List[LineNode]:
    """Parse a token list into per-line AST nodes. Never raises."""
    return [_parse_line(sl, tokens) for sl in _split_lines(tokens, source)]


# ── public API ─────────────────────────────────────────────────────────────

def tokenize(text: str) -> dict:
    """
    Tokenise and line-parse *text*.

    Returns:
        {
            "lines": [
                {"kind": "header",   "pattern": "colon", "label": "Scene",
                 "start": 0, "end": 6, "body_start": 7},
                {"kind": "relation", "lhs": "ACTOR1", "rhs": "ACTOR2",
                 "raw": ">>>>>>>", "leading_char": null, "terminal_char": ">",
                 "run": 7, "start": 10, "end": 25},
                {"kind": "prose",    "text": "some words", "start": 26, "end": 36},
            ]
        }
    """
    toks = lex(text)
    nodes = parse_lines(toks, text)
    return {"lines": [_node_to_dict(n) for n in nodes]}


def _node_to_dict(n: LineNode) -> dict:
    if isinstance(n, HeaderLine):
        return {
            "kind": "header",
            "pattern": n.pattern,
            "label": n.label,
            "start": n.start,
            "end": n.end,
            "body_start": n.body_start,
        }
    if isinstance(n, RelationLine):
        return {
            "kind": "relation",
            "lhs": n.lhs,
            "rhs": n.rhs,
            "raw": n.raw,
            "leading_char": n.leading_char,
            "terminal_char": n.terminal_char,
            "run": n.run,
            "start": n.start,
            "end": n.end,
        }
    return {
        "kind": "prose",
        "text": n.text,
        "start": n.start,
        "end": n.end,
    }
