"""Tests for the /prompts/resolve-preview endpoint (whole + per-variable)."""
import asyncio

from pixsim7.backend.main.api.v1.prompts.operations import (
    ResolvePreviewRequest,
    resolve_prompt_preview,
)


def _run(req: ResolvePreviewRequest):
    return asyncio.run(resolve_prompt_preview(req))


def test_whole_resolution():
    res = _run(ResolvePreviewRequest(text="ACTOR1 in a field", values={"ACTOR1": "a tall woman"}))
    assert res.resolved == "a tall woman in a field"


def test_per_variable_breakdown():
    res = _run(
        ResolvePreviewRequest(
            text="ACTOR1 near ACTOR2",
            values={"ACTOR1": "a tall woman", "ACTOR2": "a guard"},
        )
    )
    by_name = {v.name: v.resolved for v in res.variables}
    assert by_name["ACTOR1"] == "a tall woman"
    assert by_name["ACTOR2"] == "a guard"


def test_breakdown_includes_transform():
    res = _run(
        ResolvePreviewRequest(
            text="X", values={"X": "cat"}, transforms={"X": "spaced:_"}
        )
    )
    assert res.variables[0].name == "X"
    assert res.variables[0].resolved == "c_a_t"


def test_no_op_returns_null_resolved_but_no_vars():
    res = _run(ResolvePreviewRequest(text="just prose", values={}))
    assert res.resolved is None
    assert res.variables == []
