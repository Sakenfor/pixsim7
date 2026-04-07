"""
Launcher environment — project root, Python executable, and tool discovery.
"""
import os
import shutil


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def find_python_executable() -> str:
    """Find Python executable for backend services."""
    venv_py = os.path.join(ROOT, '.venv', 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(ROOT, '.venv', 'bin', 'python')
    if os.path.exists(venv_py):
        return venv_py
    conda_env_py = 'G:/code/conda_envs/pixsim7/python.exe' if os.name == 'nt' else 'G:/code/conda_envs/pixsim7/bin/python'
    if os.path.exists(conda_env_py):
        return conda_env_py
    return 'python'


def check_tool_available(tool: str) -> bool:
    """Check if a tool is available in PATH."""
    if '|' in tool:
        return any(shutil.which(t.strip()) is not None for t in tool.split('|'))
    return shutil.which(tool) is not None
