"""Builtin prompt tool handler tests."""
from __future__ import annotations

import pytest

import pixsim7.backend.main.services.prompt.tools.builtins as builtins_module
from pixsim7.backend.main.services.prompt.latin_enhancer import (
    ComposeResponse,
    ComposedVariant,
)
from pixsim7.backend.main.services.prompt.tools.builtins import (
    execute_builtin_prompt_tool,
    get_builtin_prompt_tool,
)


@pytest.mark.asyncio
async def test_masked_transform_emits_guidance_overlay_and_assets_patch() -> None:
    preset = get_builtin_prompt_tool("edit/masked-transform")
    assert preset is not None

    result = await execute_builtin_prompt_tool(
        preset,
        prompt_text="Portrait of a person standing in a studio.",
        params={
            "instruction": "change the jacket to matte red leather",
            "strength": 8,
            "preserve_identity": True,
            "preserve_background": True,
        },
        run_context={
            "primary_asset_id": 101,
            "mask_asset": {"asset_id": 202},
            "mask_regions": [{"id": "region-1", "label": "Jacket"}],
        },
    )

    assert "Masked edit guidance:" in result["prompt_text"]
    assert "change the jacket to matte red leather" in result["prompt_text"]
    assert result["warnings"] == []
    assert result["provenance"] == {"model_id": "builtin/masked-transform-v1"}

    guidance_patch = result["guidance_patch"]["masked_transform"]
    assert guidance_patch["instruction"] == "change the jacket to matte red leather"
    assert guidance_patch["strength"] == 8
    assert guidance_patch["preserve_identity"] is True
    assert guidance_patch["primary_asset_id"] == 101
    assert guidance_patch["mask"] == {"format": "asset_ref", "data": "asset:202"}

    assert result["composition_assets_patch"] == [
        {
            "asset_id": 101,
            "operation": "masked_transform_source",
            "role": "primary",
        },
        {
            "asset_id": 202,
            "operation": "masked_transform_mask",
            "role": "mask",
        },
    ]
    assert result["block_overlay"] == [
        {
            "role": "instruction",
            "text": "Masked transform: change the jacket to matte red leather",
            "preset_id": "edit/masked-transform",
            "primitive_tags": [
                "edit.masked_transform",
                "intent.modify_region",
            ],
        }
    ]


@pytest.mark.asyncio
async def test_masked_transform_warns_when_mask_signal_missing() -> None:
    preset = get_builtin_prompt_tool("edit/masked-transform")
    assert preset is not None

    result = await execute_builtin_prompt_tool(
        preset,
        prompt_text="",
        params={"instruction": "fix hand anatomy", "strength": 6},
        run_context={"primary_asset_id": 55},
    )

    guidance_patch = result["guidance_patch"]["masked_transform"]
    assert "mask" not in guidance_patch
    assert "mask_regions" not in guidance_patch
    assert result["composition_assets_patch"] == [
        {
            "asset_id": 55,
            "operation": "masked_transform_source",
            "role": "primary",
        }
    ]
    assert "Input prompt was empty; emitted masked-edit guidance only." in result["warnings"]
    assert (
        "No mask signal found in run_context; transform may apply to the full frame."
        in result["warnings"]
    )


@pytest.mark.asyncio
async def test_change_clothes_builtin_uses_masked_transform_contract() -> None:
    preset = get_builtin_prompt_tool("edit/change-clothes")
    assert preset is not None

    result = await execute_builtin_prompt_tool(
        preset,
        prompt_text="Street portrait, full body.",
        params={
            "target_garment": "jacket",
            "new_clothes": "bomber jacket",
            "color": "black",
            "material": "leather",
        },
        run_context={
            "primary_asset_id": 11,
            "mask_asset": {"asset_id": 12},
        },
    )

    assert result["provenance"] == {"model_id": "builtin/change-clothes-v1"}
    overlay = result["block_overlay"][0]
    assert overlay["preset_id"] == "edit/change-clothes"
    assert "edit.change_clothes" in overlay["primitive_tags"]
    assert result["guidance_patch"]["masked_transform"]["mask"] == {
        "format": "asset_ref",
        "data": "asset:12",
    }


def test_fix_anatomy_and_remove_object_builtins_exist() -> None:
    assert get_builtin_prompt_tool("compose/latin-enhancer") is not None
    assert get_builtin_prompt_tool("edit/fix-anatomy") is not None
    assert get_builtin_prompt_tool("edit/remove-object") is not None


@pytest.mark.asyncio
async def test_latin_enhancer_builtin_uses_composer_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    preset = get_builtin_prompt_tool("compose/latin-enhancer")
    assert preset is not None

    class _FakeBlocksCtx:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def _compose_stub(_db, req):
        assert req.length == "short"
        assert req.register == "mixed"
        assert req.intensity == "moderate"
        assert req.include_connectors is True
        assert req.domains == ("touch", "oral")
        assert req.seed == 1234
        return ComposeResponse(
            text="resistentia carnis sub digitis palpatur.",
            variants=(
                ComposedVariant(
                    block_id="latin.touch.hand_gluteal.resistentia_carnis_sub_digitis",
                    text="resistentia carnis sub digitis palpatur",
                    register="technical",
                    intensity="moderate",
                    motion_type="press",
                    applies_to="flesh_general",
                    latin_form="predication",
                    domains=("touch", "gluteal", "hand_contact"),
                ),
            ),
            pool_size=42,
            intensity_curve=("moderate",),
        )

    monkeypatch.setattr(builtins_module, "get_async_blocks_session", lambda: _FakeBlocksCtx())
    monkeypatch.setattr(builtins_module, "compose_latin_enhancer", _compose_stub)

    result = await execute_builtin_prompt_tool(
        preset,
        prompt_text="Base prompt.",
        params={
            "length": "short",
            "register": "mixed",
            "intensity": "moderate",
            "include_connectors": True,
            "seed": 1234,
            "domains": ["touch", "oral"],
        },
        run_context={},
    )

    assert result["prompt_text"] == "Base prompt.\n\nresistentia carnis sub digitis palpatur."
    assert result["provenance"] == {"model_id": "builtin/latin-enhancer-v1"}
    assert result["guidance_patch"]["latin_enhancer"]["pool_size"] == 42
    assert result["guidance_patch"]["latin_enhancer"]["intensity_curve"] == ["moderate"]
    assert result["block_overlay"][0]["block_id"] == "latin.touch.hand_gluteal.resistentia_carnis_sub_digitis"
