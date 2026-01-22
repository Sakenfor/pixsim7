from dataclasses import dataclass
from typing import List, Dict, Optional, Iterable
import os
import json
from pathlib import Path

try:
    from .config import ROOT, read_env_ports, find_python_executable, read_env_file
except ImportError:
    from config import ROOT, read_env_ports, find_python_executable, read_env_file


MANIFEST_FILENAME = "pixsim.service.json"
SKIP_DIRS = {
    ".git",
    ".github",
    ".husky",
    ".claude",
    ".pytest_cache",
    ".idea",
    ".vscode",
    "node_modules",
    "packages",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "storage",
    "data",
    "docs",
    "examples",
    "tests",
    "launcher",
    "pixsim7",
    "chrome-extension",
}


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
    # OpenAPI schema support (for services that expose OpenAPI)
    openapi_url: Optional[str] = None  # e.g., "http://localhost:8000/openapi.json"
    openapi_types_path: Optional[str] = None  # Relative path to generated types file


def _iter_package_json_paths(root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if "package.json" in filenames:
            yield Path(dirpath) / "package.json"


def _iter_manifest_paths(root: Path) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if MANIFEST_FILENAME in filenames:
            yield Path(dirpath) / MANIFEST_FILENAME


def _load_json(path: Path) -> Optional[Dict]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def _load_service_from_package_json(path: Path) -> Optional[Dict]:
    data = _load_json(path)
    if not data:
        return None
    service = data.get("pixsim", {}).get("service")
    if not isinstance(service, dict):
        return None
    if "directory" not in service:
        service = dict(service)
        try:
            service["directory"] = str(path.parent.relative_to(ROOT))
        except Exception:
            service["directory"] = str(path.parent)
    return service


def _load_service_from_manifest(path: Path) -> Optional[Dict]:
    data = _load_json(path)
    if not data:
        return None
    if isinstance(data.get("service"), dict):
        return data["service"]
    if isinstance(data.get("pixsim", {}).get("service"), dict):
        return data["pixsim"]["service"]
    if isinstance(data, dict) and data.get("id"):
        return data
    return None


def load_service_configs(root: Optional[Path] = None) -> List[Dict]:
    root_path = Path(root or ROOT)
    configs: List[Dict] = []
    seen_ids = set()

    package_paths = sorted(_iter_package_json_paths(root_path))
    manifest_paths = sorted(_iter_manifest_paths(root_path))

    for path in package_paths:
        config = _load_service_from_package_json(path)
        if not config:
            continue
        service_id = config.get("id")
        if not service_id:
            continue
        if service_id in seen_ids:
            print(f"Warning: duplicate service id '{service_id}' in {path}")
            continue
        seen_ids.add(service_id)
        configs.append(config)

    for path in manifest_paths:
        config = _load_service_from_manifest(path)
        if not config:
            continue
        service_id = config.get("id")
        if not service_id:
            continue
        if service_id in seen_ids:
            print(f"Warning: duplicate service id '{service_id}' in {path}")
            continue
        seen_ids.add(service_id)
        configs.append(config)

    return configs


def load_backend_service_configs(root: Optional[Path] = None) -> List[Dict]:
    configs = load_service_configs(root)
    backend_types = {"backend", "api"}
    return [cfg for cfg in configs if (cfg.get("type") or "").lower() in backend_types]


def _get_env_value(key: str, env_vars: Optional[Dict[str, str]] = None) -> Optional[str]:
    if key in os.environ:
        return os.environ[key]
    if env_vars is None:
        try:
            env_vars = read_env_file()
        except Exception:
            env_vars = {}
    return env_vars.get(key)


def _resolve_port(service_config: Dict) -> int:
    """Resolve port from environment or .env, fallback to default."""
    port_env = service_config.get("port_env")
    if port_env:
        value = _get_env_value(port_env)
        if value:
            return int(value)
    return service_config.get("default_port", 8000)


def _normalize_base_url(value: str) -> str:
    return value.rstrip("/")


def _join_base_url(base_url: str, endpoint: Optional[str]) -> str:
    if not endpoint:
        return base_url
    if not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    return f"{base_url.rstrip('/')}{endpoint}"


def _resolve_base_url(service_config: Dict, port: int) -> str:
    """Resolve base URL from env/config, fallback to localhost + port."""
    base_url = None
    base_url_env = service_config.get("base_url_env")
    if base_url_env:
        base_url = _get_env_value(base_url_env)
    if not base_url:
        base_url = service_config.get("base_url")
    if base_url:
        return _normalize_base_url(base_url)
    return f"http://localhost:{port}"


def _get_command_executable(command: str) -> str:
    """Get platform-specific command executable (adds .cmd on Windows for npm/pnpm)."""
    import sys
    if sys.platform == "win32" and command in ["npm", "pnpm"]:
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

    env_vars = read_env_file()
    backend_base_url = _get_env_value("BACKEND_BASE_URL", env_vars) or f"http://localhost:{ports.backend}"
    frontend_base_url = _get_env_value("FRONTEND_BASE_URL", env_vars) or f"http://localhost:{ports.frontend}"
    game_frontend_base_url = _get_env_value("GAME_FRONTEND_BASE_URL", env_vars) or f"http://localhost:{ports.game_frontend}"
    devtools_base_url = _get_env_value("DEVTOOLS_BASE_URL", env_vars) or f"http://localhost:{ports.devtools}"
    launcher_base_url = _get_env_value("LAUNCHER_BASE_URL", env_vars) or "http://localhost:8100"
    admin_port = _get_env_value("ADMIN_PORT", env_vars) or str(getattr(ports, "admin", 5175))
    admin_base_url = _get_env_value("ADMIN_BASE_URL", env_vars)
    if not admin_base_url:
        admin_base_url = f"http://localhost:{admin_port}"
    generation_port = _get_env_value("GENERATION_API_PORT", env_vars)
    generation_base_url = _get_env_value("GENERATION_BASE_URL", env_vars)
    if not generation_base_url and generation_port:
        generation_base_url = f"http://localhost:{generation_port}"

    substituted = {}
    for key, value in env_overrides.items():
        if service_port is not None:
            value = value.replace("$PORT", str(service_port))
        value = value.replace("$BACKEND_PORT", str(ports.backend))
        value = value.replace("$FRONTEND_PORT", str(ports.frontend))
        value = value.replace("$GAME_FRONTEND_PORT", str(ports.game_frontend))
        value = value.replace("$DEVTOOLS_PORT", str(ports.devtools))
        value = value.replace("$ADMIN_PORT", str(admin_port))
        value = value.replace("$BACKEND_BASE_URL", backend_base_url)
        value = value.replace("$FRONTEND_BASE_URL", frontend_base_url)
        value = value.replace("$GENERATION_BASE_URL", generation_base_url or "")
        if generation_port:
            value = value.replace("$GENERATION_API_PORT", generation_port)
        value = value.replace("$GAME_FRONTEND_BASE_URL", game_frontend_base_url)
        value = value.replace("$DEVTOOLS_BASE_URL", devtools_base_url)
        value = value.replace("$ADMIN_BASE_URL", admin_base_url)
        value = value.replace("$LAUNCHER_BASE_URL", launcher_base_url)
        substituted[key] = value

    return substituted


def _merge_env_overrides(base: Dict[str, str], service_config: Dict, ports, service_port: Optional[int] = None) -> Dict[str, str]:
    overrides = dict(base)
    overrides.update(_substitute_env_vars(service_config.get("env_overrides", {}), ports, service_port))
    return overrides


def _convert_backend_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a backend service manifest to ServiceDef."""
    python_exe = find_python_executable()
    service_id = service_config["id"]
    port = _resolve_port(service_config)
    base_url = _resolve_base_url(service_config, port)

    module = service_config.get("module", "pixsim7.backend.main.main:app")

    openapi_endpoint = service_config.get("openapi_endpoint")
    openapi_url = _join_base_url(base_url, openapi_endpoint) if openapi_endpoint else None
    openapi_types_path = service_config.get("openapi_types_path")

    docs_endpoint = service_config.get("docs_endpoint", "/docs")
    health_endpoint = service_config.get("health_endpoint", "/health")
    cwd = service_config.get("cwd")
    if not cwd:
        directory = service_config.get("directory")
        cwd = os.path.join(ROOT, directory) if directory else ROOT

    env_overrides = _merge_env_overrides(
        {
            "PYTHONPATH": ROOT,
            "PIXSIM_LOG_FORMAT": "human",
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
        },
        service_config,
        ports,
        service_port=port,
    )

    return ServiceDef(
        key=service_id,
        title=service_config.get("name", service_id),
        program=python_exe,
        args=["-m", "uvicorn", module, "--host", "0.0.0.0", "--port", str(port), "--reload"],
        cwd=cwd,
        env_overrides=env_overrides,
        url=_join_base_url(base_url, docs_endpoint),
        health_url=_join_base_url(base_url, health_endpoint),
        health_grace_attempts=service_config.get("health_grace_attempts", 6),
        depends_on=service_config.get("depends_on", []),
        openapi_url=openapi_url,
        openapi_types_path=openapi_types_path,
    )


def _convert_frontend_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a frontend service manifest to ServiceDef."""
    service_id = service_config["id"]
    port = _resolve_port(service_config)
    base_url = _resolve_base_url(service_config, port)

    command = _get_command_executable(service_config.get("command", "pnpm"))

    args = service_config.get("args", ["dev", "--port"])
    if "--port" in args or "dev" in args:
        args = args + [str(port)]

    env_overrides = _substitute_env_vars(
        service_config.get("env_overrides", {}),
        ports,
        service_port=port,
    )

    directory = service_config.get("directory")
    cwd = service_config.get("cwd") or (os.path.join(ROOT, directory) if directory else ROOT)

    return ServiceDef(
        key=service_id,
        title=service_config.get("name", service_id),
        program=command,
        args=args,
        cwd=cwd,
        env_overrides=env_overrides,
        url=base_url,
        health_url=_join_base_url(base_url, service_config.get("health_endpoint", "/")),
        required_tool=command.replace(".cmd", ""),
        health_grace_attempts=service_config.get("health_grace_attempts", 15),
        depends_on=service_config.get("depends_on", []),
    )


def _convert_worker_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a worker/background service manifest to ServiceDef."""
    python_exe = find_python_executable()
    service_id = service_config["id"]
    module = service_config.get("module", "arq")
    args = ["-m", module] + service_config.get("args", [])
    cwd = service_config.get("cwd")
    if not cwd:
        directory = service_config.get("directory")
        cwd = os.path.join(ROOT, directory) if directory else ROOT

    env_overrides = _merge_env_overrides(
        {
            "PYTHONPATH": ROOT,
            "PIXSIM_LOG_FORMAT": "human",
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
        },
        service_config,
        ports,
    )

    return ServiceDef(
        key=service_id,
        title=service_config.get("name", service_id),
        program=python_exe,
        args=args,
        cwd=cwd,
        env_overrides=env_overrides,
        url=None,
        health_url=None,
        health_grace_attempts=service_config.get("health_grace_attempts", 10),
        depends_on=service_config.get("depends_on", []),
    )


def _convert_docker_compose_service_to_def(service_config: Dict, ports) -> ServiceDef:
    """Convert a docker-compose service manifest to ServiceDef."""
    service_id = service_config["id"]
    compose_file = service_config.get("file", "docker-compose.db-only.yml")
    cwd = service_config.get("cwd")
    if not cwd:
        directory = service_config.get("directory")
        cwd = os.path.join(ROOT, directory) if directory else ROOT

    return ServiceDef(
        key=service_id,
        title=service_config.get("name", service_id),
        program="docker-compose",
        args=["-f", os.path.join(ROOT, compose_file), "up", "-d"],
        cwd=cwd,
        url=None,
        health_url=None,
        required_tool="docker|docker-compose",
        health_grace_attempts=service_config.get("health_grace_attempts", 8),
        depends_on=service_config.get("depends_on", []),
    )


def build_services_from_manifests() -> List[ServiceDef]:
    ports = read_env_ports()
    services: List[ServiceDef] = []
    configs = load_service_configs()
    if not configs:
        print("Warning: no service manifests found")
        return services

    for service_config in configs:
        if not service_config.get("enabled", True):
            continue

        service_type = (service_config.get("type") or "").lower()
        runtime = (service_config.get("runtime") or "").lower()

        try:
            if service_type in {"frontend", "ui", "web"}:
                services.append(_convert_frontend_service_to_def(service_config, ports))
            elif service_type in {"backend", "api"}:
                services.append(_convert_backend_service_to_def(service_config, ports))
            elif service_type in {"worker", "python"} or runtime == "python":
                services.append(_convert_worker_service_to_def(service_config, ports))
            elif service_type in {"docker-compose", "docker"} or runtime == "docker-compose":
                services.append(_convert_docker_compose_service_to_def(service_config, ports))
            else:
                if service_config.get("command"):
                    services.append(_convert_frontend_service_to_def(service_config, ports))
                elif service_config.get("module"):
                    services.append(_convert_worker_service_to_def(service_config, ports))
                else:
                    print(f"Warning: unsupported service type '{service_type}' for {service_config.get('id')}")
        except Exception as e:
            print(f"Warning: failed to convert service {service_config.get('id', 'unknown')}: {e}")

    return services
