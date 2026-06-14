"""
Prompt tokenizer — line-level lexer and parser.

Pure Python port of packages/core/prompt/src/grammar.ts.
No external dependencies. No regex.

The lexer scans left-to-right and emits typed tokens.  RUN tokens
preserve the raw character and repeat count so downstream consumers
(recipes, i2v DSL interpreters) can assign semantics without the
lexer baking any in.

The line-level parser classifies each line as a section header
(colon / angle_bracket / freestanding line shapes), a *chain* of
var|prose elements separated by operator runs, or prose.  Neither
stage raises: unknown characters become TEXT tokens; lines with no
operators and no header shape become prose nodes.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass, field
from typing import List, Optional, Literal, Tuple

# ── load grammar rules from generated JSON ─────────────────────────────────

_RULES_PATH = pathlib.Path(__file__).parent / "grammar_rules.json"
_GRAMMAR_RULES: dict = json.loads(_RULES_PATH.read_text(encoding="utf-8"))
_HEADER_PATTERNS: dict[str, dict] = {
    p["id"]: p for p in _GRAMMAR_RULES["header_patterns"]
}


def get_operator_vocabulary() -> dict:
    """Return the operator vocabulary block from grammar_rules.json.

    Shape::

        {
            "swap_targets": ["=","<",...],     # global default
            "max_run_length": 12,              # global default
            "contexts": [                       # per-line_kind overrides
                {"line_kind": "colon", "swap_targets": [":","=",">"],
                 "max_run_length": 1},
                ...
            ],
        }

    ``contexts`` narrows the suggested swaps / run-length cap per line_kind;
    a context inherits any field it omits from the global default. Defaults
    are returned if a field is missing.
    """
    raw = _GRAMMAR_RULES.get("operator_vocabulary") or {}
    swap_targets = raw.get("swap_targets")
    max_run = raw.get("max_run_length")
    contexts = raw.get("contexts")
    return {
        "swap_targets": list(swap_targets) if isinstance(swap_targets, list) else ["=", "<", ">"],
        "max_run_length": int(max_run) if isinstance(max_run, int) else 12,
        "contexts": list(contexts) if isinstance(contexts, list) else [],
    }

# ── token kinds ────────────────────────────────────────────────────────────

TokenKind = Literal[
    "IDENT",     # [A-Za-z][A-Za-z0-9_]*
    "NUMBER",    # [0-9]+
    "RUN",       # consecutive run of one of: = < > _
    "COLON",     # :
    "LPAREN",    # (
    "RPAREN",    # )
    "PLUS",      # +
    "STMT_SEP",  # ;  logical line separator
    "WS",        # [ \t]+
    "NEWLINE",   # \n or \r\n or \r
    "TEXT",      # any other single character (fallback)
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
        elif ch == ";":
            kind = "STMT_SEP"
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
        if tok.kind in ("NEWLINE", "STMT_SEP"):
            lines.append(_LineSlice(from_idx, i, line_start, tok.start, tok.end))
            from_idx = i + 1
            line_start = tok.end

    # trailing line (no final newline/separator, or source has chars after last one)
    if from_idx <= len(tokens) - 1 or line_start < len(source):
        lines.append(_LineSlice(from_idx, len(tokens), line_start, len(source), len(source)))

    return lines


# ── line-level AST ─────────────────────────────────────────────────────────

@dataclass(slots=True)
class HeaderLine:
    """Line-terminal section header: `colon`, `angle_bracket`, or `freestanding`."""
    kind: str = "header"
    pattern: str = ""        # PatternId: colon | angle_bracket | freestanding
    label: str = ""
    start: int = 0
    end: int = 0
    body_start: int = 0
    # Absolute char range of the operator token (`:` for colon header).
    # None for `angle_bracket` (the > <  brackets bound the label, no single
    # operator token) and `freestanding` (no operator).
    op_start: Optional[int] = None
    op_end: Optional[int] = None


@dataclass(slots=True)
class ChainElement:
    """One element in a chain. `var` if exactly one UPPER_IDENT; `prose` otherwise."""
    kind: Literal["var", "prose"]
    text: str
    start: int
    end: int


@dataclass(slots=True)
class ChainOperator:
    """One operator run between two chain elements."""
    op: str            # raw operator text, e.g. "===>", "<", "=", ":"
    run: int           # total char count
    op_start: int
    op_end: int


@dataclass(slots=True)
class ChainLine:
    """
    A line composed of var|prose elements separated by operator runs.

    Invariant: ``len(elements) == len(operators) + 1``.
    Either the first or last element (or both) may be empty
    (start == end), which represents bare leading/trailing operator
    runs (e.g. `=====>` parses to two empty elements with one operator).

    Examples:
        ACTOR1 = body                   → 2 elems (var, prose), 1 op
        ACTOR1 < Lingua ūmida...        → 2 elems (var, prose), 1 op
        A<B<C = body                    → 4 elems (3 vars + prose), 3 ops
        ACTOR1 ===> SCENE <=== ACTOR2   → 3 vars, 2 ops
        =====>                          → 2 empty prose elems, 1 op
    """
    kind: str = "chain"
    elements: List[ChainElement] = field(default_factory=list)
    operators: List[ChainOperator] = field(default_factory=list)
    start: int = 0
    end: int = 0


@dataclass(slots=True)
class ProseLine:
    kind: str = "prose"
    text: str = ""
    start: int = 0
    end: int = 0


LineNode = HeaderLine | ChainLine | ProseLine


# ── pattern helpers (values come from grammar_rules.json) ─────────────────

def _pat(id: str) -> dict:
    return _HEADER_PATTERNS[id]


def _is_upper_ident(text: str) -> bool:
    if not text or not _is_upper(text[0]):
        return False
    return all(_is_upper(c) or _is_digit(c) or c == "_" for c in text[1:])


def _is_all_upper(label: str) -> bool:
    return not any("a" <= c <= "z" for c in label)


def _is_var_call(tokens: List[Token], f: int, t: int) -> bool:
    """True if tokens[f:t] is a parameterised variable `UPPER_IDENT ( ... )`.

    The name (an UPPER_IDENT) must be immediately followed by `(` and the span
    must end with the matching `)`. Whitespace between the name and `(` breaks it
    (stays prose). The inner value is free-text and not validated here.
    """
    if t - f < 3:
        return False
    if tokens[f].kind != "IDENT" or not _is_upper_ident(tokens[f].text):
        return False
    return tokens[f + 1].kind == "LPAREN" and tokens[t - 1].kind == "RPAREN"


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


def _is_chain_op_token(tok: Token) -> bool:
    """Operator tokens recognised by the chain parser: <, >, =, :."""
    if tok.kind == "RUN" and tok.run_char in ("<", ">", "="):
        return True
    if tok.kind == "COLON":
        return True
    return False


def _try_chain(
    line: _LineSlice,
    tokens: List[Token],
    i: int,
    end: int,
) -> Optional[ChainLine]:
    """
    Parse a line as a chain of var|prose elements separated by operator runs.

    Returns None when no operator tokens appear in [i, end) (caller falls
    through to ProseLine).

    An *element* is the (possibly empty) span of tokens between operators.
    After WS-trim, an element classifies as ``var`` if it is exactly one
    UPPER_IDENT token; otherwise ``prose``. Element text is the joined
    source text of the trimmed span.

    An *operator* is a maximal contiguous run of ``RUN(<|>|=)`` and/or
    ``COLON`` tokens. Whitespace breaks an operator.
    """
    op_token_spans: List[Tuple[int, int]] = []
    k = i
    while k < end:
        if _is_chain_op_token(tokens[k]):
            op_from = k
            while k < end and _is_chain_op_token(tokens[k]):
                k += 1
            op_token_spans.append((op_from, k))
        else:
            k += 1

    if not op_token_spans:
        return None

    # Element token-ranges between operators (one more than operators)
    elem_token_spans: List[Tuple[int, int]] = []
    elem_token_spans.append((i, op_token_spans[0][0]))
    for j in range(len(op_token_spans) - 1):
        elem_token_spans.append((op_token_spans[j][1], op_token_spans[j + 1][0]))
    elem_token_spans.append((op_token_spans[-1][1], end))

    elements: List[ChainElement] = []
    for j, (tok_from, tok_to) in enumerate(elem_token_spans):
        f, t = _trim_ws(tokens, tok_from, tok_to)
        if f >= t:
            # Empty element — anchor to surrounding operator boundary
            if j == 0:
                anchor = tokens[op_token_spans[0][0]].start
            else:
                anchor = tokens[op_token_spans[j - 1][1] - 1].end
            elements.append(ChainElement(kind="prose", text="", start=anchor, end=anchor))
            continue

        elem_text = "".join(tok.text for tok in tokens[f:t])
        elem_start = tokens[f].start
        elem_end = tokens[t - 1].end
        if t - f == 1 and tokens[f].kind == "IDENT" and _is_upper_ident(tokens[f].text):
            kind: Literal["var", "prose"] = "var"
        elif _is_var_call(tokens, f, t):
            # Parameterised/valued variable: UPPER_IDENT immediately followed by a
            # parenthesised value, e.g. ACTOR2_PERSONALITY(very shy). The bare name
            # stays the variable identity; the (value) is a free-text argument.
            kind = "var"
        else:
            kind = "prose"
        elements.append(ChainElement(kind=kind, text=elem_text, start=elem_start, end=elem_end))

    operators: List[ChainOperator] = []
    for op_from, op_to in op_token_spans:
        op_text = "".join(tok.text for tok in tokens[op_from:op_to])
        op_char_start = tokens[op_from].start
        op_char_end = tokens[op_to - 1].end
        operators.append(ChainOperator(
            op=op_text,
            run=op_char_end - op_char_start,
            op_start=op_char_start,
            op_end=op_char_end,
        ))

    return ChainLine(
        elements=elements,
        operators=operators,
        start=line.start,
        end=line.end,
    )


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

    # ── colon: LABEL: (line-terminal) ─────────────────────────────────────
    if first.kind == "IDENT" and _is_upper(first.text[0]):
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
                        return HeaderLine(
                            "header", "colon", label, line.start, line.end, line.next,
                            op_start=tokens[k].start, op_end=tokens[k].end,
                        )
                break

    # ── freestanding: single UPPER_IDENT (line-terminal) ──────────────────
    if first.kind == "IDENT" and _is_upper_ident(first.text) and i + 1 == end:
        p = _pat("freestanding")
        label = first.text
        if p["label_min"] <= len(label) <= p["label_max"]:
            return HeaderLine("header", "freestanding", label, line.start, line.end, line.next)

    # ── chain: var|prose elements separated by operator runs ──────────────
    chain = _try_chain(line, tokens, i, end)
    if chain is not None:
        return chain

    return prose


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
                {"kind": "header",  "pattern": "colon", "label": "Scene",
                 "start": 0, "end": 6, "body_start": 7,
                 "op_start": 5, "op_end": 6},
                {"kind": "chain",   "elements": [...], "operators": [...],
                 "start": 10, "end": 25},
                {"kind": "prose",   "text": "some words", "start": 26, "end": 36},
            ]
        }
    """
    toks = lex(text)
    nodes = parse_lines(toks, text)
    return {"lines": [_node_to_dict(n) for n in nodes]}


def _node_to_dict(n: LineNode) -> dict:
    if isinstance(n, HeaderLine):
        out: dict = {
            "kind": "header",
            "pattern": n.pattern,
            "label": n.label,
            "start": n.start,
            "end": n.end,
            "body_start": n.body_start,
        }
        if n.op_start is not None and n.op_end is not None:
            out["op_start"] = n.op_start
            out["op_end"] = n.op_end
        return out
    if isinstance(n, ChainLine):
        return {
            "kind": "chain",
            "elements": [
                {"kind": e.kind, "text": e.text, "start": e.start, "end": e.end}
                for e in n.elements
            ],
            "operators": [
                {"op": o.op, "run": o.run, "op_start": o.op_start, "op_end": o.op_end}
                for o in n.operators
            ],
            "start": n.start,
            "end": n.end,
        }
    return {
        "kind": "prose",
        "text": n.text,
        "start": n.start,
        "end": n.end,
    }
