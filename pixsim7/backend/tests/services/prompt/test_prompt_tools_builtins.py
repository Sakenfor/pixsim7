"""Builtin prompt tool handler tests."""
from __future__ import annotations

from pixsim7.backend.main.services.prompt.tools.builtins import (
    execute_builtin_prompt_tool,
    get_builtin_prompt_tool,
)


def test_masked_transform_emits_guidance_overlay_and_assets_patch() -> None:
    preset = get_builtin_prompt_tool("edit/masked-transform")
    assert preset is not None

    result = execute_builtin_prompt_tool(
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


def test_masked_transform_warns_when_mask_signal_missing() -> None:
    preset = get_builtin_prompt_tool("edit/masked-transform")
    assert preset is not None

    result = execute_builtin_prompt_tool(
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


def test_change_clothes_builtin_uses_masked_transform_contract() -> None:
    preset = get_builtin_prompt_tool("edit/change-clothes")
    assert preset is not None

    result = execute_builtin_prompt_tool(
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
    assert get_builtin_prompt_tool("edit/fix-anatomy") is not None
    assert get_builtin_prompt_tool("edit/remove-object") is not None
