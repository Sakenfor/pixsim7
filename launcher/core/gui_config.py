import os
import json
import shutil
from dataclasses import dataclass, asdict
from typing import Dict, Optional

# Legacy import — kept for backward compat with Qt GUI. Will be removed.
try:
    from launcher.core.launcher_settings import (
        load_launcher_settings,
        update_launcher_settings,
        launcher_settings_to_env,
    )
except ImportError:
    load_launcher_settings = None  # type: ignore[assignment]
    update_launcher_settings = None  # type: ignore[assignment]
    launcher_settings_to_env = None  # type: ignore[assignment]

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def set_sql_logging(enabled: bool) -> None:
    """Set SQL logging via _platform settings."""
    from launcher.core.service_settings import load_persisted, save_persisted
    p = load_persisted("_platform")
    p["sql_logging"] = bool(enabled)
    save_persisted("_platform", p)


def set_worker_debug_flags(flags: str) -> None:
    """Set worker debug flags via _platform settings."""
    from launcher.core.service_settings import load_persisted, save_persisted
    p = load_persisted("_platform")
    p["worker_debug_flags"] = flags or ""
    save_persisted("_platform", p)


def set_backend_log_level(level: str) -> None:
    """Set backend log level — no-op, now per-service via log_level setting."""
    pass


def set_use_local_datastores(enabled: bool) -> None:
    """Set local datastores preference via _platform settings."""
    from launcher.core.service_settings import load_persisted, save_persisted
    p = load_persisted("_platform")
    p["use_local_datastores"] = bool(enabled)
    save_persisted("_platform", p)


@dataclass
class Ports:
    backend: int = 8001
    frontend: int = 5173
    game_frontend: int = 5174
    game_service: int = 8050
    devtools: int = 5176
    admin: int = 5175


def read_env_ports(env_path: Optional[str] = None) -> Ports:
    p = Ports()
    path = env_path or os.path.join(ROOT, '.env')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip().upper()
                    v = v.strip()
                    if k == 'BACKEND_PORT':
                        p.backend = int(v)
                    elif k == 'FRONTEND_PORT':
                        p.frontend = int(v)
                    elif k == 'GAME_FRONTEND_PORT':
                        p.game_frontend = int(v)
                    elif k == 'GAME_SERVICE_PORT':
                        p.game_service = int(v)
                    elif k == 'DEVTOOLS_PORT':
                        p.devtools = int(v)
                    elif k == 'ADMIN_PORT':
                        p.admin = int(v)
        except Exception:
            pass
    return p


def write_env_ports(ports: Ports, env_path: Optional[str] = None) -> None:
    """Write port configuration to .env file, updating existing keys or creating new file."""
    path = env_path or os.path.join(ROOT, '.env')
    
    # Read existing .env content
    existing_lines = []
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                existing_lines = f.readlines()
        except Exception:
            pass
    
    # Update or add port entries
    port_keys = {
        'BACKEND_PORT': str(ports.backend),
        'FRONTEND_PORT': str(ports.frontend),
        'GAME_FRONTEND_PORT': str(ports.game_frontend),
        'GAME_SERVICE_PORT': str(ports.game_service),
        'DEVTOOLS_PORT': str(ports.devtools),
        'ADMIN_PORT': str(ports.admin),
    }
    
    updated_keys = set()
    new_lines = []
    
    for line in existing_lines:
        stripped = line.strip()
        if stripped and '=' in stripped and not stripped.startswith('#'):
            key = stripped.split('=', 1)[0].strip().upper()
            if key in port_keys:
                new_lines.append(f'{key}={port_keys[key]}\n')
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    
    # Add any missing keys
    for key, value in port_keys.items():
        if key not in updated_keys:
            new_lines.append(f'{key}={value}\n')
    
    # Write back
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    except Exception as e:
        raise RuntimeError(f'Failed to write .env: {e}')


