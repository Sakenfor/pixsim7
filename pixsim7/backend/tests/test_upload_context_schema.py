from pixsim7.backend.main.shared.upload_context_schema import normalize_upload_context


def test_mask_draw_context_preserves_source_asset_id_and_mask_type() -> None:
    normalized = normalize_upload_context(
        "mask_draw",
        {
            "client": "web_app",
            "feature": "mask_overlay",
            "source": "asset_viewer",
            "source_asset_id": "123",
            "mask_type": "inpaint",
            "extra_field": "ignored",
        },
    )

    assert normalized["client"] == "web_app"
    assert normalized["feature"] == "mask_overlay"
    assert normalized["source"] == "asset_viewer"
    assert normalized["source_asset_id"] == 123
    assert normalized["mask_type"] == "inpaint"
    assert "extra_field" not in normalized
