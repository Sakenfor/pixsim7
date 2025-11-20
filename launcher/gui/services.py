from dataclasses import dataclass
from typing import List, Dict, Optional
import os
import json
from pathlib import Path

try:
    from .config import ROOT, read_env_ports, find_python_executable
except ImportError:
    from config import ROOT, read_env_ports, find_python_executable


@dataclass
class ServiceDef:
    key: str
    title: str
    program: str
    args: List[str]
    cwd: str
    env_overrides: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    health_url: Optional[str] = None
    required_tool: Optional[str] = None  # Tool that must be in PATH
    health_grace_attempts: int = 5       # Attempts before marking unhealthy
    depends_on: Optional[List[str]] = None  # Service keys that must be running first


def build_services() -> List[ServiceDef]:
    ports = read_env_ports()
    python_exe = find_python_executable()

    # On Windows, QProcess needs .cmd extension for npm/pnpm
    import sys
    pnpm_exe = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    npm_exe = "npm.cmd" if sys.platform == "win32" else "npm"

    return [
        ServiceDef(
            key="db",
            title="Databases (Docker)",
            program="docker-compose",
            args=["-f", os.path.join(ROOT, "docker-compose.db-only.yml"), "up", "-d"],
            cwd=ROOT,
            url=None,
            health_url=None,  # Will check via docker-compose ps
            required_tool="docker|docker-compose",
            health_grace_attempts=8,
        ),
        ServiceDef(
            key="backend",
            title="Backend API",
            program=python_exe,
            args=["-m", "uvicorn", "pixsim7_backend.main:app", "--host", "0.0.0.0", "--port", str(ports.backend), "--reload"],
            cwd=ROOT,
            env_overrides={
                "PYTHONPATH": ROOT,
                "PIXSIM_LOG_FORMAT": "human",  # Human-readable logs in console
                "PYTHONUTF8": "1",
                "PYTHONIOENCODING": "utf-8",
            },
            url=f"http://localhost:{ports.backend}/docs",
            health_url=f"http://localhost:{ports.backend}/health",
            health_grace_attempts=6,
            depends_on=["db"],  # Backend requires database
        ),
        ServiceDef(
            key="worker",
            title="Worker (ARQ)",
            program=python_exe,
            args=["-m", "arq", "pixsim7_backend.workers.arq_worker.WorkerSettings"],
            cwd=ROOT,
            env_overrides={
                "PYTHONPATH": ROOT,
                "PIXSIM_LOG_FORMAT": "human",  # Human-readable logs in console
            },
            url=None,
            health_url=None,  # No HTTP health check for worker
            health_grace_attempts=10,
            depends_on=["backend"],  # Worker should start with backend
        ),
        ServiceDef(
            key="admin",
            title="Admin (SvelteKit)",
            program=npm_exe,
            args=["run", "dev"],
            cwd=os.path.join(ROOT, "admin"),
            env_overrides={
                "VITE_ADMIN_PORT": str(ports.admin),
                "VITE_BACKEND_URL": f"http://localhost:{ports.backend}",
            },
            url=f"http://localhost:{ports.admin}",
            health_url=f"http://localhost:{ports.admin}/",
            required_tool="npm",
            health_grace_attempts=15,
        ),
        ServiceDef(
            key="frontend",
            title="Frontend (React)",
            program=pnpm_exe,
            args=["dev", "--port", str(ports.frontend)],
            cwd=os.path.join(ROOT, "frontend"),
            env_overrides={
                "VITE_GAME_URL": f"http://localhost:{ports.game_frontend}",
                "VITE_BACKEND_URL": f"http://localhost:{ports.backend}",
            },
            url=f"http://localhost:{ports.frontend}",
            health_url=f"http://localhost:{ports.frontend}/",
            required_tool="pnpm",
            health_grace_attempts=15,
        ),
        ServiceDef(
            key="game_frontend",
            title="Game Frontend (React)",
            program=pnpm_exe,
            args=["dev", "--port", str(ports.game_frontend)],
            cwd=os.path.join(ROOT, "game-frontend"),
            env_overrides={
                "VITE_BACKEND_URL": f"http://localhost:{ports.backend}",
            },
            url=f"http://localhost:{ports.game_frontend}",
            health_url=f"http://localhost:{ports.game_frontend}/",
            required_tool="pnpm",
            health_grace_attempts=15,
        ),
    ]


def _resolve_port(service_config: Dict) -> int:
    """Resolve port from environment variable or use default."""
    port_env = service_config.get('port_env')
    if port_env and os.getenv(port_env):
        return int(os.getenv(port_env))
    return service_config.get('default_port', 8000)


def _get_command_executable(command: str) -> str:
    """Get platform-specific command executable (adds .cmd on Windows for npm/pnpm)."""
    import sys
    if sys.platform == "win32" and command in ['npm', 'pnpm']:
        return f"{command}.cmd"
    return command


def _substitute_env_vars(env_overrides: Dict[str, str], ports, service_port: int = None) -> Dict[str, str]:
    """Substitute port placeholders in environment variables.

    Args:
        env_overrides: Dict with potential $PORT, $BACKEND_PORT, etc. placeholders
        ports: Ports object with all port values
        service_port: The port for this specific service (replaces $PORT)
    """
    if not env_overrides:
        return {}

    substituted = {}
    for key, value in env_overrides.items():
        # Replace port placeholders with actual port values
        if service_port is not None:
            value = value.replace('$PORT', str(service_port))
        value = value.replace('$BACKEND_PORT', str(ports.backend))
        value = value.replace('$FRONTEND_PORT', str(ports.frontend))
        value = value.replace('$GAME_FRONTEND_PORT', str(ports.game_frontend))
        value = value.replace('$ADMIN_PORT', str(ports.admin))
        substituted[key] = value

    return substituted


