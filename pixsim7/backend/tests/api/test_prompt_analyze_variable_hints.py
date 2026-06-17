from __future__ import annotations

from pixsim7.backend.main.api.v1.prompts.operations import (
    PromptTokenChainElement,
    PromptTokenChainLine,
    PromptTokenChainOperator,
    PromptTokenProseLine,
    PromptTokensPayload,
    _build_prompt_variable_hints,
    _extract_detected_prompt_variables,
)
from pixsim7.backend.main.services.prompt.parser.tokenizer import tokenize


def test_tokens_payload_accepts_value_kind_elements() -> None:
    """Regression: the tokenizer emits chain elements of kind 'value' for bare
    `( ... )` operands, but the PromptTokensPayload response model used to allow
    only 'var'/'prose'. Constructing the payload from such tokens raised a
    pydantic ValidationError, 500-ing /prompts/analyze for any prompt with a
    value-group (no structure + no analysis in the composer / inspector).
    The seam — tokenizer dict -> PromptTokensPayload — must round-trip."""
    raw = tokenize("ACTOR1 = (a number of)")
    kinds = [e["kind"] for line in raw["lines"] if line["kind"] == "chain" for e in line["elements"]]
    assert "value" in kinds, f"expected a 'value' element from the tokenizer, got {kinds}"

    # This is exactly what analyze_prompt() does with the tokenizer output.
    payload = PromptTokensPayload(**raw)
    payload_kinds = [
        e.kind for line in payload.lines if isinstance(line, PromptTokenChainLine) for e in line.elements
    ]
    assert "value" in payload_kinds


def test_chain_element_accepts_value_kind_directly() -> None:
    """The 'value' literal must be a valid kind on the element model itself."""
    elem = PromptTokenChainElement(kind="value", text="(a number of)", start=9, end=22)
    assert elem.kind == "value"


def test_extract_detected_prompt_variables_from_chain_tokens() -> None:
    tokens = PromptTokensPayload(
        lines=[
            PromptTokenChainLine(
                elements=[
                    PromptTokenChainElement(kind="var", text="ACTOR1", start=0, end=6),
                    PromptTokenChainElement(kind="prose", text="running fast", start=9, end=21),
                    PromptTokenChainElement(kind="var", text="GOAL", start=25, end=29),
                    PromptTokenChainElement(kind="var", text="ACTOR1", start=33, end=39),
                ],
                operators=[
                    PromptTokenChainOperator(op="===>", run=4, op_start=6, op_end=10),
                    PromptTokenChainOperator(op="<===", run=4, op_start=21, op_end=25),
                    PromptTokenChainOperator(op="=", run=1, op_start=29, op_end=30),
                ],
                start=0,
                end=39,
            ),
            PromptTokenProseLine(kind="prose", text="plain text", start=40, end=50),
        ]
    )

    detected = _extract_detected_prompt_variables(tokens)
    assert detected == ["ACTOR1", "GOAL"]


def test_build_prompt_variable_hints_marks_unsaved_detected_names() -> None:
    tokens = PromptTokensPayload(
        lines=[
            PromptTokenChainLine(
                elements=[
                    PromptTokenChainElement(kind="var", text="ACTOR1", start=0, end=6),
                    PromptTokenChainElement(kind="var", text="GOAL", start=10, end=14),
                ],
                operators=[PromptTokenChainOperator(op="=", run=1, op_start=7, op_end=8)],
                start=0,
                end=14,
            )
        ]
    )

    hints = _build_prompt_variable_hints(saved_variable_names=["GOAL", "SCENE"], tokens=tokens)
    assert hints["saved"] == ["GOAL", "SCENE"]
    assert hints["detected"] == ["ACTOR1", "GOAL"]
    assert hints["unsaved_detected"] == ["ACTOR1"]

