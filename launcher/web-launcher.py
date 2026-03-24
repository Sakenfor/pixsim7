"""
PixSim7 Web Launcher — interactive arrow-key menu.

Run: python launcher/web-launcher.py
  or: launcher/web-launcher.bat
"""

import os
import sys
import socket
import subprocess
import msvcrt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

# ── ANSI helpers ──

def _ansi(code: str) -> str:
    return f"\033[{code}m"

RST   = _ansi("0")
DIM   = _ansi("90")
BOLD  = _ansi("1")
WHITE = _ansi("97")
CYAN  = _ansi("96")
GREEN = _ansi("92")
YELLO = _ansi("93")
RED   = _ansi("91")
BLUE  = _ansi("94")
MAGEN = _ansi("95")
BG_SEL = _ansi("44")   # blue background for selected row
FG_SEL = _ansi("97;1") # bright white text for selected row

CLEAR = "\033[2J\033[H"

# ── Port detection ──

def port_alive(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0

def build_exists() -> bool:
    return (ROOT / "apps" / "launcher" / "dist" / "index.html").exists()

# ── Find python ──

def find_python() -> str:
    venv = ROOT / ".venv" / "Scripts" / "python.exe"
    return str(venv) if venv.exists() else "python"

PY = find_python()

# ── Menu items ──

class MenuItem:
    def __init__(self, label: str, hint: str, action, color: str = WHITE, separator_before: bool = False, section: str = ""):
        self.label = label
        self.hint = hint
        self.action = action  # callable or None
        self.color = color
        self.separator_before = separator_before
        self.section = section

def make_items():
    return [
        MenuItem("WebView Launcher",       "embedded window + built React UI",   run_webview_prod,  GREEN, section="Launch"),
        MenuItem("WebView Launcher (dev)", "embedded window + Vite HMR",         run_webview_dev,   GREEN),
        MenuItem("API Server",             "REST + WebSocket on :8100",           run_api,           BLUE,  separator_before=True, section="Servers"),
        MenuItem("Vite Dev Server",        "React hot-reload on :3100",           run_vite,          BLUE),
        MenuItem("Build React UI",         "production bundle",                   run_build,         YELLO, separator_before=True, section="Tools"),
        MenuItem("Open Browser (prod)",    "http://localhost:8100",               run_open_prod,     YELLO),
        MenuItem("Open Browser (dev)",     "http://localhost:3100",               run_open_dev,      YELLO),
        MenuItem("Legacy PySide6 GUI",     "old Qt desktop launcher",             run_legacy,        MAGEN, separator_before=True),
        MenuItem("Quit",                   "",                                    None,              RED),
    ]

# ── Drawing ──

W = 60  # inner width

def draw(items: list[MenuItem], cursor: int):
    api_up   = port_alive(8100)
    vite_up  = port_alive(3100)
    built    = build_exists()

    lines: list[str] = []
    a = lines.append

    a("")
    a(f"  {DIM}{'=' * (W + 4)}{RST}")
    a(f"  {DIM}|{RST}  {BOLD}{CYAN}PixSim7 Web Launcher{RST}{' ' * (W - 22)}{DIM}|{RST}")
    a(f"  {DIM}{'=' * (W + 4)}{RST}")
    a("")

    # Status row
    def status(label: str, ok: bool, detail: str = ""):
        dot = f"{GREEN}●{RST}" if ok else f"{RED}●{RST}"
        txt = f"{GREEN}running{RST}" if ok else f"{DIM}offline{RST}"
        if detail and ok:
            txt = f"{GREEN}{detail}{RST}"
        return f"    {dot}  {DIM}{label:<16}{RST}{txt}"

    a(status("API Server", api_up, ":8100"))
    a(status("Vite Dev", vite_up, ":3100"))
    bld = f"{GREEN}ready{RST}" if built else f"{DIM}not built{RST}"
    a(f"    {GREEN if built else DIM}●{RST}  {DIM}{'React Build':<16}{RST}{bld}")
    a("")
    a(f"  {DIM}{'-' * (W + 4)}{RST}")
    a("")

    # Menu items
    for i, item in enumerate(items):
        if item.separator_before and i > 0:
            a("")
        if item.section:
            a(f"    {DIM}{item.section}{RST}")

        selected = (i == cursor)
        if selected:
            marker = f"{BG_SEL}{FG_SEL}  > {RST}"
            label  = f"{BG_SEL}{FG_SEL} {item.label:<25}{RST}"
            hint   = f"  {DIM}{item.hint}{RST}" if item.hint else ""
        else:
            marker = "    "
            label  = f"  {item.color}{item.label}{RST}"
            hint   = f"{'':>{ 27 - len(item.label)}}{DIM}{item.hint}{RST}" if item.hint else ""

        a(f"  {marker}{label}{hint}")

    a("")
    a(f"  {DIM}{'=' * (W + 4)}{RST}")
    a(f"  {DIM}  ↑↓ navigate   Enter select   Q quit{RST}")
    a("")

    sys.stdout.write(CLEAR + "\n".join(lines) + "\n")
    sys.stdout.flush()

# ── Key reading ──

KEY_UP    = "up"
KEY_DOWN  = "down"
KEY_ENTER = "enter"
KEY_Q     = "q"
KEY_OTHER = "other"

def read_key() -> str:
    ch = msvcrt.getwch()
    if ch in ("\r", "\n"):
        return KEY_ENTER
    if ch in ("q", "Q"):
        return KEY_Q
    if ch == "\x1b":  # ESC or start of escape sequence
        return KEY_Q
    if ch == "\x00" or ch == "\xe0":
        # Arrow keys send a two-byte sequence
        ch2 = msvcrt.getwch()
        if ch2 == "H":
            return KEY_UP
        if ch2 == "P":
            return KEY_DOWN
        return KEY_OTHER
    return KEY_OTHER

# ── Actions ──

def _run(cmd: list[str], *, shell: bool = False, wait: bool = True):
    sys.stdout.write(CLEAR)
    sys.stdout.flush()
    try:
        if wait:
            subprocess.run(cmd, shell=shell)
        else:
            subprocess.Popen(cmd, shell=shell)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"\n  {RED}Error: {e}{RST}\n")
        input("  Press Enter to continue...")

