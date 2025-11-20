"""
Service Management API - Control backend, worker, databases
"""
import subprocess
import platform
import psutil
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentAdminUser

router = APIRouter(prefix="/services", tags=["Service Management"])


class ServiceCommand(BaseModel):
    service: str  # backend, worker, postgres, redis, admin
    action: str   # start, stop, restart


class ServiceControlResponse(BaseModel):
    service: str
    action: str
    success: bool
    message: str
    pid: int | None = None


class ProcessInfo(BaseModel):
    name: str
    pid: int
    status: str
    cpu_percent: float
    memory_mb: float


def get_project_root():
    """Get project root directory"""
    import os
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))


def is_windows():
    return platform.system() == "Windows"


def find_process_by_command(command_pattern: str) -> List[ProcessInfo]:
    """Find processes by command line pattern"""
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'status', 'cpu_percent', 'memory_info']):
        try:
            cmdline = ' '.join(proc.info['cmdline'] or [])
            if command_pattern.lower() in cmdline.lower():
                processes.append(ProcessInfo(
                    name=proc.info['name'],
                    pid=proc.info['pid'],
                    status=proc.info['status'],
                    cpu_percent=proc.info['cpu_percent'] or 0.0,
                    memory_mb=proc.info['memory_info'].rss / 1024 / 1024 if proc.info['memory_info'] else 0.0
                ))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return processes


@router.post("/control", response_model=ServiceControlResponse)
async def control_service(
    command: ServiceCommand,
    admin: CurrentAdminUser
):
    """
    Control services (start/stop/restart)

    Services:
    - backend: FastAPI server
    - worker: ARQ worker
    - postgres: PostgreSQL (via Docker)
    - redis: Redis (via Docker)
    - admin: Admin panel (Vite dev server)
    """
    root = get_project_root()

    try:
        if command.service == "backend":
            if command.action == "start":
                return await start_backend(root)
            elif command.action == "stop":
                return await stop_backend()
            elif command.action == "restart":
                await stop_backend()
                return await start_backend(root)

        elif command.service == "worker":
            if command.action == "start":
                return await start_worker(root)
            elif command.action == "stop":
                return await stop_worker()
            elif command.action == "restart":
                await stop_worker()
                return await start_worker(root)

        elif command.service in ["postgres", "redis"]:
            return await control_docker_service(command.service, command.action)

        elif command.service == "admin":
            if command.action == "start":
                return await start_admin(root)
            elif command.action == "stop":
                return await stop_admin()
            elif command.action == "restart":
                await stop_admin()
                return await start_admin(root)

        raise HTTPException(status_code=400, detail=f"Unknown service or action: {command.service}/{command.action}")

    except Exception as e:
        return ServiceControlResponse(
            service=command.service,
            action=command.action,
            success=False,
            message=str(e)
        )


async def start_backend(root: str) -> ServiceControlResponse:
    """Start backend server"""
    # Check if already running
    procs = find_process_by_command("pixsim7/backend/main/main.py")
    if procs:
        return ServiceControlResponse(
            service="backend",
            action="start",
            success=False,
            message=f"Backend already running (PID: {procs[0].pid})",
            pid=procs[0].pid
        )

    if is_windows():
        cmd = f'start "PixSim7 Backend" /min cmd /c "set PYTHONPATH={root} && python {root}\\pixsim7\\backend\\main\\main.py"'
        subprocess.Popen(cmd, shell=True)
    else:
        cmd = f'PYTHONPATH={root} nohup python {root}/pixsim7/backend/main/main.py > /dev/null 2>&1 &'
        subprocess.Popen(cmd, shell=True, executable='/bin/bash')

    return ServiceControlResponse(
        service="backend",
        action="start",
        success=True,
        message="Backend starting..."
    )


async def stop_backend() -> ServiceControlResponse:
    """Stop backend server"""
    procs = find_process_by_command("pixsim7/backend/main/main.py")

    if not procs:
        return ServiceControlResponse(
            service="backend",
            action="stop",
            success=False,
            message="Backend not running"
        )

    for proc_info in procs:
        try:
            proc = psutil.Process(proc_info.pid)
            proc.terminate()
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            proc.kill()
        except Exception:
            pass

    return ServiceControlResponse(
        service="backend",
        action="stop",
        success=True,
        message=f"Stopped {len(procs)} backend process(es)"
    )


