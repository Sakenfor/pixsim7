from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.block.compiler_core import (
    BlockCompiler,
    CompilerRegistry,
    CompilerV1,
    build_default_compiler_registry,
)


def test_default_compiler_registry_contains_compiler_v1() -> None:
    registry = build_default_compiler_registry()
    compiler = registry.get("compiler_v1")
    assert isinstance(compiler, CompilerV1)
    assert compiler.compiler_id == "compiler_v1"


def test_compiler_registry_register_and_lookup() -> None:
    registry = CompilerRegistry()
    v1 = CompilerV1()
    registry.register_item(v1)
    assert registry.get("compiler_v1") is v1
    assert "compiler_v1" in registry


def test_compiler_registry_unknown_key_raises() -> None:
    registry = build_default_compiler_registry()
    with pytest.raises(Exception):
        registry.get("nonexistent_compiler")


def test_compiler_registry_ids() -> None:
    registry = build_default_compiler_registry()
    assert "compiler_v1" in registry.keys()
