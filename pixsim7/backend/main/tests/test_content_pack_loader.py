from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
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
            pack_dir / "blocks.yaml",
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
            assert metadata_field in {"block_metadata", "template_metadata", "character_metadata"}
            return pruned_by_lookup[lookup_field]

        monkeypatch.setattr(loader, "_upsert_entities", _fake_upsert)
        monkeypatch.setattr(loader, "_prune_missing_entities", _fake_prune)

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
