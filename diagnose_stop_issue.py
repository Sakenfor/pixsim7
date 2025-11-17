#!/usr/bin/env python3
"""Diagnostic script to see why stop isn't working."""
import sys
import os
import subprocess

sys.path.insert(0, os.path.dirname(__file__))

from scripts.launcher_gui.services import build_services
from scripts.launcher_gui.config import ROOT, read_env_ports
from pixsim7.launcher_core import ProcessManager, ServiceDefinition
from pathlib import Path

# Build services
services = build_services()
ports = read_env_ports()

def convert_service(sdef):
    return ServiceDefinition(
        key=sdef.key,
        title=sdef.title,
        program=sdef.program,
        args=sdef.args,
        cwd=sdef.cwd,
        env_overrides=sdef.env_overrides,
        url=sdef.url,
        health_url=sdef.health_url,
        required_tool=sdef.required_tool,
        health_grace_attempts=sdef.health_grace_attempts,
        depends_on=sdef.depends_on,
    )

core_services = [convert_service(s) for s in services]
log_dir = Path(ROOT) / 'data' / 'logs' / 'console'
pm = ProcessManager(core_services, log_dir=log_dir)

# Check what's on the backend port
print(f"Checking backend on port {ports.backend}...")
print("=" * 60)

# 1. Check if something is listening
print(f"\n1. Checking who's listening on port {ports.backend}:")
if os.name == 'nt':
    # Windows: use netstat
    result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
    pids = []
    if result.returncode == 0:
        for line in result.stdout.split('\n'):
            if f':{ports.backend}' in line and 'LISTENING' in line:
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[-1]
                    pids.append(pid)
                    print(f"   Found PID: {pid} - {line.strip()}")

        if pids:
            # Get process details using tasklist
            for pid in set(pids):  # Remove duplicates
                tasklist_result = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV'],
                                                capture_output=True, text=True)
                if tasklist_result.returncode == 0:
                    lines = tasklist_result.stdout.strip().split('\n')
                    if len(lines) > 1:  # Skip header
                        print(f"   Process details: {lines[1]}")
        else:
            print(f"   No process listening on port {ports.backend}")
            sys.exit(0)
    else:
        print(f"   netstat failed")
        sys.exit(1)
else:
    # Unix: use lsof
    result = subprocess.run(['lsof', '-ti', f':{ports.backend}'],
                           capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        pids = result.stdout.strip().split('\n')
        print(f"   Found PIDs: {pids}")
        for pid in pids:
            # Get process details
            ps_result = subprocess.run(['ps', '-p', pid, '-o', 'pid,cmd'],
                                      capture_output=True, text=True)
            print(f"   {ps_result.stdout.strip()}")
    else:
        print(f"   No process listening on port {ports.backend}")
        sys.exit(0)

# 2. Test PM's detection
print(f"\n2. Testing ProcessManager's PID detection:")
detected_pid = pm._detect_pid_by_port(ports.backend)
print(f"   PM detected PID: {detected_pid}")

# 3. Test port extraction
backend_service = next(s for s in services if s.key == 'backend')
print(f"\n3. Backend health URL: {backend_service.health_url}")
extracted_port = pm._extract_port_from_url(backend_service.health_url)
print(f"   Extracted port: {extracted_port}")

# 4. Check current state
state = pm.get_state('backend')
print(f"\n4. Current backend state:")
print(f"   Status: {state.status.value}")
print(f"   Health: {state.health.value}")
print(f"   PID: {state.pid}")
print(f"   Detected PID: {state.detected_pid}")
print(f"   Process object: {pm.processes.get('backend')}")

# 5. Try the stop with detailed tracing
print(f"\n5. Attempting stop with tracing...")

# Monkey-patch to add debug output
original_kill = pm._kill_process_tree
def debug_kill(pid, force=False):
    print(f"   -> Calling _kill_process_tree(pid={pid}, force={force})")
    try:
        result = original_kill(pid, force)
        print(f"   -> Kill completed")
        return result
    except Exception as e:
        print(f"   -> Kill failed: {e}")
        raise

pm._kill_process_tree = debug_kill

try:
    result = pm.stop('backend', graceful=True)
    print(f"   Stop returned: {result}")
except Exception as e:
    print(f"   Stop raised exception: {e}")
    import traceback
    traceback.print_exc()

# 6. Check if it's still running
print(f"\n6. Checking if still running:")
if os.name == 'nt':
    result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
    found = False
    if result.returncode == 0:
        for line in result.stdout.split('\n'):
            if f':{ports.backend}' in line and 'LISTENING' in line:
                found = True
                print(f"   ✗ STILL RUNNING! {line.strip()}")
    if not found:
        print(f"   ✓ Successfully stopped")
else:
    result = subprocess.run(['lsof', '-ti', f':{ports.backend}'],
                           capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip():
        print(f"   ✗ STILL RUNNING! PIDs: {result.stdout.strip()}")
    else:
        print(f"   ✓ Successfully stopped")
