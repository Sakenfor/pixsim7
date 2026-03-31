"""Convert discovered ServiceDef to core ServiceDefinition.

Extracted from launcher.gui.launcher_facade so it can be used without PySide6.
"""
from __future__ import annotations

import os

from .gui_config import ROOT
from .services import ServiceDef
from .types import ServiceDefinition, ServiceStatus, HealthStatus


def convert_service_def(service_def: ServiceDef) -> ServiceDefinition:
    """Convert a discovered ServiceDef to a core ServiceDefinition.

    Handles special cases (e.g. docker-compose DB service) with custom
    start/stop/health handlers.
    """
    custom_start = None
    custom_stop = None
    custom_health = None
    is_detached = False

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
        is_detached=is_detached,
        custom_start=custom_start,
        custom_stop=custom_stop,
        custom_health_check=custom_health,
    )
