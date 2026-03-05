from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.block import content_pack_loader as loader


def _write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def _make_pack_dir(pack_name: str = "demo_pack") -> tuple[Path, Path]:
    root = Path.cwd() / ".tmp-test" / "content-pack-loader" / str(uuid4())
    pack_dir = root / pack_name
    pack_dir.mkdir(parents=True, exist_ok=True)
    return root, pack_dir


def test_parse_blocks_requires_block_id() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
blocks:
  - role: action
    text: hello
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="block_id"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_supports_fragments_and_pack_defaults() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
package_name: demo_pkg
defaults:
  style: cinematic
  duration_sec: 2.0
blocks: []
""",
        )
        (pack_dir / "blocks").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "blocks" / "approach.schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: demo_block_01
    role: camera
    category: composition
    text: "POV framing."
""",
        )

        parsed = loader.parse_blocks(pack_dir)
        assert len(parsed) == 1
        assert parsed[0]["block_id"] == "demo_block_01"
        assert parsed[0]["package_name"] == "demo_pkg"
        assert parsed[0]["style"] == "cinematic"
        assert parsed[0]["duration_sec"] == 2.0
        assert parsed[0]["char_count"] == len("POV framing.")
        assert parsed[0]["block_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "demo_pack"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_supports_nested_fragments() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
package_name: demo_pkg
defaults:
  style: photorealistic
blocks: []
""",
        )
        (pack_dir / "blocks" / "wardrobe" / "skirts").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "blocks" / "wardrobe" / "skirts" / "shape.schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: nested_block_01
    role: style
    category: wardrobe
    text: "Skirt shape: A-line."
""",
        )

        parsed = loader.parse_blocks(pack_dir)
        assert [b["block_id"] for b in parsed] == ["nested_block_01"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_supports_schema_only_source() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
package_name: schema_pkg
defaults:
  is_public: true
block_schema:
  id_prefix: core.direction
  category: direction
  capabilities: [direction.axis]
  text_template: "Direction token: {variant}."
  tags:
    modifier_family: direction
    temporal: neutral
  variants:
    - key: in
      tags:
        direction: in
    - key: out
      tags:
        direction: out
""",
        )

        parsed = loader.parse_blocks(pack_dir)
        assert [b["block_id"] for b in parsed] == ["core.direction.in", "core.direction.out"]
        assert parsed[0]["package_name"] == "schema_pkg"
        assert parsed[0]["tags"]["variant"] == "in"
        assert parsed[1]["tags"]["direction"] == "out"
        assert parsed[0]["text"] == "Direction token: in."
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_supports_op_schema_with_refs() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
package_name: op_pkg
block_schema:
  id_prefix: core.camera.motion
  category: camera
  capabilities: [camera.motion]
  op:
    op_id_template: "camera.motion.{variant}"
    modalities: [video]
    refs:
      - key: target
        capability: camera_target
        required: false
    params:
      - key: speed
        type: enum
        enum: [slow, normal, fast]
        default: normal
    default_args:
      speed: normal
  text_template: "Camera motion token: {variant}."
  variants:
    - key: zoom
      op_modalities: [both]
      op_args:
        speed: fast
      tags:
        camera_motion: zoom
    - key: pan
      op_args:
        speed: slow
      tags:
        camera_motion: pan
""",
        )

        parsed = loader.parse_blocks(pack_dir)
        assert [b["block_id"] for b in parsed] == ["core.camera.motion.zoom", "core.camera.motion.pan"]

        zoom = parsed[0]
        assert zoom["tags"]["op_id"] == "camera.motion.zoom"
        assert zoom["tags"]["op_namespace"] == "camera"
        assert zoom["tags"]["op_modalities"] == "image,video"
        assert zoom["tags"]["modality_support"] == "both"
        assert "op:camera.motion.zoom" in zoom["capabilities"]
        assert "ref:camera_target" in zoom["capabilities"]
        assert zoom["block_metadata"]["op"]["op_id"] == "camera.motion.zoom"
        assert zoom["block_metadata"]["op"]["args"]["speed"] == "fast"
        assert zoom["block_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "demo_pack"

        pan = parsed[1]
        assert pan["tags"]["op_id"] == "camera.motion.pan"
        assert pan["tags"]["modality_support"] == "video"
        assert pan["block_metadata"]["op"]["args"]["speed"] == "slow"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_rejects_schema_op_missing_id_source() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
block_schema:
  id_prefix: core.direction
  op: {}
  variants:
    - key: in
      text: "Direction token: in."
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="requires exactly one of op_id or op_id_template"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_rejects_invalid_op_modalities_value() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
block_schema:
  id_prefix: core.direction
  op:
    op_id_template: "direction.axis.{variant}"
  variants:
    - key: in
      op_modalities: [audio]
      text: "Direction token: in."
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="op_modalities\\[0\\] must be one of: image, video, both"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_rejects_legacy_blocks_yaml_source() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "blocks.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: legacy_block_01
    role: action
    text: legacy
""",
        )
        with pytest.raises(loader.ContentPackValidationError, match="unsupported legacy block source"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_rejects_conflicting_package_name_across_sources() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
package_name: pkg_a
blocks: []
""",
        )
        (pack_dir / "blocks").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "blocks" / "part.schema.yaml",
            """
version: "1.0.0"
package_name: pkg_b
blocks:
  - block_id: demo_block_02
    role: camera
    text: "x"
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="package_name.*conflicts"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_enforces_registered_family_axis_required_tags() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: env_missing_crowd
    role: environment
    category: scene_build
    tags:
      sequence_family: public_social_idle
      beat_axis: environment
      loc_type: cafe
    text: "Generic cafe scene."
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="requires tag 'crowd_level'"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_family_validation_accepts_value_aliases() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: activity_alias_value
    role: action
    category: interaction_beat
    tags:
      sequence_family: public_social_idle
      beat_axis: activity
      beat_type: lookback
    text: "Brief glance over the shoulder before moving on."
""",
        )

        parsed = loader.parse_blocks(pack_dir)
        assert [b["block_id"] for b in parsed] == ["activity_alias_value"]
        assert parsed[0]["tags"]["beat_type"] == "lookback"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_blocks_rejects_unknown_sequence_family() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: unknown_family_block
    role: action
    category: interaction_beat
    tags:
      sequence_family: totally_new_family
      beat_axis: activity
    text: "Placeholder."
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="unknown sequence_family 'totally_new_family'"):
            loader.parse_blocks(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_requires_slug() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - name: Missing slug
    slots: []
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="slug"):
            loader.parse_templates(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_supports_fragments() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        (pack_dir / "templates").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "templates" / "a.yaml",
            """
version: "1.0.0"
templates:
  - slug: t-a
    name: A
    slots: []
""",
        )
        _write(
            pack_dir / "templates" / "b.yaml",
            """
version: "1.0.0"
templates:
  - slug: t-b
    name: B
    slots: []
""",
        )

        parsed = loader.parse_templates(pack_dir)
        assert sorted(t["slug"] for t in parsed) == ["t-a", "t-b"]
        for t in parsed:
            assert t["template_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "demo_pack"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_rejects_unknown_sequence_family_in_slot_tags() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: bad-family-template
    name: Bad Family
    slots:
      - label: Movement beat
        role: action
        category: motion_beat
        tags:
          all:
            sequence_family: totally_new_family
            beat_axis: movement
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="unknown value 'totally_new_family'"):
            loader.parse_templates(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_rejects_invalid_family_axis_in_slot_tags() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: bad-axis-template
    name: Bad Axis
    slots:
      - label: Camera framing
        role: camera
        category: composition
        tags:
          all:
            sequence_family: public_social_idle
            beat_axis: stop
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="beat_axis.*invalid value 'stop'.*public_social_idle"):
            loader.parse_templates(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_characters_requires_character_id() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "characters.yaml",
            """
version: "1.0.0"
characters:
  - name: Missing id
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="character_id"):
            loader.parse_characters(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_characters_supports_fragments() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        (pack_dir / "characters").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "characters" / "humans.yaml",
            """
version: "1.0.0"
characters:
  - character_id: c1
    name: One
""",
        )
        _write(
            pack_dir / "characters" / "more.yaml",
            """
version: "1.0.0"
characters:
  - character_id: c2
    name: Two
""",
        )

        parsed = loader.parse_characters(pack_dir)
        assert sorted(c["character_id"] for c in parsed) == ["c1", "c2"]
        for c in parsed:
            assert c["character_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "demo_pack"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_discover_content_packs_detects_directory_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    root, pack_dir = _make_pack_dir()
    try:
        monkeypatch.setattr(loader, "CONTENT_PACKS_DIR", root)
        (pack_dir / "blocks" / "wardrobe").mkdir(parents=True, exist_ok=True)
        _write(
            pack_dir / "blocks" / "wardrobe" / "one.schema.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: b1
    role: action
    text: hi
""",
        )
        assert loader.discover_content_packs() == ["demo_pack"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_discover_content_packs_detects_schema_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    root, pack_dir = _make_pack_dir()
    try:
        monkeypatch.setattr(loader, "CONTENT_PACKS_DIR", root)
        _write(
            pack_dir / "schema.yaml",
            """
version: "1.0.0"
block_schema:
  id_prefix: core.camera.motion
  category: camera
  variants:
    - key: zoom
      text: Camera motion token: zoom.
""",
        )
        assert loader.discover_content_packs() == ["demo_pack"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_discover_content_packs_ignores_legacy_blocks_yaml(monkeypatch: pytest.MonkeyPatch) -> None:
    root, pack_dir = _make_pack_dir()
    try:
        monkeypatch.setattr(loader, "CONTENT_PACKS_DIR", root)
        _write(
            pack_dir / "blocks.yaml",
            """
version: "1.0.0"
blocks:
  - block_id: b_legacy
    role: action
    text: hi
""",
        )
        assert loader.discover_content_packs() == []
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_stamps_slot_schema_and_pack_source() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: demo-template
    name: Demo
    slots:
      - label: One
        role: action
""",
        )

        parsed = loader.parse_templates(pack_dir)
        assert len(parsed) == 1
        metadata = parsed[0]["template_metadata"]
        assert metadata["slot_schema_version"] == loader.TEMPLATE_SLOT_SCHEMA_VERSION
        assert metadata[loader.CONTENT_PACK_SOURCE_KEY] == "demo_pack"
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_rejects_non_canonical_slot_fields() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: bad-template
    name: Bad
    slots:
      - slotIndex: 1
        label: Should fail
        role: action
""",
        )

        with pytest.raises(loader.ContentPackValidationError, match="slots invalid"):
            loader.parse_templates(pack_dir)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_migrates_legacy_slot_schema_and_stamps_latest_version() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: migrated-template
    name: Migrated
    template_metadata:
      slot_schema_version: 1
    slots:
      - label: Camera
        role: camera
        tag_constraints:
          camera_angle:
            - low
            - dutch
""",
        )

        parsed = loader.parse_templates(pack_dir)

        assert len(parsed) == 1
        slot = parsed[0]["slots"][0]
        assert "tag_constraints" not in slot
        assert slot["tags"] == {"all": {"camera_angle": ["low", "dutch"]}}
        assert parsed[0]["template_metadata"]["slot_schema_version"] == loader.TEMPLATE_SLOT_SCHEMA_VERSION
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_accepts_authoring_alias_tag_groups() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: alias-tags-template
    name: Alias Tags
    slots:
      - label: Camera
        role: camera
        tags:
          any_of:
            camera_angle:
              - low
              - dutch
          none_of:
            atmosphere:
              - surveillance
""",
        )

        parsed = loader.parse_templates(pack_dir)

        slot = parsed[0]["slots"][0]
        assert slot["tags"] == {
            "any": {"camera_angle": ["low", "dutch"]},
            "not": {"atmosphere": ["surveillance"]},
        }
        assert parsed[0]["template_metadata"]["slot_schema_version"] == loader.TEMPLATE_SLOT_SCHEMA_VERSION
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_parse_templates_accepts_preferences_and_selection_config() -> None:
    root, pack_dir = _make_pack_dir()
    try:
        _write(
            pack_dir / "templates.yaml",
            """
version: "1.0.0"
templates:
  - slug: selector-config-template
    name: Selector Config
    slots:
      - label: Camera
        role: camera
        preferences:
          boost_tags:
            perspective: upward
          diversity_keys: [camera_angle, perspective]
          novelty_weight: 0.6
        selection_strategy: llm_rerank
        selection_config:
          top_k: 12
          timeout_ms: 1200
          fallback_strategy: weighted_tags
          model: gpt-5-mini
          weights:
            rating: 0.2
            diversity: 0.5
""",
        )

        parsed = loader.parse_templates(pack_dir)

        slot = parsed[0]["slots"][0]
        assert slot["preferences"] == {
            "boost_tags": {"perspective": "upward"},
            "diversity_keys": ["camera_angle", "perspective"],
            "novelty_weight": 0.6,
        }
        assert slot["selection_strategy"] == "llm_rerank"
        assert slot["selection_config"] == {
            "top_k": 12,
            "timeout_ms": 1200,
            "fallback_strategy": "weighted_tags",
            "model": "gpt-5-mini",
            "weights": {"rating": 0.2, "diversity": 0.5},
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


@pytest.mark.asyncio
async def test_load_pack_prune_mode_tracks_pruned_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    root, pack_dir = _make_pack_dir()
    try:
        pack_name = pack_dir.name

        monkeypatch.setattr(loader, "CONTENT_PACKS_DIR", root)
        monkeypatch.setattr(
            loader,
            "parse_blocks",
            lambda _content_dir: [{"block_id": "b1"}],
        )
        monkeypatch.setattr(
            loader,
            "parse_templates",
            lambda _content_dir: [{"slug": "t1"}],
        )
        monkeypatch.setattr(
            loader,
            "parse_characters",
            lambda _content_dir: [{"character_id": "c1"}],
        )

        async def _fake_upsert(*_args, **_kwargs):
            return {"created": 1, "updated": 0, "skipped": 0}

        pruned_by_lookup = {"block_id": 2, "slug": 3, "character_id": 1}

        async def _fake_prune(
            *_args,
            lookup_field: str,
            metadata_field: str,
            source_pack_name: str,
            incoming_lookup_values,
            **_kwargs,
        ):
            assert source_pack_name == pack_name
            assert incoming_lookup_values
            assert metadata_field in {"tags", "template_metadata", "character_metadata"}
            return pruned_by_lookup[lookup_field]

        monkeypatch.setattr(loader, "_upsert_entities", _fake_upsert)
        monkeypatch.setattr(loader, "_prune_missing_entities", _fake_prune)

        class _DummyBlocksDB:
            async def commit(self) -> None:
                return None

        @asynccontextmanager
        async def _fake_blocks_session():
            yield _DummyBlocksDB()

        monkeypatch.setattr(loader, "get_async_blocks_session", _fake_blocks_session)

        class _DummyDB:
            async def commit(self) -> None:
                return None

        stats = await loader.load_pack(
            _DummyDB(),
            pack_name,
            force=True,
            prune_missing=True,
        )

        assert stats["blocks_pruned"] == 2
        assert stats["templates_pruned"] == 3
        assert stats["characters_pruned"] == 1
    finally:
        shutil.rmtree(root, ignore_errors=True)


@pytest.mark.asyncio
async def test_upsert_entities_rehomes_content_pack_rows_without_force(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Column:
        def __eq__(self, _other):
            return ("eq", _other)

    class _Model:
        __name__ = "PromptBlock"
        block_id = _Column()

    class _Query:
        def where(self, _expr):
            return self

    class _Result:
        def __init__(self, row):
            self._row = row

        def scalar_one_or_none(self):
            return self._row

    row = SimpleNamespace(
        block_id="ie_lock_pose",
        package_name="image_edit_scenes",
        block_metadata={loader.CONTENT_PACK_SOURCE_KEY: "image_edit_scenes"},
        updated_at=None,
    )

    class _DummyDB:
        def __init__(self, existing_row):
            self._row = existing_row
            self.add_called = False

        async def execute(self, _query):
            return _Result(self._row)

        def add(self, _entity):
            self.add_called = True

    monkeypatch.setattr(loader, "select", lambda _model: _Query())

    db = _DummyDB(row)
    now = datetime.now(timezone.utc)
    stats = await loader._upsert_entities(
        db,
        _Model,
        [{
            "block_id": "ie_lock_pose",
            "package_name": "shared",
            "block_metadata": {loader.CONTENT_PACK_SOURCE_KEY: "shared"},
        }],
        lookup_field="block_id",
        fields={"package_name": None, "block_metadata": {}},
        create_only={},
        force=False,
        metadata_field="block_metadata",
        now=now,
        pack_name="shared",
    )

    assert stats == {"created": 0, "updated": 1, "skipped": 0}
    assert db.add_called is False
    assert row.package_name == "shared"
    assert row.block_metadata[loader.CONTENT_PACK_SOURCE_KEY] == "shared"
    assert row.updated_at == now


@pytest.mark.asyncio
async def test_upsert_entities_rehome_can_be_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Column:
        def __eq__(self, _other):
            return ("eq", _other)

    class _Model:
        __name__ = "BlockPrimitive"
        block_id = _Column()

    class _Query:
        def where(self, _expr):
            return self

    class _Result:
        def __init__(self, row):
            self._row = row

        def scalar_one_or_none(self):
            return self._row

    row = SimpleNamespace(
        block_id="shared.pose.lock",
        tags={loader.CONTENT_PACK_SOURCE_KEY: "old_pack"},
        updated_at=None,
    )

    class _DummyDB:
        def __init__(self, existing_row):
            self._row = existing_row

        async def execute(self, _query):
            return _Result(self._row)

        def add(self, _entity):
            return None

    monkeypatch.setattr(loader, "select", lambda _model: _Query())

    db = _DummyDB(row)
    now = datetime.now(timezone.utc)
    with pytest.raises(loader.ContentPackValidationError, match="Use namespaced block_id"):
        await loader._upsert_entities(
            db,
            _Model,
            [{
                "block_id": "shared.pose.lock",
                "tags": {loader.CONTENT_PACK_SOURCE_KEY: "new_pack"},
            }],
            lookup_field="block_id",
            fields={"tags": {}},
            create_only={},
            force=False,
            metadata_field="tags",
            now=now,
            pack_name="new_pack",
            allow_rehome=False,
        )
