from __future__ import annotations

from pixsim7.backend.main.services.prompt.parser.offsets import (
    build_utf16_prefix,
    has_astral,
    remap_candidate_positions,
)


def test_has_astral() -> None:
    assert not has_astral("plain ascii café ümlaut")  # accents are BMP
    assert has_astral("emoji 😀 here")


def test_build_utf16_prefix_bmp_is_identity() -> None:
    text = "ACTOR1 = hi"
    assert build_utf16_prefix(text) == list(range(len(text) + 1))


def test_build_utf16_prefix_counts_astral_as_two_units() -> None:
    # "a😀b": a(+1) 😀(+2) b(+1)
    assert build_utf16_prefix("a😀b") == [0, 1, 3, 4]


def test_remap_candidate_positions_bmp_is_noop() -> None:
    cands = [{"text": "hi", "start_pos": 7, "end_pos": 9}]
    remap_candidate_positions(cands, "ACTOR1 = hi")
    assert (cands[0]["start_pos"], cands[0]["end_pos"]) == (7, 9)


def test_remap_candidate_positions_shifts_after_astral() -> None:
    # "😀 cat": cat at code points 2..5, UTF-16 3..6 (😀 = 2 units).
    text = "😀 cat"
    cands = [{"text": "cat", "start_pos": 2, "end_pos": 5}]
    remap_candidate_positions(cands, text)
    assert (cands[0]["start_pos"], cands[0]["end_pos"]) == (3, 6)
    # The UTF-16 offsets must slice back to the candidate text.
    enc = text.encode("utf-16-le")
    assert enc[2 * 3 : 2 * 6].decode("utf-16-le") == "cat"


def test_remap_candidate_positions_passes_through_none() -> None:
    # LLM candidates carry no offsets.
    cands = [{"text": "cat", "start_pos": None, "end_pos": None}]
    remap_candidate_positions(cands, "😀 cat")
    assert cands[0]["start_pos"] is None and cands[0]["end_pos"] is None
