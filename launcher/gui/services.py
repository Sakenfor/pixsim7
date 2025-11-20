from dataclasses import dataclass
from typing import List, Dict, Optional
import os

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