def run_webview_prod():
    if not build_exists():
        print(f"\n  {YELLO}React UI not built yet. Building...{RST}\n")
        subprocess.run(["pnpm", "--filter", "@pixsim7/launcher", "build"], shell=True)
    _run([PY, "-m", "launcher.gui.webview_launcher"])

def run_webview_dev():
    _run([PY, "-m", "launcher.gui.webview_launcher", "--dev"])

def run_api():
    print(f"\n  {CYAN}Starting API on http://localhost:8100{RST}")
    print(f"  {DIM}Docs: http://localhost:8100/docs{RST}")
    print(f"  {DIM}Press Ctrl+C to stop{RST}\n")
    _run([PY, "-m", "launcher.api.main"])

def run_vite():
    print(f"\n  {CYAN}Starting Vite on http://localhost:3100{RST}")
    print(f"  {DIM}Press Ctrl+C to stop{RST}\n")
    _run(["pnpm", "--filter", "@pixsim7/launcher", "dev"], shell=True)

def run_build():
    print(f"\n  {CYAN}Building React launcher UI...{RST}\n")
    result = subprocess.run(["pnpm", "--filter", "@pixsim7/launcher", "build"], shell=True)
    if result.returncode == 0:
        print(f"\n  {GREEN}Build complete{RST}\n")
    else:
        print(f"\n  {RED}Build failed{RST}\n")
    input("  Press Enter to continue...")

def run_open_prod():
    os.startfile("http://localhost:8100")

def run_open_dev():
    os.startfile("http://localhost:3100")

def run_legacy():
    _run([PY, "-m", "launcher.gui.launcher"])

# ── Main loop ──

def main():
    # Enable ANSI on Windows
    os.system("")

    items = make_items()
    cursor = 0

    while True:
        draw(items, cursor)
        key = read_key()

        if key == KEY_UP:
            cursor = (cursor - 1) % len(items)
        elif key == KEY_DOWN:
            cursor = (cursor + 1) % len(items)
        elif key == KEY_ENTER:
            item = items[cursor]
            if item.action is None:
                break
            item.action()
        elif key == KEY_Q:
            break

    sys.stdout.write(CLEAR)
    print(f"  {DIM}Goodbye.{RST}\n")


if __name__ == "__main__":
    main()