def find_python_executable() -> str:
    """
    Find Python executable for backend services.
    Priority:
    1. Project .venv if present
    2. pixsim7 conda environment
    3. System 'python'
    """
    # Try .venv first
    venv_py = os.path.join(ROOT, '.venv', 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(ROOT, '.venv', 'bin', 'python')
    if os.path.exists(venv_py):
        return venv_py

    # Try pixsim7 conda env (recommended for pixsim7)
    conda_env_py = 'G:/code/conda_envs/pixsim7/python.exe' if os.name == 'nt' else 'G:/code/conda_envs/pixsim7/bin/python'
    if os.path.exists(conda_env_py):
        return conda_env_py

    # Fallback to system python
    return 'python'


def service_env(base_env: Optional[Dict[str, str]] = None, ports: Optional[Ports] = None, sql_logging: Optional[bool] = None) -> Dict[str, str]:
    """Build the environment dict for a spawned service process.

    Uses :func:`collect_global_exports` as the primary source for platform
    config (DATABASE_URL, SECRET_KEY, ports, base URLs, etc.).  Falls back
    to legacy ``.env`` / ``LauncherSettings`` if exports are unavailable.
    """
    env = dict(base_env or os.environ)

    # Global exports are already in os.environ (applied during lifespan startup).
    # Only recompute if os.environ lacks critical keys (e.g. running outside API).
    if "DATABASE_URL" not in env:
        try:
            from launcher.core.service_settings import collect_global_exports
            from launcher.core.services import build_services_from_manifests
            exports = collect_global_exports(build_services_from_manifests())
            for k, v in exports.items():
                if v and k not in env:
                    env[k] = v
        except Exception:
            # Fallback: merge .env vars
            try:
                for k, v in read_env_file().items():
                    if k not in env:
                        env[k] = v
            except Exception:
                pass

    # Vite env for frontend/devtools (derived from exports/env)
    p = ports or read_env_ports()
    if 'VITE_BACKEND_URL' not in env:
        env['VITE_BACKEND_URL'] = env.get("BACKEND_BASE_URL") or f"http://localhost:{p.backend}"
    if 'VITE_GAME_URL' not in env:
        env['VITE_GAME_URL'] = env.get("GAME_FRONTEND_BASE_URL") or f"http://localhost:{p.game_frontend}"
    if 'VITE_DEVTOOLS_URL' not in env:
        devtools_base_url = env.get("DEVTOOLS_BASE_URL")
        if devtools_base_url:
            env['VITE_DEVTOOLS_URL'] = devtools_base_url
    env.setdefault('PORT', str(p.backend))

    # Build PIXSIM_LOG_DOMAINS from platform settings
    domain_parts: list[str] = []
    if env.get("SQL_LOGGING_ENABLED") == "1" or (sql_logging is True):
        domain_parts.append("sql:DEBUG")
    worker_flags = env.get("PIXSIM_WORKER_DEBUG", "")
    if worker_flags:
        for cat in worker_flags.split(","):
            cat = cat.strip()
            if cat:
                domain_parts.append(f"{cat}:DEBUG")
    if domain_parts:
        existing = env.get("PIXSIM_LOG_DOMAINS", "")
        if existing:
            domain_parts.insert(0, existing)
        env["PIXSIM_LOG_DOMAINS"] = ",".join(domain_parts)

    return env


def check_tool_available(tool: str) -> bool:
    """Check if a tool is available in PATH.
    Supports alternatives with the '|' separator, e.g., 'docker|docker-compose'.
    """
    if '|' in tool:
        return any(shutil.which(t.strip()) is not None for t in tool.split('|'))
    return shutil.which(tool) is not None


# UI State persistence
UI_STATE_PATH = os.path.join(os.path.dirname(__file__), 'launcher.json')


@dataclass
class UIState:
    # Window state
    window_x: int = -1
    window_y: int = -1
    window_width: int = 1100
    window_height: int = 700
    window_always_on_top: bool = False  # Keep window on top of other windows
    selected_service: str = ''

    # General settings
    stop_services_on_exit: bool = False  # If True, stops all services when closing launcher
    clear_logs_on_restart: bool = True  # Clear service log buffer when starting/restarting
    auto_refresh_logs: bool = False     # Enable DB log auto-refresh by default
    sql_logging_enabled: bool = False   # Enable SQLAlchemy query logging (verbose)
    worker_debug_flags: str = ""        # Worker debug categories (comma-separated)
    backend_debug_enabled: bool = False # Toggle backend LOG_LEVEL=DEBUG
    use_local_datastores: bool = False # Prefer local Postgres/Redis over Docker

    # Console settings
    autoscroll_enabled: bool = False    # Auto-scroll console logs to bottom
    console_style_enhanced: bool = True  # Use enhanced readable console view
    console_level_filter: str = 'All'   # Console log level filter
    console_scope_filter: str = ''      # Active scope keys (comma-separated, e.g. "channel:api,domain:generation")
    console_search_text: str = ''       # Console search text

    # Health check settings
    health_check_interval: float = 5.0  # Seconds between health checks (default: 5s)
    health_check_adaptive: bool = True  # Use adaptive intervals (fast on startup, slow when stable)
    health_check_startup_interval: float = 2.0  # Fast interval during service startup
    health_check_stable_interval: float = 10.0  # Slow interval when all services stable


def load_ui_state() -> UIState:
    """Load UI state from launcher.json with backward-compatible defaults."""
    if os.path.exists(UI_STATE_PATH):
        try:
            with open(UI_STATE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Provide defaults for newly added keys (backwards compatibility)
                if 'stop_services_on_exit' not in data:
                    data['stop_services_on_exit'] = False
                if 'auto_refresh_logs' not in data:
                    data['auto_refresh_logs'] = False
                if 'sql_logging_enabled' not in data:
                    data['sql_logging_enabled'] = False
                if 'worker_debug_flags' not in data:
                    data['worker_debug_flags'] = ""
                if 'backend_debug_enabled' not in data:
                    data['backend_debug_enabled'] = False
                if 'use_local_datastores' not in data:
                    data['use_local_datastores'] = False
                if 'window_always_on_top' not in data:
                    data['window_always_on_top'] = False
                if 'health_check_interval' not in data:
                    data['health_check_interval'] = 5.0
                if 'health_check_adaptive' not in data:
                    data['health_check_adaptive'] = True
                if 'health_check_startup_interval' not in data:
                    data['health_check_startup_interval'] = 2.0
                if 'health_check_stable_interval' not in data:
                    data['health_check_stable_interval'] = 10.0
                state = UIState(**data)
                return _apply_launcher_settings(state)
        except Exception:
            pass
    return _apply_launcher_settings(UIState())


def _apply_launcher_settings(state: UIState) -> UIState:
    """Sync UI state fields from platform settings (or legacy LauncherSettings)."""
    try:
        from launcher.core.service_settings import load_persisted
        platform = load_persisted("_platform")
        if platform:
            state.sql_logging_enabled = bool(platform.get("sql_logging", state.sql_logging_enabled))
            state.worker_debug_flags = str(platform.get("worker_debug_flags", state.worker_debug_flags))
            state.use_local_datastores = bool(platform.get("use_local_datastores", state.use_local_datastores))
            return state
    except Exception:
        pass
    # Legacy fallback
    if not load_launcher_settings:
        return state
    try:
        settings = load_launcher_settings()
        state.sql_logging_enabled = settings.logging.sql_logging_enabled
        state.worker_debug_flags = settings.logging.worker_debug_flags
        state.backend_debug_enabled = settings.logging.backend_log_level.upper() == "DEBUG"
        state.use_local_datastores = settings.datastores.use_local_datastores
    except Exception:
        pass
    return state


def save_ui_state(state: UIState) -> None:
    """Save UI state to launcher.json."""
    try:
        os.makedirs(os.path.dirname(UI_STATE_PATH), exist_ok=True)
        with open(UI_STATE_PATH, 'w', encoding='utf-8') as f:
            json.dump(asdict(state), f, indent=2)
    except Exception:
        pass  # Don't crash on save failure


def read_env_file(env_path: Optional[str] = None) -> Dict[str, str]:
    """Read all environment variables from .env file."""
    path = env_path or os.path.join(ROOT, '.env')
    env_vars = {}

    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip()
                    env_vars[k] = v
        except Exception:
            pass

    return env_vars


def write_env_file(env_vars: Dict[str, Optional[str]], env_path: Optional[str] = None) -> None:
    """Write environment variables to .env file (None values remove keys)."""
    path = env_path or os.path.join(ROOT, '.env')

    # Read existing .env to preserve comments and order
    existing_lines = []
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                existing_lines = f.readlines()
        except Exception:
            pass

    updated_keys = set()
    new_lines = []

    # Update existing keys (skip keys set to None)
    for line in existing_lines:
        stripped = line.strip()
        if stripped and '=' in stripped and not stripped.startswith('#'):
            key = stripped.split('=', 1)[0].strip()
            if key in env_vars:
                if env_vars[key] is None:
                    updated_keys.add(key)
                    continue
                new_lines.append(f'{key}={env_vars[key]}\n')
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    # Add new keys
    for key, value in sorted(env_vars.items()):
        if key not in updated_keys and value is not None:
            new_lines.append(f'{key}={value}\n')

    # Write back
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    except Exception as e:
        raise RuntimeError(f'Failed to write .env: {e}')
