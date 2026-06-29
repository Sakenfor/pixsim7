import os

from launcher.core.environment import ROOT
from launcher.core.process_manager import _remove_reload_args
from launcher.core.services import build_services_from_manifests


def _values_after(args: list[str], flag: str) -> list[str]:
    return [args[index + 1] for index, value in enumerate(args[:-1]) if value == flag]


def test_main_backend_reload_args_are_scoped_to_runtime_sources():
    services = {service.key: service for service in build_services_from_manifests()}
    service = services["main-api"]

    reload_dirs = _values_after(service.args, "--reload-dir")

    assert "--reload" in service.args
    assert ROOT not in reload_dirs
    assert os.path.join(ROOT, "pixsim7", "backend", "main") in reload_dirs
    assert os.path.join(ROOT, "pixsim7", "backend", "tests") not in reload_dirs
    assert _values_after(service.args, "--reload-include") == ["*.py"]
    assert "docs/**" in _values_after(service.args, "--reload-exclude")


def test_reload_toggle_removes_reload_option_group():
    args = [
        "-m",
        "uvicorn",
        "pixsim7.backend.main.main:app",
        "--reload",
        "--reload-dir",
        "pixsim7/backend/main",
        "--reload-include",
        "*.py",
        "--reload-exclude",
        "docs/**",
        "--no-access-log",
    ]

    assert _remove_reload_args(args) == [
        "-m",
        "uvicorn",
        "pixsim7.backend.main.main:app",
        "--no-access-log",
    ]
