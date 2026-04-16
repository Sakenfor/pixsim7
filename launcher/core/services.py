from dataclasses import dataclass
from typing import List, Dict, Optional, Iterable
import os
import json
from pathlib import Path

from .environment import ROOT, find_python_executable
from .service_settings import merge_with_base_schema


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
    openapi_types_path: Optional[str] = None  # Relative path to generated OpenAPI output directory
    # Metadata
    category: Optional[str] = None
    # Lifecycle
    auto_start: bool = False
    # Peer relationship
    dev_peer_of: Optional[str] = None
    # Per-service settings schema
    settings_schema: Optional[List] = None
    # Optional pnpm workspace package to build before starting (e.g. "@pixsim7/main").
    # Paired with a `build_before_start` boolean setting on the service.
    build_before_start_package: Optional[str] = None


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


def _resolve_port(service_config: Dict) -> int:
    """Resolve port: persisted settings → os.environ → manifest default."""
    from .service_settings import load_persisted
    service_id = service_config.get("id")
    if service_id:
        persisted = load_persisted(service_id)
        if "port" in persisted:
            try:
                return int(persisted["port"])
            except (ValueError, TypeError):
                pass
    port_env = service_config.get("port_env")
    if port_env:
        value = os.environ.get(port_env)
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
        base_url = os.environ.get(base_url_env)
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


def substitute_env_vars(
    env_overrides: Dict[str, str],
    namespace: Dict[str, str],
) -> Dict[str, str]:
    """Substitute ``$VAR_NAME`` placeholders in environment variable values.

    *namespace* should contain global exports + os.environ / .env fallbacks.
    Auto-derives ``*_BASE_URL`` from ``*_PORT`` entries if not present.
    """
    import re
    if not env_overrides:
        return {}

    # Work on a copy so we don't mutate the caller's dict
    ns: Dict[str, str] = dict(namespace)

    # Auto-derive base URLs from ports in namespace
    for key in list(ns):
        if key.endswith("_PORT"):
            base_url_key = key.replace("_PORT", "_BASE_URL")
            if not ns.get(base_url_key):
                ns[base_url_key] = f"http://localhost:{ns[key]}"
        if key.endswith("_API_PORT"):
            base_url_key = key.replace("_API_PORT", "_BASE_URL")
            if not ns.get(base_url_key):
                ns[base_url_key] = f"http://localhost:{ns[key]}"

    def _replace(match: re.Match) -> str:
        return ns.get(match.group(1), "")

    substituted = {}
    for key, value in env_overrides.items():
        resolved = re.sub(r'\$([A-Z_][A-Z0-9_]*)', _replace, value)
        if resolved:  # skip empty results (disabled service)
            substituted[key] = resolved

    return substituted


def _merge_env_overrides(base: Dict[str, str], service_config: Dict) -> Dict[str, str]:
    """Merge base env with raw (unsubstituted) manifest env_overrides."""
    overrides = dict(base)
    overrides.update(service_config.get("env_overrides", {}))
    return overrides


# ── Service converters ──
# Each converter class turns a manifest dict into a ServiceDef.
# The base class handles shared fields (key, title, cwd, depends_on, …);
# subclasses override hooks for program, args, env, and URLs.

_PYTHON_ENV = {
    "PYTHONPATH": ROOT,
    "PIXSIM_LOG_FORMAT": "human",
    "PYTHONUTF8": "1",
    "PYTHONIOENCODING": "utf-8",
}


class ServiceConverter:
    """Base converter — shared logic for all service types."""

    schema_type: str = ""
    default_grace: int = 5

    def convert(self, config: Dict) -> ServiceDef:
        sid = config["id"]
        cwd = self._resolve_cwd(config)
        schema = self._build_schema(config)
        extra = self._extra_fields(config)

        return ServiceDef(
            key=sid,
            title=config.get("name", sid),
            program=self._program(config),
            args=self._args(config),
            cwd=cwd,
            env_overrides=self._env(config),
            url=self._url(config),
            health_url=self._health_url(config),
            required_tool=self._required_tool(config),
            health_grace_attempts=config.get("health_grace_attempts", self.default_grace),
            depends_on=config.get("depends_on", []),
            category=config.get("category"),
            auto_start=config.get("auto_start", False),
            dev_peer_of=config.get("dev_peer_of"),
            settings_schema=schema,
            build_before_start_package=config.get("build_before_start_package"),
            **extra,
        )

    # ── hooks (override in subclasses) ──

    def _program(self, config: Dict) -> str:
        return ""

    def _args(self, config: Dict) -> List[str]:
        return []

    def _env(self, config: Dict) -> Dict[str, str]:
        return config.get("env_overrides", {})

    def _url(self, config: Dict) -> Optional[str]:
        return None

    def _health_url(self, config: Dict) -> Optional[str]:
        return None

    def _required_tool(self, config: Dict) -> Optional[str]:
        return None

    def _extra_fields(self, config: Dict) -> Dict:
        """Return additional ServiceDef kwargs (e.g. openapi_url)."""
        return {}

    # ── shared helpers ──

    def _resolve_cwd(self, config: Dict) -> str:
        cwd = config.get("cwd")
        if cwd:
            return cwd
        directory = config.get("directory")
        return os.path.join(ROOT, directory) if directory else ROOT

    def _resolve_port(self, config: Dict) -> int:
        return _resolve_port(config)

    def _resolve_base_url(self, config: Dict) -> str:
        port = self._resolve_port(config)
        return _resolve_base_url(config, port)

    def _build_schema(self, config: Dict) -> Optional[List]:
        if not self.schema_type:
            return config.get("settings")
        schema = merge_with_base_schema(
            self.schema_type, config.get("settings"),
            exclude_base=config.get("exclude_base_settings"),
        )
        # Sync schema port default with resolved port
        port = self._resolve_port(config)
        for field in schema:
            if field.get("key") == "port":
                field["default"] = port
                break
        return schema


