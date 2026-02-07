"""
Launcher settings contract.

Aggregates launcher settings from persisted settings.json and .env overrides
into a single structured contract for API and UI consumers.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Dict, Optional, Any
import json
import os


DEFAULT_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class LoggingSettings:
    sql_logging_enabled: bool = False
    worker_debug_flags: str = ""
    backend_log_level: str = "INFO"


@dataclass
class DatastoreSettings:
    use_local_datastores: bool = False
    local_database_url: str = ""
    local_redis_url: str = ""


@dataclass
class PortsSettings:
    backend: int = 8001
    frontend: int = 5173
    game_frontend: int = 5174
    game_service: int = 8050
    devtools: int = 5176
    admin: int = 5175
    launcher: int = 8100
    generation_api: int = 8001
    postgres: int = 5434
    redis: int = 6380


@dataclass
class BaseUrlSettings:
    backend: str = ""
    generation: str = ""
    frontend: str = ""
    game_frontend: str = ""
    devtools: str = ""
    admin: str = ""
    launcher: str = ""
    analysis: str = ""
    docs: str = ""


@dataclass
class AdvancedEnvSettings:
    database_url: str = ""
    redis_url: str = ""
    secret_key: str = ""
    cors_origins: str = ""
    debug: str = ""
    service_base_urls: str = ""
    service_timeouts: str = ""


@dataclass
class ProfileDefinition:
    label: str = ""
    ports: Dict[str, int] = field(default_factory=dict)
    base_urls: Dict[str, str] = field(default_factory=dict)
    use_local_datastores: bool = False


@dataclass
class ProfileSettings:
    active: str = ""
    available: Dict[str, ProfileDefinition] = field(default_factory=dict)


@dataclass
class LauncherSettings:
    logging: LoggingSettings = field(default_factory=LoggingSettings)
    datastores: DatastoreSettings = field(default_factory=DatastoreSettings)
    ports: PortsSettings = field(default_factory=PortsSettings)
    base_urls: BaseUrlSettings = field(default_factory=BaseUrlSettings)
    advanced: AdvancedEnvSettings = field(default_factory=AdvancedEnvSettings)
    profiles: ProfileSettings = field(default_factory=ProfileSettings)


def _settings_path(root_dir: Optional[Path] = None) -> Path:
    root = root_dir or DEFAULT_ROOT
    return root / "data" / "launcher" / "settings.json"


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _coerce_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _coerce_int(value: object, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _coerce_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    return str(value)


def _read_env_file(root_dir: Optional[Path] = None) -> Dict[str, str]:
    root = root_dir or DEFAULT_ROOT
    path = root / ".env"
    env_vars: Dict[str, str] = {}
    if not path.exists():
        return env_vars
    try:
        for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env_vars[key.strip()] = value.strip()
    except Exception:
        return env_vars
    return env_vars


def _write_env_file(env_vars: Dict[str, Optional[str]], root_dir: Optional[Path] = None) -> None:
    root = root_dir or DEFAULT_ROOT
    path = root / ".env"

    existing_lines: list[str] = []
    if path.exists():
        try:
            existing_lines = path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
        except Exception:
            existing_lines = []

    updated_keys = set()
    new_lines: list[str] = []

    for line in existing_lines:
        stripped = line.strip()
        if stripped and "=" in stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0].strip()
            if key in env_vars:
                updated_keys.add(key)
                if env_vars[key] is None:
                    continue
                new_lines.append(f"{key}={env_vars[key]}\n")
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    for key, value in sorted(env_vars.items()):
        if key in updated_keys or value is None:
            continue
        new_lines.append(f"{key}={value}\n")

    path.write_text("".join(new_lines), encoding="utf-8")


def _load_profiles(root_dir: Optional[Path] = None) -> Dict[str, ProfileDefinition]:
    root = root_dir or DEFAULT_ROOT
    profiles_path = root / "launcher" / "profiles.json"
    raw = _read_json(profiles_path) or {}
    profiles: Dict[str, ProfileDefinition] = {}
    if not isinstance(raw, dict):
        return profiles
    for key, value in raw.items():
        if not isinstance(value, dict):
            continue
        profiles[key] = ProfileDefinition(
            label=_coerce_str(value.get("label"), key),
            ports={k: _coerce_int(v, 0) for k, v in (value.get("ports") or {}).items()},
            base_urls={k: _coerce_str(v, "") for k, v in (value.get("base_urls") or {}).items()},
            use_local_datastores=_coerce_bool(value.get("use_local_datastores"), False),
        )
    return profiles


def load_launcher_settings(root_dir: Optional[Path] = None) -> LauncherSettings:
    root = root_dir or DEFAULT_ROOT
    data = _read_json(_settings_path(root)) or {}

    logging_raw = data.get("logging", {}) if isinstance(data, dict) else {}
    datastores_raw = data.get("datastores", {}) if isinstance(data, dict) else {}
    env_vars = _read_env_file(root)

    logging = LoggingSettings(
        sql_logging_enabled=_coerce_bool(logging_raw.get("sql_logging_enabled"), False),
        worker_debug_flags=_coerce_str(logging_raw.get("worker_debug_flags"), ""),
        backend_log_level=_coerce_str(logging_raw.get("backend_log_level"), "INFO").upper(),
    )

    datastores = DatastoreSettings(
        use_local_datastores=_coerce_bool(datastores_raw.get("use_local_datastores"), False),
        local_database_url=_coerce_str(env_vars.get("LOCAL_DATABASE_URL"), ""),
        local_redis_url=_coerce_str(env_vars.get("LOCAL_REDIS_URL"), ""),
    )

    ports = PortsSettings(
        backend=_coerce_int(env_vars.get("BACKEND_PORT"), PortsSettings.backend),
        frontend=_coerce_int(env_vars.get("FRONTEND_PORT"), PortsSettings.frontend),
        game_frontend=_coerce_int(env_vars.get("GAME_FRONTEND_PORT"), PortsSettings.game_frontend),
        game_service=_coerce_int(env_vars.get("GAME_SERVICE_PORT"), PortsSettings.game_service),
        devtools=_coerce_int(env_vars.get("DEVTOOLS_PORT"), PortsSettings.devtools),
        admin=_coerce_int(env_vars.get("ADMIN_PORT"), PortsSettings.admin),
        launcher=_coerce_int(env_vars.get("LAUNCHER_PORT"), PortsSettings.launcher),
        generation_api=_coerce_int(env_vars.get("GENERATION_API_PORT"), PortsSettings.generation_api),
        postgres=_coerce_int(env_vars.get("POSTGRES_PORT"), PortsSettings.postgres),
        redis=_coerce_int(env_vars.get("REDIS_PORT"), PortsSettings.redis),
    )

    base_urls = BaseUrlSettings(
        backend=_coerce_str(env_vars.get("BACKEND_BASE_URL"), ""),
        generation=_coerce_str(env_vars.get("GENERATION_BASE_URL"), ""),
        frontend=_coerce_str(env_vars.get("FRONTEND_BASE_URL"), ""),
        game_frontend=_coerce_str(env_vars.get("GAME_FRONTEND_BASE_URL"), ""),
        devtools=_coerce_str(env_vars.get("DEVTOOLS_BASE_URL"), ""),
        admin=_coerce_str(env_vars.get("ADMIN_BASE_URL"), ""),
        launcher=_coerce_str(env_vars.get("LAUNCHER_BASE_URL"), ""),
        analysis=_coerce_str(env_vars.get("ANALYSIS_BASE_URL"), ""),
        docs=_coerce_str(env_vars.get("DOCS_BASE_URL"), ""),
    )

    advanced = AdvancedEnvSettings(
        database_url=_coerce_str(env_vars.get("DATABASE_URL"), ""),
        redis_url=_coerce_str(env_vars.get("REDIS_URL"), ""),
        secret_key=_coerce_str(env_vars.get("SECRET_KEY"), ""),
        cors_origins=_coerce_str(env_vars.get("CORS_ORIGINS"), ""),
        debug=_coerce_str(env_vars.get("DEBUG"), ""),
        service_base_urls=_coerce_str(env_vars.get("PIXSIM_SERVICE_BASE_URLS"), ""),
        service_timeouts=_coerce_str(env_vars.get("PIXSIM_SERVICE_TIMEOUTS"), ""),
    )

    profiles = _load_profiles(root)
    active_profile = _coerce_str(env_vars.get("LAUNCHER_PROFILE"), "")
    if not active_profile and profiles:
        active_profile = "default" if "default" in profiles else sorted(profiles.keys())[0]

    return LauncherSettings(
        logging=logging,
        datastores=datastores,
        ports=ports,
        base_urls=base_urls,
        advanced=advanced,
        profiles=ProfileSettings(active=active_profile, available=profiles),
    )


def save_launcher_settings(settings: LauncherSettings, root_dir: Optional[Path] = None) -> None:
    path = _settings_path(root_dir)
    payload = {
        "logging": asdict(settings.logging),
        "datastores": {"use_local_datastores": settings.datastores.use_local_datastores},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _normalize_env_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def update_launcher_settings(
    updates: Dict[str, Any],
    root_dir: Optional[Path] = None,
    apply_env: bool = True,
) -> LauncherSettings:
    settings = load_launcher_settings(root_dir)

    logging_updates = updates.get("logging") or {}
    if logging_updates:
        if "sql_logging_enabled" in logging_updates:
            settings.logging.sql_logging_enabled = _coerce_bool(logging_updates["sql_logging_enabled"])
        if "worker_debug_flags" in logging_updates:
            settings.logging.worker_debug_flags = _coerce_str(logging_updates["worker_debug_flags"], "")
        if "backend_log_level" in logging_updates:
            settings.logging.backend_log_level = _coerce_str(logging_updates["backend_log_level"], "INFO").upper()

    datastore_updates = updates.get("datastores") or {}
    if datastore_updates:
        if "use_local_datastores" in datastore_updates:
            settings.datastores.use_local_datastores = _coerce_bool(datastore_updates["use_local_datastores"])
        if "local_database_url" in datastore_updates:
            settings.datastores.local_database_url = _coerce_str(datastore_updates["local_database_url"], "")
        if "local_redis_url" in datastore_updates:
            settings.datastores.local_redis_url = _coerce_str(datastore_updates["local_redis_url"], "")

    env_updates: Dict[str, Optional[str]] = {}

    ports_updates = updates.get("ports") or {}
    if ports_updates:
        for key, env_key in {
            "backend": "BACKEND_PORT",
            "frontend": "FRONTEND_PORT",
            "game_frontend": "GAME_FRONTEND_PORT",
            "game_service": "GAME_SERVICE_PORT",
            "devtools": "DEVTOOLS_PORT",
            "admin": "ADMIN_PORT",
            "launcher": "LAUNCHER_PORT",
            "generation_api": "GENERATION_API_PORT",
            "postgres": "POSTGRES_PORT",
            "redis": "REDIS_PORT",
        }.items():
            if key in ports_updates:
                value = ports_updates[key]
                setattr(settings.ports, key, _coerce_int(value, getattr(settings.ports, key)))
                env_updates[env_key] = str(getattr(settings.ports, key))

    base_url_updates = updates.get("base_urls") or {}
    if base_url_updates:
        for key, env_key in {
            "backend": "BACKEND_BASE_URL",
            "generation": "GENERATION_BASE_URL",
            "frontend": "FRONTEND_BASE_URL",
            "game_frontend": "GAME_FRONTEND_BASE_URL",
            "devtools": "DEVTOOLS_BASE_URL",
            "admin": "ADMIN_BASE_URL",
            "launcher": "LAUNCHER_BASE_URL",
            "analysis": "ANALYSIS_BASE_URL",
            "docs": "DOCS_BASE_URL",
        }.items():
            if key in base_url_updates:
                value = _coerce_str(base_url_updates[key], "")
                setattr(settings.base_urls, key, value)
                env_updates[env_key] = _normalize_env_value(value)

    advanced_updates = updates.get("advanced") or {}
    if advanced_updates:
        for key, env_key in {
            "database_url": "DATABASE_URL",
            "redis_url": "REDIS_URL",
            "secret_key": "SECRET_KEY",
            "cors_origins": "CORS_ORIGINS",
            "debug": "DEBUG",
            "service_base_urls": "PIXSIM_SERVICE_BASE_URLS",
            "service_timeouts": "PIXSIM_SERVICE_TIMEOUTS",
        }.items():
            if key in advanced_updates:
                value = _coerce_str(advanced_updates[key], "")
                setattr(settings.advanced, key, value)
                env_updates[env_key] = _normalize_env_value(value)

    if "local_database_url" in datastore_updates:
        env_updates["LOCAL_DATABASE_URL"] = _normalize_env_value(settings.datastores.local_database_url)
    if "local_redis_url" in datastore_updates:
        env_updates["LOCAL_REDIS_URL"] = _normalize_env_value(settings.datastores.local_redis_url)

    profiles_updates = updates.get("profiles") or {}
    if "active" in profiles_updates:
        active = _coerce_str(profiles_updates.get("active"), "")
        settings.profiles.active = active
        env_updates["LAUNCHER_PROFILE"] = _normalize_env_value(active)

    if env_updates:
        _write_env_file(env_updates, root_dir)

    save_launcher_settings(settings, root_dir)

    if apply_env:
        apply_launcher_settings_to_env(settings)

    return settings


def launcher_settings_to_env(settings: LauncherSettings) -> Dict[str, str]:
    env = {
        "SQL_LOGGING_ENABLED": "1" if settings.logging.sql_logging_enabled else "0",
        "LOG_LEVEL": settings.logging.backend_log_level or "INFO",
        "USE_LOCAL_DATASTORES": "1" if settings.datastores.use_local_datastores else "0",
    }
    if settings.logging.worker_debug_flags:
        env["PIXSIM_WORKER_DEBUG"] = settings.logging.worker_debug_flags
    return env


def apply_launcher_settings_to_env(settings: LauncherSettings) -> None:
    env = launcher_settings_to_env(settings)
    for key, value in env.items():
        os.environ[key] = value
    if not settings.logging.worker_debug_flags and "PIXSIM_WORKER_DEBUG" in os.environ:
        del os.environ["PIXSIM_WORKER_DEBUG"]
