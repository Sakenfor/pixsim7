import os
import subprocess
from typing import Optional, Tuple


def _try_run(cmd, timeout=5) -> Optional[subprocess.CompletedProcess]:
    try:
        import os
        kwargs = {'capture_output': True, 'text': True, 'timeout': timeout}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        return subprocess.run(cmd, **kwargs)
    except Exception:
        return None


def compose_ps(compose_file: str) -> Tuple[bool, str]:
    cmds = [
        ['docker', 'compose', '-f', compose_file, 'ps'],
        ['docker-compose', '-f', compose_file, 'ps'],
    ]
    for cmd in cmds:
        res = _try_run(cmd, timeout=4)
        if res and res.returncode == 0:
            return True, res.stdout
    return False, ''


def compose_up_detached(compose_file: str) -> Tuple[bool, str]:
    cmds = [
        ['docker', 'compose', '-f', compose_file, 'up', '-d'],
        ['docker-compose', '-f', compose_file, 'up', '-d'],
    ]
    for cmd in cmds:
        res = _try_run(cmd, timeout=60)
        if res and res.returncode == 0:
            return True, res.stdout
    # Return last stderr if available
    for cmd in cmds:
        res = _try_run(cmd, timeout=5)
        if res:
            return False, res.stderr
    return False, 'compose up failed'


def compose_down(compose_file: str) -> Tuple[bool, str]:
    cmds = [
        ['docker', 'compose', '-f', compose_file, 'down'],
        ['docker-compose', '-f', compose_file, 'down'],
    ]
    for cmd in cmds:
        res = _try_run(cmd, timeout=60)
        if res and res.returncode == 0:
            return True, res.stdout
    for cmd in cmds:
        res = _try_run(cmd, timeout=5)
        if res:
            return False, res.stderr
    return False, 'compose down failed'
