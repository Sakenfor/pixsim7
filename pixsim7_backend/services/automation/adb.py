"""
Minimal ADB utilities (async wrappers)
"""
import asyncio
import subprocess
from typing import List, Tuple, Optional
from pathlib import Path
from pixsim7_backend.shared.config import settings


class ADB:
    def __init__(self, adb_path: Optional[str] = None):
        self.adb_path = adb_path or settings.adb_path

    def _run_sync(self, args: List[str], capture_output: bool = True) -> Tuple[int, str, str]:
        """Synchronous subprocess execution (used via asyncio.to_thread)"""
        result = subprocess.run(
            [self.adb_path, *args],
            capture_output=capture_output,
            text=True
        )
        return result.returncode, result.stdout or "", result.stderr or ""

    async def _run(self, args: List[str], capture_output: bool = True) -> Tuple[int, str, str]:
        """Run ADB command in thread pool to avoid Windows asyncio subprocess issues"""
        return await asyncio.to_thread(self._run_sync, args, capture_output)

    async def devices(self) -> List[tuple[str, str]]:
        """Return list of (serial, state) from `adb devices`."""
        code, out, _ = await self._run(["devices"])
        lines = out.splitlines()
        devices: List[tuple[str, str]] = []
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
            if "\t" in line:
                serial, state = line.split("\t", 1)
                devices.append((serial, state))
        return devices

    async def shell(self, serial: str, *cmd: str) -> Tuple[int, str, str]:
        return await self._run(["-s", serial, "shell", *cmd])

    def _exec_out_sync(self, serial: str, *cmd: str) -> bytes:
        """Synchronous exec-out command (used via asyncio.to_thread)"""
        result = subprocess.run(
            [self.adb_path, "-s", serial, "exec-out", *cmd],
            capture_output=True
        )
        return result.stdout or b""

    async def exec_out(self, serial: str, *cmd: str) -> bytes:
        """Run ADB exec-out command in thread pool"""
        return await asyncio.to_thread(self._exec_out_sync, serial, *cmd)

    async def input_tap(self, serial: str, x: int, y: int) -> None:
        await self.shell(serial, "input", "tap", str(x), str(y))

    async def input_text(self, serial: str, text: str) -> None:
        # Escape spaces
        text_escaped = text.replace(" ", "%s")
        await self.shell(serial, "input", "text", text_escaped)

    async def keyevent(self, serial: str, keycode: int) -> None:
        await self.shell(serial, "input", "keyevent", str(keycode))

    async def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> None:
        await self.shell(serial, "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms))

    async def launch_app(self, serial: str, package_name: str) -> None:
        # Use monkey to launch main activity
        await self.shell(serial, "monkey", "-p", package_name, "-c", "android.intent.category.LAUNCHER", "1")

    async def screenshot(self, serial: str, dest_path: Path) -> Path:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        data = await self.exec_out(serial, "screencap", "-p")
        dest_path.write_bytes(data)
        return dest_path

    async def dump_ui_xml(self, serial: str) -> str:
        # Dump the current UI hierarchy to a known path and read it
        await self.shell(serial, "uiautomator", "dump", "--compressed", "/sdcard/uidump.xml")
        data = await self.exec_out(serial, "cat", "/sdcard/uidump.xml")
        return data.decode("utf-8", errors="ignore")
