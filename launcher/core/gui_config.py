"""
Launcher config utilities — Python executable discovery, service env
construction, and UI state persistence.

Settings are managed via the per-service schema system (service_settings.py).
The .env read functions are kept as legacy fallbacks only.
"""
import os
import json
import shutil
from dataclasses import dataclass, asdict
from typing import Dict, Optional


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


# ── Platform settings helpers ──

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


def set_use_local_datastores(enabled: bool) -> None:
    """Set local datastores preference via _platform settings."""
    from launcher.core.service_settings import load_persisted, save_persisted
    p = load_persisted("_platform")
    p["use_local_datastores"] = bool(enabled)
    save_persisted("_platform", p)


# ── Legacy .env readers (fallback only — settings system is source of truth) ──

@dataclass
class Ports:
    backend: int = 8001
    frontend: int = 5173
    game_frontend: int = 5174
    game_service: int = 8050
    devtools: int = 5176
    admin: int = 5175


def read_env_ports(env_path: Optional[str] = None) -> Ports:
    """Read ports from .env file. Legacy fallback — prefer service settings."""
    p = Ports()
    path = env_path or os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        return p
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


def read_env_file(env_path: Optional[str] = None) -> Dict[str, str]:
    """Read all variables from .env file. Legacy fallback — prefer service settings."""
    path = env_path or os.path.join(ROOT, '.env')
    env_vars: Dict[str, str] = {}
    if not os.path.exists(path):
        return env_vars
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip()
    except Exception:
        pass
    return env_vars


# ── Python executable ──

def find_python_executable() -> str:
    """Find Python executable for backend services."""
    venv_py = os.path.join(ROOT, '.venv', 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(ROOT, '.venv', 'bin', 'python')
    if os.path.exists(venv_py):
        return venv_py
    conda_env_py = 'G:/code/conda_envs/pixsim7/python.exe' if os.name == 'nt' else 'G:/code/conda_envs/pixsim7/bin/python'
    if os.path.exists(conda_env_py):
        return conda_env_py
    return 'python'


# ── Service environment ──

def service_env(base_env: Optional[Dict[str, str]] = None, ports: Optional[Ports] = None, sql_logging: Optional[bool] = None) -> Dict[str, str]:
    """Build environment dict for a spawned service process.

    Global exports are applied to os.environ during lifespan startup.
    Only recomputes if critical keys are missing (e.g. running outside API).
    """
    env = dict(base_env or os.environ)

    if "DATABASE_URL" not in env:
        try:
            from launcher.core.service_settings import collect_global_exports
            from launcher.core.services import build_services_from_manifests
            exports = collect_global_exports(build_services_from_manifests())
            for k, v in exports.items():
                if v and k not in env:
                    env[k] = v
        except Exception:
            try:
                for k, v in read_env_file().items():
                    if k not in env:
                        env[k] = v
            except Exception:
                pass

    # Vite env for frontend/devtools
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


# ── Tool availability ──

def check_tool_available(tool: str) -> bool:
    """Check if a tool is available in PATH."""
    if '|' in tool:
        return any(shutil.which(t.strip()) is not None for t in tool.split('|'))
    return shutil.which(tool) is not None


# ── UI State persistence ──

UI_STATE_PATH = os.path.join(os.path.dirname(__file__), 'launcher.json')


@dataclass
class UIState:
    window_x: int = -1
    window_y: int = -1
    window_width: int = 1100
    window_height: int = 700
    window_always_on_top: bool = False
    selected_service: str = ''
    stop_services_on_exit: bool = False
    clear_logs_on_restart: bool = True
    auto_refresh_logs: bool = False
    sql_logging_enabled: bool = False
    worker_debug_flags: str = ""
    backend_debug_enabled: bool = False
    use_local_datastores: bool = False
    autoscroll_enabled: bool = False
    console_style_enhanced: bool = True
    console_level_filter: str = 'All'
    console_scope_filter: str = ''
    console_search_text: str = ''
    health_check_interval: float = 5.0
    health_check_adaptive: bool = True
    health_check_startup_interval: float = 2.0
    health_check_stable_interval: float = 10.0


def load_ui_state() -> UIState:
    """Load UI state from launcher.json."""
    if os.path.exists(UI_STATE_PATH):
        try:
            with open(UI_STATE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                state = UIState(**{k: v for k, v in data.items() if hasattr(UIState, k)})
                return _apply_platform_settings(state)
        except Exception:
            pass
    return _apply_platform_settings(UIState())


def _apply_platform_settings(state: UIState) -> UIState:
    """Sync UI state fields from _platform service settings."""
    try:
        from launcher.core.service_settings import load_persisted
        platform = load_persisted("_platform")
        if platform:
            state.sql_logging_enabled = bool(platform.get("sql_logging", state.sql_logging_enabled))
            state.worker_debug_flags = str(platform.get("worker_debug_flags", state.worker_debug_flags))
            state.use_local_datastores = bool(platform.get("use_local_datastores", state.use_local_datastores))
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
        pass
