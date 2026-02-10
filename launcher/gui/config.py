import os
import json
import shutil
from dataclasses import dataclass, asdict
from typing import Dict, Optional

try:
    from launcher.core.launcher_settings import (
        load_launcher_settings,
        update_launcher_settings,
        launcher_settings_to_env,
    )
except Exception:
    try:
        from core.launcher_settings import (
            load_launcher_settings,
            update_launcher_settings,
            launcher_settings_to_env,
        )
    except Exception:
        load_launcher_settings = None
        update_launcher_settings = None
        launcher_settings_to_env = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Global setting for SQL logging (set by launcher on startup)
_sql_logging_enabled = False

# Global setting for worker debug categories (set by launcher on startup)
_worker_debug_flags = ""
# Global setting for backend log level
_backend_log_level = "INFO"


def set_sql_logging(enabled: bool) -> None:
    """Set the global SQL logging preference."""
    global _sql_logging_enabled
    _sql_logging_enabled = enabled
    if update_launcher_settings:
        update_launcher_settings({"logging": {"sql_logging_enabled": bool(enabled)}})


def set_worker_debug_flags(flags: str) -> None:
    """Set global worker debug categories (comma-separated)."""
    global _worker_debug_flags
    _worker_debug_flags = flags or ""
    if update_launcher_settings:
        update_launcher_settings({"logging": {"worker_debug_flags": _worker_debug_flags}})


def set_backend_log_level(level: str) -> None:
    """Set global backend log level (LOG_LEVEL env)."""
    global _backend_log_level
    _backend_log_level = (level or "INFO").upper()
    if update_launcher_settings:
        update_launcher_settings({"logging": {"backend_log_level": _backend_log_level}})


def set_use_local_datastores(enabled: bool) -> None:
    """Set preference for local datastores and persist launcher settings."""
    if update_launcher_settings:
        update_launcher_settings({"datastores": {"use_local_datastores": bool(enabled)}})


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
    env = dict(base_env or os.environ)
    # Merge variables from .env so services inherit configuration (DB URLs, keys, etc.)
    try:
        for k, v in read_env_file().items():
            # Don't overwrite explicit environment variables
            if k not in env:
                env[k] = v
    except Exception:
        pass
    p = ports or read_env_ports()
    # Vite env for frontend/devtools
    if 'VITE_BACKEND_URL' not in env:
        backend_base_url = os.getenv("BACKEND_BASE_URL")
        env['VITE_BACKEND_URL'] = backend_base_url or f"http://localhost:{p.backend}"
    if 'VITE_GAME_URL' not in env:
        game_base_url = os.getenv("GAME_FRONTEND_BASE_URL")
        env['VITE_GAME_URL'] = game_base_url or f"http://localhost:{p.game_frontend}"
    if 'VITE_DEVTOOLS_URL' not in env:
        devtools_base_url = os.getenv("DEVTOOLS_BASE_URL")
        # Only set if explicitly configured; the frontend infers the correct
        # proxy URL at runtime via devtoolsUrl.ts (same-origin /devtools path)
        if devtools_base_url:
            env['VITE_DEVTOOLS_URL'] = devtools_base_url
    env['PORT'] = str(p.backend)  # backend FastAPI if read by app
    settings = None
    if load_launcher_settings:
        try:
            settings = load_launcher_settings()
        except Exception:
            settings = None

    if settings and launcher_settings_to_env:
        env.update(launcher_settings_to_env(settings))
    else:
        if _worker_debug_flags:
            env['PIXSIM_WORKER_DEBUG'] = _worker_debug_flags
        env['LOG_LEVEL'] = _backend_log_level
    # SQL logging control (use parameter if provided, otherwise use shared setting if available)
    if sql_logging is not None:
        sql_log_enabled = sql_logging
    elif settings:
        sql_log_enabled = settings.logging.sql_logging_enabled
    else:
        sql_log_enabled = _sql_logging_enabled
    env['SQL_LOGGING_ENABLED'] = '1' if sql_log_enabled else '0'
    # Prefer direct DB ingestion via env if configured globally (.env)
    # If LOG_DATABASE_URL/PIXSIM_LOG_DB_URL exists, pixsim_logging will use it automatically.
    # We intentionally do NOT set PIXSIM_LOG_INGESTION_URL here to avoid routing through backend.
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
    stop_services_on_exit: bool = True  # Graceful shutdown of all services when closing launcher
    auto_refresh_logs: bool = False     # Enable DB log auto-refresh by default
    sql_logging_enabled: bool = False   # Enable SQLAlchemy query logging (verbose)
    worker_debug_flags: str = ""        # Worker debug categories (comma-separated)
    backend_debug_enabled: bool = False # Toggle backend LOG_LEVEL=DEBUG
    use_local_datastores: bool = False # Prefer local Postgres/Redis over Docker

    # Console settings
    autoscroll_enabled: bool = False    # Auto-scroll console logs to bottom
    console_style_enhanced: bool = True  # Use enhanced readable console view
    console_level_filter: str = 'All'   # Console log level filter
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
                    data['stop_services_on_exit'] = True
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
    """Sync UI state fields from launcher settings if available."""
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