async def start_worker(root: str) -> ServiceControlResponse:
    """Start ARQ worker"""
    procs = find_process_by_command("arq pixsim7.backend.main.workers")
    if procs:
        return ServiceControlResponse(
            service="worker",
            action="start",
            success=False,
            message=f"Worker already running (PID: {procs[0].pid})",
            pid=procs[0].pid
        )

    if is_windows():
        cmd = f'start "PixSim7 Worker" /min cmd /c "set PYTHONPATH={root} && arq pixsim7.backend.main.workers.arq_worker.WorkerSettings"'
        subprocess.Popen(cmd, shell=True)
    else:
        cmd = f'PYTHONPATH={root} nohup arq pixsim7.backend.main.workers.arq_worker.WorkerSettings > /dev/null 2>&1 &'
        subprocess.Popen(cmd, shell=True, executable='/bin/bash')

    return ServiceControlResponse(
        service="worker",
        action="start",
        success=True,
        message="Worker starting..."
    )


async def stop_worker() -> ServiceControlResponse:
    """Stop ARQ worker"""
    procs = find_process_by_command("arq pixsim7.backend.main.workers")

    if not procs:
        return ServiceControlResponse(
            service="worker",
            action="stop",
            success=False,
            message="Worker not running"
        )

    for proc_info in procs:
        try:
            proc = psutil.Process(proc_info.pid)
            proc.terminate()
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            proc.kill()
        except Exception:
            pass

    return ServiceControlResponse(
        service="worker",
        action="stop",
        success=True,
        message=f"Stopped {len(procs)} worker process(es)"
    )


async def control_docker_service(service: str, action: str) -> ServiceControlResponse:
    """Control Docker services (postgres, redis)"""
    compose_file = "docker-compose.db-only.yml"

    try:
        if action == "start":
            subprocess.run(
                ["docker-compose", "-f", compose_file, "up", "-d", service],
                check=True,
                capture_output=True
            )
            message = f"{service} started"
        elif action == "stop":
            subprocess.run(
                ["docker-compose", "-f", compose_file, "stop", service],
                check=True,
                capture_output=True
            )
            message = f"{service} stopped"
        elif action == "restart":
            subprocess.run(
                ["docker-compose", "-f", compose_file, "restart", service],
                check=True,
                capture_output=True
            )
            message = f"{service} restarted"
        else:
            raise ValueError(f"Unknown action: {action}")

        return ServiceControlResponse(
            service=service,
            action=action,
            success=True,
            message=message
        )
    except subprocess.CalledProcessError as e:
        return ServiceControlResponse(
            service=service,
            action=action,
            success=False,
            message=f"Docker error: {e.stderr.decode() if e.stderr else str(e)}"
        )


async def start_admin(root: str) -> ServiceControlResponse:
    """Start admin panel (Vite dev server)"""
    procs = find_process_by_command("vite")
    admin_procs = [p for p in procs if "admin" in ' '.join(psutil.Process(p.pid).cmdline())]

    if admin_procs:
        return ServiceControlResponse(
            service="admin",
            action="start",
            success=False,
            message=f"Admin panel already running (PID: {admin_procs[0].pid})",
            pid=admin_procs[0].pid
        )

    admin_dir = f"{root}/admin" if not is_windows() else f"{root}\\admin"

    if is_windows():
        cmd = f'start "PixSim7 Admin" /min cmd /c "cd {admin_dir} && npm run dev"'
        subprocess.Popen(cmd, shell=True)
    else:
        cmd = f'cd {admin_dir} && nohup npm run dev > /dev/null 2>&1 &'
        subprocess.Popen(cmd, shell=True, executable='/bin/bash')

    return ServiceControlResponse(
        service="admin",
        action="start",
        success=True,
        message="Admin panel starting..."
    )


async def stop_admin() -> ServiceControlResponse:
    """Stop admin panel"""
    procs = find_process_by_command("vite")
    admin_procs = [p for p in procs if "admin" in ' '.join(psutil.Process(p.pid).cmdline())]

    if not admin_procs:
        return ServiceControlResponse(
            service="admin",
            action="stop",
            success=False,
            message="Admin panel not running"
        )

    for proc_info in admin_procs:
        try:
            proc = psutil.Process(proc_info.pid)
            proc.terminate()
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            proc.kill()
        except Exception:
            pass

    return ServiceControlResponse(
        service="admin",
        action="stop",
        success=True,
        message=f"Stopped {len(admin_procs)} admin panel process(es)"
    )


@router.get("/processes")
async def list_processes(admin: CurrentAdminUser) -> List[ProcessInfo]:
    """List all PixSim7 related processes"""
    all_processes = []

    patterns = [
        "pixsim7/backend/main",
        "arq pixsim7",
        "vite",  # admin panel
    ]

    for pattern in patterns:
        all_processes.extend(find_process_by_command(pattern))

    return all_processes