def _convert_backend_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a backend service from services.json to ServiceDef."""
    python_exe = find_python_executable()
    service_id = service_config['id']
    port = _resolve_port(service_config)

    # Parse module (e.g., "pixsim7_backend.main:app")
    module = service_config.get('module', 'pixsim7_backend.main:app')

    return ServiceDef(
        key=service_id,
        title=service_config.get('name', service_id),
        program=python_exe,
        args=["-m", "uvicorn", module, "--host", "0.0.0.0", "--port", str(port), "--reload"],
        cwd=ROOT,
        env_overrides={
            "PYTHONPATH": ROOT,
            "PIXSIM_LOG_FORMAT": "human",
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
        },
        url=f"http://localhost:{port}/docs",
        health_url=service_config.get('health_endpoint', f"http://localhost:{port}/health") if 'health_endpoint' in service_config else f"http://localhost:{port}/health",
        health_grace_attempts=6,
        depends_on=service_config.get('depends_on', []),
    )


def _convert_frontend_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a frontend service from services.json to ServiceDef."""
    service_id = service_config['id']
    port = _resolve_port(service_config)

    # Get command executable (handles Windows .cmd extension)
    command = _get_command_executable(service_config.get('command', 'pnpm'))

    # Build args (add port if needed)
    args = service_config.get('args', ['dev', '--port'])
    if '--port' in args or 'dev' in args:
        args = args + [str(port)]

    # Substitute port placeholders in env_overrides from JSON
    env_overrides = _substitute_env_vars(
        service_config.get('env_overrides', {}),
        ports,
        service_port=port
    )

    return ServiceDef(
        key=service_id,
        title=service_config.get('name', service_id),
        program=command,
        args=args,
        cwd=os.path.join(ROOT, service_config.get('directory', service_id)),
        env_overrides=env_overrides,
        url=f"http://localhost:{port}",
        health_url=f"http://localhost:{port}/",
        required_tool=command.replace('.cmd', ''),
        health_grace_attempts=15,
    )


def _convert_infrastructure_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert an infrastructure service from services.json to ServiceDef."""
    python_exe = find_python_executable()
    service_id = service_config['id']
    service_type = service_config.get('type', 'python')

    if service_type == 'docker-compose':
        # Docker-compose service
        compose_file = service_config.get('file', 'docker-compose.db-only.yml')
        return ServiceDef(
            key=service_id,
            title=service_config.get('name', service_id),
            program="docker-compose",
            args=["-f", os.path.join(ROOT, compose_file), "up", "-d"],
            cwd=ROOT,
            url=None,
            health_url=None,
            required_tool="docker|docker-compose",
            health_grace_attempts=8,
        )
    elif service_type == 'python':
        # Python module service (like ARQ worker)
        module = service_config.get('module', 'arq')
        args = ["-m", module] + service_config.get('args', [])

        return ServiceDef(
            key=service_id,
            title=service_config.get('name', service_id),
            program=python_exe,
            args=args,
            cwd=ROOT,
            env_overrides={
                "PYTHONPATH": ROOT,
                "PIXSIM_LOG_FORMAT": "human",
            },
            url=None,
            health_url=None,
            health_grace_attempts=10,
            depends_on=service_config.get('depends_on', []),
        )
    else:
        raise ValueError(f"Unsupported infrastructure service type: {service_type}")


def build_services_from_json() -> Optional[List[ServiceDef]]:
    """
    Build service definitions from services.json configuration.

    Returns:
        List of ServiceDef objects, or None if services.json doesn't exist
    """
    services_json_path = Path(ROOT) / "launcher" / "services.json"

    if not services_json_path.exists():
        return None

    try:
        with open(services_json_path, 'r') as f:
            config = json.load(f)

        ports = read_env_ports()
        services = []

        # Convert backend services
        for backend_config in config.get('backend_services', []):
            if backend_config.get('enabled', True):
                try:
                    services.append(_convert_backend_service_to_def(backend_config, ports))
                except Exception as e:
                    print(f"Warning: Failed to convert backend service {backend_config.get('id', 'unknown')}: {e}")

        # Convert frontend services
        for frontend_config in config.get('frontend_services', []):
            if frontend_config.get('enabled', True):
                try:
                    services.append(_convert_frontend_service_to_def(frontend_config, ports))
                except Exception as e:
                    print(f"Warning: Failed to convert frontend service {frontend_config.get('id', 'unknown')}: {e}")

        # Convert infrastructure services
        for infra_config in config.get('infrastructure_services', []):
            if infra_config.get('enabled', True):
                try:
                    services.append(_convert_infrastructure_service_to_def(infra_config, ports))
                except Exception as e:
                    print(f"Warning: Failed to convert infrastructure service {infra_config.get('id', 'unknown')}: {e}")

        return services

    except Exception as e:
        print(f"Warning: Failed to load services.json: {e}")
        import traceback
        traceback.print_exc()
        return None


def build_services_with_fallback() -> List[ServiceDef]:
    """
    Build service definitions with fallback strategy.

    First tries to load from services.json, falls back to hardcoded definitions.
    """
    # Try services.json first
    services = build_services_from_json()
    if services is not None:
        print("✓ Loaded services from services.json")
        return services

    # Fall back to hardcoded definitions
    print("✓ Using hardcoded service definitions")
    return build_services()
