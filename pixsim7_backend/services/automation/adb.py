"""
Minimal ADB utilities (async wrappers)
"""
import asyncio
from typing import List, Tuple, Optional
from pathlib import Path
from pixsim7_backend.shared.config import settings


class ADB:
    def __init__(self, adb_path: Optional[str] = None):
        self.adb_path = adb_path or settings.adb_path

    async def _run(self, args: List[str], capture_output: bool = True) -> Tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            self.adb_path,
            *args,
            stdout=asyncio.subprocess.PIPE if capture_output else None,
            stderr=asyncio.subprocess.PIPE if capture_output else None,
        )
        stdout, stderr = await proc.communicate()
        out = stdout.decode() if stdout else ""
        err = stderr.decode() if stderr else ""
        return proc.returncode, out, err

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

    async def exec_out(self, serial: str, *cmd: str) -> bytes:
        proc = await asyncio.create_subprocess_exec(
            self.adb_path,
            "-s",
            serial,
            "exec-out",
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        return stdout or b""

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
        proc = await asyncio.create_subprocess_exec(
            self.adb_path,
            "-s",
            serial,
            "exec-out",
            "cat",
            "/sdcard/uidump.xml",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode("utf-8", errors="ignore")
