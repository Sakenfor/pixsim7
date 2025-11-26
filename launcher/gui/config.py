import os
import json
import shutil
from dataclasses import dataclass, asdict
from typing import Dict, Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Global setting for SQL logging (set by launcher on startup)
_sql_logging_enabled = False


def set_sql_logging(enabled: bool) -> None:
    """Set the global SQL logging preference."""
    global _sql_logging_enabled
    _sql_logging_enabled = enabled


@dataclass
class Ports:
    backend: int = 8001
    admin: int = 8002
    frontend: int = 5173
    game_frontend: int = 5174
    game_service: int = 8050


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
                    elif k == 'ADMIN_PORT':
                        p.admin = int(v)
                    elif k == 'FRONTEND_PORT':
                        p.frontend = int(v)
                    elif k == 'GAME_FRONTEND_PORT':
                        p.game_frontend = int(v)
                    elif k == 'GAME_SERVICE_PORT':
                        p.game_service = int(v)
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
        'ADMIN_PORT': str(ports.admin),
        'FRONTEND_PORT': str(ports.frontend),
        'GAME_FRONTEND_PORT': str(ports.game_frontend),
        'GAME_SERVICE_PORT': str(ports.game_service),
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
    # Vite env for admin/frontend
    env['VITE_ADMIN_PORT'] = str(p.admin)
    env['VITE_BACKEND_URL'] = f"http://localhost:{p.backend}"
    env['PORT'] = str(p.backend)  # backend FastAPI if read by app
    # SQL logging control (use parameter if provided, otherwise use global setting)
    sql_log_enabled = sql_logging if sql_logging is not None else _sql_logging_enabled
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
                return UIState(**data)
        except Exception:
            pass
    return UIState()


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


def write_env_file(env_vars: Dict[str, str], env_path: Optional[str] = None) -> None:
    """Write environment variables to .env file."""
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

    # Update existing keys
    for line in existing_lines:
        stripped = line.strip()
        if stripped and '=' in stripped and not stripped.startswith('#'):
            key = stripped.split('=', 1)[0].strip()
            if key in env_vars:
                new_lines.append(f'{key}={env_vars[key]}\n')
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    # Add new keys
    for key, value in sorted(env_vars.items()):
        if key not in updated_keys:
            new_lines.append(f'{key}={value}\n')

    # Write back
    try:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    except Exception as e:
        raise RuntimeError(f'Failed to write .env: {e}')
