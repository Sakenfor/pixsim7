from __future__ import annotations

from pixsim7.backend.main.services.prompt.parser.tokenizer import tokenize

# The public tokenize() output uses UTF-16 code-unit offsets so it matches the TS
# tokenizer (packages/core/prompt/src/tokenizer.ts) and CodeMirror document
# positions. The Python<->TS parity corpus enforces this end-to-end; these tests
# pin the Python side directly (and guard the code-point -> UTF-16 remap).


def test_bmp_offsets_are_unchanged() -> None:
    # No astral chars: code-point and UTF-16 frames coincide, remap is a no-op.
    line = tokenize("ACTOR1 = hi")["lines"][0]
    assert line["kind"] == "chain"
    op = line["operators"][0]
    assert (op["op_start"], op["op_end"]) == (7, 8)


def test_astral_operator_offset_is_utf16() -> None:
    # 🎬 (U+1F3AC) is one code point but two UTF-16 units. The `=` is at code-point
    # index 9, UTF-16 index 10 — tokenize() must emit the UTF-16 index.
    line = tokenize("🎬 ACTOR1 = hi")["lines"][0]
    op = line["operators"][0]
    assert (op["op_start"], op["op_end"]) == (10, 11)
    last = line["elements"][-1]
    assert last["text"] == "hi"
    assert last["start"] == 12  # "🎬 ACTOR1 = " is 12 UTF-16 units


def test_astral_prose_line_end_is_utf16_length() -> None:
    line = tokenize("the 🎬 scene")["lines"][0]
    assert line["kind"] == "prose"
    assert line["end"] == 12  # 11 code points, 12 UTF-16 units


def test_multiple_astral_chars_accumulate() -> None:
    # Two emoji before the operator shift it by two extra UTF-16 units.
    line = tokenize("A 😀😀 = b")["lines"][0]
    op = line["operators"][0]
    # code points: A(0) ' '(1) 😀(2) 😀(3) ' '(4) =(5) -> '=' at cp 5, utf16 7
    assert op["op_start"] == 7