class PlatformConverter(ServiceConverter):
    default_grace = 0


class FrontendConverter(ServiceConverter):
    schema_type = "frontend"
    default_grace = 15

    def _program(self, config):
        return _get_command_executable(config.get("command", "pnpm"))

    def _args(self, config):
        port = self._resolve_port(config)
        args = list(config.get("args", ["dev", "--port"]))
        if "--port" in args:
            idx = args.index("--port")
            # Insert port value right after --port so trailing flags
            # (e.g. --host for vite preview) stay in place.
            args.insert(idx + 1, str(port))
        return args

    def _url(self, config):
        return self._resolve_base_url(config)

    def _health_url(self, config):
        return _join_base_url(self._resolve_base_url(config), config.get("health_endpoint", "/"))

    def _required_tool(self, config):
        return _get_command_executable(config.get("command", "pnpm")).replace(".cmd", "")


class BackendConverter(ServiceConverter):
    schema_type = "backend"
    default_grace = 6

    def _program(self, _config):
        return find_python_executable()

    def _args(self, config):
        port = self._resolve_port(config)
        module = config.get("module", "pixsim7.backend.main.main:app")
        return ["-m", "uvicorn", module, "--host", "0.0.0.0", "--port", str(port), "--reload"]

    def _env(self, config):
        return _merge_env_overrides(_PYTHON_ENV, config)

    def _url(self, config):
        return _join_base_url(self._resolve_base_url(config), config.get("docs_endpoint", "/docs"))

    def _health_url(self, config):
        return _join_base_url(self._resolve_base_url(config), config.get("health_endpoint", "/health"))

    def _extra_fields(self, config):
        base_url = self._resolve_base_url(config)
        ep = config.get("openapi_endpoint")
        return {
            "openapi_url": _join_base_url(base_url, ep) if ep else None,
            "openapi_types_path": config.get("openapi_types_path"),
        }


class WorkerConverter(ServiceConverter):
    schema_type = "worker"
    default_grace = 10

    def _program(self, _config):
        return find_python_executable()

    def _args(self, config):
        module = config.get("module", "arq")
        return ["-m", module] + config.get("args", [])

    def _env(self, config):
        return _merge_env_overrides(_PYTHON_ENV, config)


class DockerComposeConverter(ServiceConverter):
    schema_type = "docker-compose"
    default_grace = 8

    def _program(self, _config):
        return "docker-compose"

    def _args(self, config):
        compose_file = config.get("file", "docker-compose.db-only.yml")
        return ["-f", os.path.join(ROOT, compose_file), "up", "-d"]

    def _required_tool(self, _config):
        return "docker|docker-compose"


# ── Dispatch ──

_CONVERTERS: Dict[str, ServiceConverter] = {
    "platform":       PlatformConverter(),
    "frontend":       FrontendConverter(),
    "ui":             FrontendConverter(),
    "web":            FrontendConverter(),
    "backend":        BackendConverter(),
    "api":            BackendConverter(),
    "worker":         WorkerConverter(),
    "python":         WorkerConverter(),
    "docker-compose": DockerComposeConverter(),
    "docker":         DockerComposeConverter(),
}


def _infer_converter(service_config: Dict) -> Optional[ServiceConverter]:
    """Infer converter from runtime field or manifest shape."""
    runtime = (service_config.get("runtime") or "").lower()
    if runtime in _CONVERTERS:
        return _CONVERTERS[runtime]
    if service_config.get("command"):
        return _CONVERTERS["frontend"]
    if service_config.get("module"):
        return _CONVERTERS["worker"]
    return None


def build_services_from_manifests() -> List[ServiceDef]:
    services: List[ServiceDef] = []
    configs = load_service_configs()
    if not configs:
        print("Warning: no service manifests found")
        return services

    for service_config in configs:
        if not service_config.get("enabled", True):
            continue

        service_type = (service_config.get("type") or "").lower()
        converter = _CONVERTERS.get(service_type) or _infer_converter(service_config)

        if not converter:
            print(f"Warning: unsupported service type '{service_type}' for {service_config.get('id')}")
            continue

        try:
            services.append(converter.convert(service_config))
        except Exception as e:
            print(f"Warning: failed to convert service {service_config.get('id', 'unknown')}: {e}")

    return services
