from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.block_primitive_query import (
    build_block_primitive_query,
)


def test_query_includes_private_scope_when_owner_and_active_source_packs_present() -> None:
    query = build_block_primitive_query(
        category="camera",
        is_public=True,
        private_owner_user_id=7,
        private_source_packs=["demo_pack"],
    )
    compiled = query.compile()
    sql = str(query)
    param_values = {str(value) for value in compiled.params.values() if value is not None}

    assert " OR " in sql
    assert "7" in param_values
    assert any("demo_pack" in value for value in param_values)


def test_query_falls_back_to_public_only_when_no_active_source_packs() -> None:
    query = build_block_primitive_query(
        category="camera",
        is_public=True,
        private_owner_user_id=7,
        private_source_packs=[],
    )
    sql = str(query)

    assert " OR " not in sql
    assert "block_primitives.is_public IS true" in sql
