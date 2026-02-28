import os
import subprocess
from typing import Optional, Tuple


def _try_run(cmd, timeout=5) -> Optional[subprocess.CompletedProcess]:
    try:
        kwargs = {'capture_output': True, 'text': True, 'timeout': timeout}
        if os.name == 'nt':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        return subprocess.run(cmd, **kwargs)
    except Exception:
        return None


def _run_compose(
    compose_file: str,
    subcommand: list[str],
    timeout: int = 10,
    fail_msg: str = '',
) -> Tuple[bool, str]:
    """Try ``docker compose`` then ``docker-compose`` with the same args.

    Returns (True, stdout) on success, or (False, stderr/fail_msg) on failure.
    """
    base = ['-f', compose_file] + subcommand
    cmds = [
        ['docker', 'compose'] + base,
        ['docker-compose'] + base,
    ]
    for cmd in cmds:
        res = _try_run(cmd, timeout=timeout)
        if res and res.returncode == 0:
            return True, res.stdout
    # On failure, try once more to capture stderr
    if fail_msg:
        for cmd in cmds:
            res = _try_run(cmd, timeout=5)
            if res:
                return False, res.stderr or fail_msg
    return False, fail_msg


def compose_ps(compose_file: str) -> Tuple[bool, str]:
    return _run_compose(compose_file, ['ps'], timeout=4)


def compose_up_detached(compose_file: str) -> Tuple[bool, str]:
    return _run_compose(compose_file, ['up', '-d'], timeout=60, fail_msg='compose up failed')


def compose_down(compose_file: str) -> Tuple[bool, str]:
    return _run_compose(compose_file, ['down'], timeout=60, fail_msg='compose down failed')


def compose_logs(compose_file: str, tail: int = 100, since: str = None) -> Tuple[bool, str]:
    """Fetch logs from docker-compose containers."""
    args = ['logs', '--no-color', f'--tail={tail}']
    if since:
        args.append(f'--since={since}')
    return _run_compose(compose_file, args, timeout=10)


def get_container_names(compose_file: str) -> list[str]:
    """Get list of container names from a compose file."""
    # docker compose and docker-compose have different format flags
    cmds = [
        ['docker', 'compose', '-f', compose_file, 'ps', '--format', '{{.Name}}'],
        ['docker-compose', '-f', compose_file, 'ps', '-q'],
    ]
    for cmd in cmds:
        res = _try_run(cmd, timeout=5)
        if res and res.returncode == 0:
            names = [n.strip() for n in res.stdout.strip().split('\n') if n.strip()]
            return names
    return []
