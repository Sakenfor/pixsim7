"""
Smoke tests pinning the capability registry against drift.

If you add a new sibling-package adapter, the failing tests here force you
to register it in capability_registry.all_bindings() — which is exactly
the drift we want to prevent.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.capability_registry import (
    HOSTS,
    all_bindings,
    bind_for_host,
    shutdown_for_host,
)


def test_binding_names_are_unique() -> None:
    names = [b.name for b in all_bindings()]
    assert len(names) == len(set(names)), f"duplicate binding name in {names}"


def test_every_binding_targets_known_hosts() -> None:
    for binding in all_bindings():
        unknown = binding.hosts - HOSTS
        assert not unknown, (
            f"binding {binding.name!r} targets unknown hosts: {sorted(unknown)}"
        )
        assert binding.hosts, f"binding {binding.name!r} targets no hosts"


def test_bind_for_host_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="unknown host"):
        bind_for_host("nope")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_shutdown_for_host_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="unknown host"):
        await shutdown_for_host("nope")  # type: ignore[arg-type]


def test_every_adapter_file_is_registered() -> None:
    """Catches drift between filesystem and registry: every `.py` file in
    `backend/main/adapters/` (besides `__init__.py`) must have a matching
    `CapabilityBinding.name` in `all_bindings()`. Adapter file naming
    convention is `<sibling>.py` → registry entry `name="<sibling>"`.
    """
    from pathlib import Path
    import pixsim7.backend.main.adapters as adapters_pkg

    adapters_dir = Path(adapters_pkg.__file__).parent
    file_names = {
        f.stem for f in adapters_dir.glob("*.py")
        if f.stem != "__init__"
    }
    registered = {b.name for b in all_bindings()}

    missing = file_names - registered
    assert not missing, (
        f"adapter file(s) {sorted(missing)} exist but have no registry entry "
        f"in capability_registry.all_bindings()"
    )

    extra = registered - file_names
    assert not extra, (
        f"registry references {sorted(extra)} but no matching adapter file "
        f"exists in backend/main/adapters/"
    )
