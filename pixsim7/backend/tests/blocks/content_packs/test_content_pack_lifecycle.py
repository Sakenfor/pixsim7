"""Content pack lifecycle tests: fixture parsing, inventory classification, adopt, purge."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.services.prompt.block import content_pack_loader as loader


FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "fixtures" / "content_packs"


# ── Mock helpers ──────────────────────────────────────────────────────────


class _MockScalars:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return self._rows


class _MockExecuteResult:
    """Mimics SQLAlchemy CursorResult: supports both .all() and .scalars().all()."""

    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return self._rows

    def scalars(self):
        return _MockScalars(self._rows)


class _MockSession:
    """Lightweight async session double.  Yields pre-loaded result sets in call order."""

    def __init__(self, *result_sets):
        self._results = list(result_sets)
        self._idx = 0
        self.committed = False

    async def execute(self, _query):
        if self._idx < len(self._results):
            rows = self._results[self._idx]
            self._idx += 1
            return _MockExecuteResult(rows)
        return _MockExecuteResult([])

    async def commit(self):
        self.committed = True


def _blocks_ctx(*result_sets):
    """Return an async-context-manager factory that yields a _MockSession for the blocks DB."""

    @asynccontextmanager
    async def _ctx():
        session = _MockSession(*result_sets)
        yield session
        _ctx._session = session  # expose for assertions

    _ctx._session = None
    return _ctx


def _make_block(block_id, pack_name, *, source_pack=None):
    tags = {loader.CONTENT_PACK_SOURCE_KEY: pack_name}
    if source_pack is not None:
        tags["source_pack"] = source_pack
    return SimpleNamespace(block_id=block_id, tags=tags, updated_at=None)


def _make_template(slug, pack_name, *, package_name=None, slots=None):
    return SimpleNamespace(
        slug=slug,
        template_metadata={
            loader.CONTENT_PACK_SOURCE_KEY: pack_name,
            "source": {"pack": pack_name},
        },
        package_name=package_name,
        slots=slots or [],
        updated_at=None,
    )


def _make_character(character_id, pack_name):
    return SimpleNamespace(
        character_id=character_id,
        character_metadata={
            loader.CONTENT_PACK_SOURCE_KEY: pack_name,
            "source": {"pack": pack_name},
        },
        updated_at=None,
    )


# ── 1. Fixture pack parsing ──────────────────────────────────────────────


def test_fixture_core_camera_parses_blocks():
    blocks = loader.parse_blocks(FIXTURES_DIR / "core_camera_fixture")
    assert len(blocks) == 3
    ids = {b["block_id"] for b in blocks}
    assert ids == {
        "fixture.camera.low_angle",
        "fixture.camera.high_angle",
        "fixture.camera.eye_level",
    }
    for b in blocks:
        assert b["block_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "core_camera_fixture"
        assert b["package_name"] == "core_camera_fixture"


def test_fixture_core_camera_parses_templates():
    templates = loader.parse_templates(FIXTURES_DIR / "core_camera_fixture")
    assert len(templates) == 1
    tpl = templates[0]
    assert tpl["slug"] == "fixture-camera-angle-template"
    assert tpl["package_name"] == "core_camera_fixture"
    assert tpl["template_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "core_camera_fixture"
    assert len(tpl["slots"]) == 2


def test_fixture_core_camera_parses_characters():
    characters = loader.parse_characters(FIXTURES_DIR / "core_camera_fixture")
    assert len(characters) == 1
    char = characters[0]
    assert char["character_id"] == "fixture.test_character"
    assert char["name"] == "Test Character"
    assert char["character_metadata"][loader.CONTENT_PACK_SOURCE_KEY] == "core_camera_fixture"


def test_fixture_disk_only_parses_blocks():
    blocks = loader.parse_blocks(FIXTURES_DIR / "disk_only_fixture")
    assert len(blocks) == 2
    ids = {b["block_id"] for b in blocks}
    assert "fixture.disk_only.block_01" in ids
    assert "fixture.disk_only.block_02" in ids


def test_fixture_core_camera_manifest_parses():
    manifests = loader.parse_manifests(FIXTURES_DIR / "core_camera_fixture", pack_name="core_camera_fixture")
    assert len(manifests) == 1
    m = manifests[0]
    assert m["id"] == "core-camera-fixture"
    assert m["pack_name"] == "core_camera_fixture"
    assert m["matrix_presets"][0]["label"] == "Camera Angles"
    assert m["matrix_presets"][0]["query"]["row_key"] == "tag:vertical_angle"


# ── 2. Adopt validation ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adopt_rejects_source_equals_target(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["core_camera_fixture"])
    with pytest.raises(ValueError, match="must differ"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="core_camera_fixture",
            target_pack_name="core_camera_fixture",
        )


@pytest.mark.asyncio
async def test_adopt_rejects_empty_source():
    with pytest.raises(ValueError, match="source_pack_name is required"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="   ",
            target_pack_name="any_pack",
        )


@pytest.mark.asyncio
async def test_adopt_rejects_empty_target():
    with pytest.raises(ValueError, match="target_pack_name is required"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="any_pack",
            target_pack_name="   ",
        )


@pytest.mark.asyncio
async def test_adopt_rejects_target_not_on_disk(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["core_camera_fixture"])
    with pytest.raises(ValueError, match="does not exist on disk"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="legacy_orphan",
            target_pack_name="nonexistent_pack",
        )


@pytest.mark.asyncio
async def test_adopt_rejects_source_not_orphaned(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["target_pack"])

    async def _inventory(_db):
        return {
            "packs": {
                "active_pack": {"status": "active", "blocks": 3, "templates": 1, "characters": 0},
            }
        }

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    with pytest.raises(ValueError, match="not orphaned"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="active_pack",
            target_pack_name="target_pack",
        )


@pytest.mark.asyncio
async def test_adopt_rejects_source_not_in_inventory(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["target_pack"])

    async def _inventory(_db):
        return {"packs": {}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    with pytest.raises(ValueError, match="not found in inventory"):
        await loader.adopt_orphaned_pack(
            _MockSession(),
            source_pack_name="ghost_pack",
            target_pack_name="target_pack",
        )


# ── 3. Adopt success — full metadata rewrite ─────────────────────────────


@pytest.mark.asyncio
async def test_adopt_rewrites_block_primitive_tags(monkeypatch):
    source, target = "legacy_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 2, "templates": 0, "characters": 0}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    block1 = _make_block("orphan.block.1", source, source_pack=source)
    block2 = _make_block("orphan.block.2", source)  # no source_pack tag

    ctx = _blocks_ctx([block1, block2])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    # main DB: no templates, no characters
    main_db = _MockSession([], [])

    result = await loader.adopt_orphaned_pack(main_db, source, target)

    assert result["blocks_adopted"] == 2
    assert result["block_source_pack_renamed"] == 1  # only block1 had source_pack

    assert block1.tags[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert block1.tags["source_pack"] == target
    assert block2.tags[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert "source_pack" not in block2.tags


@pytest.mark.asyncio
async def test_adopt_rewrites_template_metadata_and_packages(monkeypatch):
    source, target = "legacy_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 0, "templates": 1, "characters": 0}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    ctx = _blocks_ctx([])  # no blocks
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    tpl = _make_template(
        "orphan-tpl-1",
        source,
        package_name=source,
        slots=[
            {"label": "Slot A", "package_name": source},
            {"label": "Slot B", "package_name": "other_pack"},
            {"label": "Slot C"},  # no package_name
        ],
    )

    main_db = _MockSession([tpl], [])  # templates then characters

    result = await loader.adopt_orphaned_pack(main_db, source, target)

    assert result["templates_adopted"] == 1
    assert result["template_package_renamed"] == 1
    assert result["slot_package_renamed"] == 1  # only Slot A matched

    # Metadata rewritten
    assert tpl.template_metadata[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert tpl.template_metadata["source"]["pack"] == target
    assert tpl.package_name == target

    # Slot package rewrites
    assert tpl.slots[0]["package_name"] == target
    assert tpl.slots[1]["package_name"] == "other_pack"  # unchanged
    assert "package_name" not in tpl.slots[2]  # unchanged


@pytest.mark.asyncio
async def test_adopt_rewrites_character_metadata(monkeypatch):
    source, target = "legacy_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 0, "templates": 0, "characters": 1}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    ctx = _blocks_ctx([])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    char = _make_character("orphan.char.1", source)
    main_db = _MockSession([], [char])

    result = await loader.adopt_orphaned_pack(main_db, source, target)

    assert result["characters_adopted"] == 1
    assert char.character_metadata[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert char.character_metadata["source"]["pack"] == target


@pytest.mark.asyncio
async def test_adopt_all_entity_types_combined(monkeypatch):
    """End-to-end adopt across blocks, templates, and characters."""
    source, target = "legacy_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 2, "templates": 1, "characters": 1}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    block1 = _make_block("orphan.b1", source, source_pack=source)
    block2 = _make_block("orphan.b2", source, source_pack=source)
    ctx = _blocks_ctx([block1, block2])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    tpl = _make_template(
        "orphan-tpl-combo",
        source,
        package_name=source,
        slots=[{"label": "S1", "package_name": source}],
    )
    char = _make_character("orphan.c1", source)
    main_db = _MockSession([tpl], [char])

    result = await loader.adopt_orphaned_pack(main_db, source, target)

    assert result["blocks_adopted"] == 2
    assert result["block_source_pack_renamed"] == 2
    assert result["templates_adopted"] == 1
    assert result["template_package_renamed"] == 1
    assert result["slot_package_renamed"] == 1
    assert result["characters_adopted"] == 1

    # All entities point to target
    assert block1.tags[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert tpl.template_metadata[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert char.character_metadata[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert main_db.committed


@pytest.mark.asyncio
async def test_adopt_skips_package_rewrite_when_disabled(monkeypatch):
    """rewrite_package_names=False should skip package_name and slot rewrites."""
    source, target = "legacy_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 0, "templates": 1, "characters": 0}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    ctx = _blocks_ctx([])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    tpl = _make_template(
        "orphan-tpl-nopkg",
        source,
        package_name=source,
        slots=[{"label": "S1", "package_name": source}],
    )
    main_db = _MockSession([tpl], [])

    result = await loader.adopt_orphaned_pack(
        main_db, source, target, rewrite_package_names=False,
    )

    # Metadata rewritten but not package fields
    assert result["templates_adopted"] == 1
    assert result["template_package_renamed"] == 0
    assert result["slot_package_renamed"] == 0
    assert tpl.template_metadata[loader.CONTENT_PACK_SOURCE_KEY] == target
    assert tpl.package_name == source  # unchanged
    assert tpl.slots[0]["package_name"] == source  # unchanged


# ── 4. Adopt edge cases ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adopt_noop_when_no_entities(monkeypatch):
    source, target = "empty_orphan", "core_camera_fixture"
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [target])

    async def _inventory(_db):
        return {"packs": {source: {"status": "orphaned", "blocks": 0, "templates": 0, "characters": 0}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    ctx = _blocks_ctx([])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    main_db = _MockSession([], [])
    result = await loader.adopt_orphaned_pack(main_db, source, target)

    assert result["blocks_adopted"] == 0
    assert result["templates_adopted"] == 0
    assert result["characters_adopted"] == 0


@pytest.mark.asyncio
async def test_adopt_strips_whitespace_from_pack_names(monkeypatch):
    """Leading/trailing whitespace in pack names should be stripped."""
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["target_pack"])

    async def _inventory(_db):
        return {"packs": {"source_pack": {"status": "orphaned", "blocks": 0, "templates": 0, "characters": 0}}}

    monkeypatch.setattr(loader, "get_content_pack_inventory", _inventory)

    ctx = _blocks_ctx([])
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    main_db = _MockSession([], [])
    result = await loader.adopt_orphaned_pack(
        main_db,
        source_pack_name="  source_pack  ",
        target_pack_name="  target_pack  ",
    )
    assert result["blocks_adopted"] == 0  # no error, names were stripped


# ── 5. Purge validation ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_purge_rejects_pack_still_on_disk(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["core_camera_fixture"])

    with pytest.raises(ValueError, match="still exists on disk"):
        await loader.purge_orphaned_pack(_MockSession(), "core_camera_fixture")


@pytest.mark.asyncio
async def test_purge_allows_pack_not_on_disk(monkeypatch):
    """Purge should proceed when pack is genuinely orphaned (not on disk)."""
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["other_pack"])

    # Mock _prune_missing_entities to avoid real DB calls
    prune_calls = []

    async def _fake_prune(db, model_cls, *, lookup_field, metadata_field, source_pack_name, incoming_lookup_values):
        prune_calls.append((model_cls.__name__, source_pack_name))
        return 0

    monkeypatch.setattr(loader, "_prune_missing_entities", _fake_prune)

    ctx = _blocks_ctx()
    monkeypatch.setattr(loader, "get_async_blocks_session", ctx)

    main_db = _MockSession()
    result = await loader.purge_orphaned_pack(main_db, "legacy_orphan")

    assert result["blocks_purged"] == 0
    assert result["templates_purged"] == 0
    assert result["characters_purged"] == 0


# ── 6. Inventory status classification ───────────────────────────────────


@pytest.mark.asyncio
async def test_inventory_classifies_active_orphaned_disk_only(monkeypatch):
    """Verify the three-way classification: active, orphaned, disk_only."""
    monkeypatch.setattr(loader, "discover_content_packs", lambda: ["active_pack", "disk_only_pack"])

    # Mock blocks DB: active_pack has 5 blocks, orphan_pack has 3 blocks
    blocks_rows = [
        SimpleNamespace(pack="active_pack", cnt=5),
        SimpleNamespace(pack="orphan_pack", cnt=3),
    ]

    @asynccontextmanager
    async def _fake_blocks_session():
        yield _MockSession(blocks_rows)

    monkeypatch.setattr(loader, "get_async_blocks_session", _fake_blocks_session)

    # main DB: first call = templates, second = characters
    template_rows = [SimpleNamespace(pack="active_pack", cnt=2)]
    character_rows = [SimpleNamespace(pack="orphan_pack", cnt=1)]

    main_db = _MockSession(template_rows, character_rows)
    inventory = await loader.get_content_pack_inventory(main_db)

    assert sorted(inventory["disk_packs"]) == ["active_pack", "disk_only_pack"]

    packs = inventory["packs"]
    assert packs["active_pack"]["status"] == "active"
    assert packs["active_pack"]["blocks"] == 5
    assert packs["active_pack"]["templates"] == 2

    assert packs["orphan_pack"]["status"] == "orphaned"
    assert packs["orphan_pack"]["blocks"] == 3
    assert packs["orphan_pack"]["characters"] == 1

    assert packs["disk_only_pack"]["status"] == "disk_only"
    assert packs["disk_only_pack"]["blocks"] == 0

    summary = inventory["summary"]
    assert summary["active_packs"] == 1
    assert summary["orphaned_packs"] == 1
    assert summary["disk_only_packs"] == 1
    assert summary["total_orphaned_entities"] == 4  # 3 blocks + 1 character


@pytest.mark.asyncio
async def test_inventory_empty_when_no_packs(monkeypatch):
    monkeypatch.setattr(loader, "discover_content_packs", lambda: [])

    @asynccontextmanager
    async def _fake_blocks_session():
        yield _MockSession([])

    monkeypatch.setattr(loader, "get_async_blocks_session", _fake_blocks_session)

    main_db = _MockSession([], [])
    inventory = await loader.get_content_pack_inventory(main_db)

    assert inventory["disk_packs"] == []
    assert inventory["packs"] == {}
    assert inventory["summary"]["total_packs"] == 0
