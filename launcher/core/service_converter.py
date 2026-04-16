"""Convert discovered ServiceDef to core ServiceDefinition.

Extracted from launcher.gui.launcher_facade so it can be used without PySide6.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from typing import Callable, Optional

from .environment import ROOT
from .services import ServiceDef
from .types import ServiceDefinition, ServiceStatus, HealthStatus


def _make_pnpm_build_pre_start(service_key: str, package: str) -> Callable:
    """Return a pre_start hook that runs `pnpm --filter <package> build`
    iff the service's `build_before_start` setting is truthy.
    """
    def hook(state) -> bool:
        from .service_settings import (
            get_effective,
            get_profile_overrides,
            load_persisted,
            parse_schema,
        )

        schema_raw = state.definition.settings_schema
        if schema_raw:
            schema = parse_schema(schema_raw)
            persisted = load_persisted(service_key)
            profile_ov = get_profile_overrides(service_key)
            effective = get_effective(schema, persisted, profile_ov)
        else:
            effective = {}

        if not effective.get("build_before_start", True):
            return True

        pnpm = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
        start = time.time()
        try:
            result = subprocess.run(
                [pnpm, "--filter", package, "build"],
                capture_output=True,
                text=True,
                timeout=600,
                cwd=str(ROOT),
            )
        except subprocess.TimeoutExpired:
            state.last_error = f"Build timed out after 600s for {package}"
            return False
        except Exception as e:
            state.last_error = f"Build invocation failed: {e}"
            return False

        duration_ms = int((time.time() - start) * 1000)
        if result.returncode != 0:
            tail = (result.stderr or result.stdout or "").strip()
            if len(tail) > 600:
                tail = tail[-600:]
            state.last_error = (
                f"pnpm build for {package} exited {result.returncode} "
                f"(took {duration_ms}ms):\n{tail}"
            )
            return False
        return True

    return hook


def convert_service_def(service_def: ServiceDef) -> ServiceDefinition:
    """Convert a discovered ServiceDef to a core ServiceDefinition.

    Handles special cases (e.g. docker-compose DB service) with custom
    start/stop/health handlers.
    """
    custom_start = None
    custom_stop = None
    custom_health = None
    is_detached = False
    pre_start_hook: Optional[Callable] = None

    if service_def.build_before_start_package:
        pre_start_hook = _make_pnpm_build_pre_start(
            service_def.key, service_def.build_before_start_package
        )

    if service_def.key == "db":
        is_detached = True
        compose_file = None
        if "-f" in service_def.args:
            idx = service_def.args.index("-f")
            if idx + 1 < len(service_def.args):
                compose_file = service_def.args[idx + 1]
        if not compose_file:
            compose_file = os.path.join(ROOT, "docker-compose.db-only.yml")

        def db_start(state):
            from launcher.core.docker_utils import compose_up_detached
            try:
                ok, out = compose_up_detached(compose_file)
                if ok:
                    state.status = ServiceStatus.RUNNING
                    state.health = HealthStatus.STARTING
                    return True
                else:
                    state.status = ServiceStatus.FAILED
                    state.health = HealthStatus.UNHEALTHY
                    state.last_error = out.strip() if out else "compose up failed"
                    return False
            except Exception as e:
                state.status = ServiceStatus.FAILED
                state.health = HealthStatus.UNHEALTHY
                state.last_error = str(e)
                return False

        def db_stop(state):
            from launcher.core.docker_utils import compose_down
            try:
                ok, _ = compose_down(compose_file)
                state.status = ServiceStatus.STOPPED
                state.health = HealthStatus.STOPPED
                return ok
            except Exception:
                state.status = ServiceStatus.STOPPED
                state.health = HealthStatus.STOPPED
                return False

        def db_health(state):
            from launcher.core.docker_utils import compose_ps
            try:
                ok, stdout = compose_ps(compose_file)
                if ok and stdout:
                    out = stdout.lower()
                    return " up " in f" {out} " or "running" in out
                return False
            except Exception:
                return False

        custom_start = db_start
        custom_stop = db_stop
        custom_health = db_health

    return ServiceDefinition(
        key=service_def.key,
        title=service_def.title,
        program=service_def.program,
        args=service_def.args,
        cwd=service_def.cwd,
        env_overrides=service_def.env_overrides,
        url=service_def.url,
        health_url=service_def.health_url,
        required_tool=service_def.required_tool,
        health_grace_attempts=service_def.health_grace_attempts,
        depends_on=service_def.depends_on,
        category=service_def.category,
        auto_start=service_def.auto_start,
        dev_peer_of=service_def.dev_peer_of,
        settings_schema=service_def.settings_schema,
        is_detached=is_detached,
        custom_start=custom_start,
        custom_stop=custom_stop,
        custom_health_check=custom_health,
        pre_start_hook=pre_start_hook,
    )
