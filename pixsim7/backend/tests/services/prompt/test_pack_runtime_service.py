from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from pixsim7.backend.main.services.prompt.packs.runtime_service import (
    PromptPackRuntimeService,
    _read_active_version_ids,
)


class _DummySession:
    async def get(self, *_args, **_kwargs):
        return None

    async def execute(self, *_args, **_kwargs):
        raise AssertionError("execute should not be called in this test")


def test_compile_version_blocks_to_primitives_stamps_owner_scope_and_runtime_ids() -> None:
    service = PromptPackRuntimeService(_DummySession())
    draft = SimpleNamespace(
        id=uuid4(),
        owner_user_id=7,
        namespace="user.7",
        pack_slug="starter-pack",
    )
    version = SimpleNamespace(
        id=uuid4(),
        compiled_schema_yaml=(
            "version: 1.0.0\n"
            "package_name: demo_pack\n"
            "blocks:\n"
            "  - id: camera_motion\n"
            "    block_schema:\n"
            "      id_prefix: camera.motion\n"
            "      category: camera\n"
            "      role: camera\n"
            "      text_template: 'Camera motion {variant}.'\n"
            "      variants:\n"
            "        - key: pan\n"
        ),
        compiled_blocks_json=[],
    )

    primitives = service._compile_version_blocks_to_primitives(
        user_id=7,
        draft=draft,
        version=version,
        source_pack="demo_pack",
    )

    assert len(primitives) == 1
    primitive = primitives[0]
    assert primitive["block_id"].startswith("user.7.starter-pack.")
    assert primitive["block_id"].endswith("camera.motion.pan")
    assert primitive["source"] == "user"
    assert primitive["is_public"] is False
    assert primitive["tags"]["owner_user_id"] == "7"
    assert primitive["tags"]["source_pack"] == "demo_pack"
    assert primitive["tags"]["prompt_pack_version_id"] == str(version.id)


def test_read_active_version_ids_deduplicates_and_ignores_invalid_values() -> None:
    valid_a = str(uuid4())
    valid_b = str(uuid4())
    prefs = {
        "prompt_packs": {
            "active_version_ids": [valid_a, "not-a-uuid", valid_b, valid_a],
        }
    }

    result = _read_active_version_ids(prefs)

    assert result == [valid_a, valid_b]
