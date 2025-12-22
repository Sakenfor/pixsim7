"""
Minimal ADB utilities (async wrappers)
"""
import asyncio
import subprocess
from typing import List, Tuple, Optional
from pathlib import Path
from pixsim7.backend.main.shared.config import settings


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

    async def connect(self, host_port: str) -> bool:
        """Connect to a device via TCP/IP. Returns True if successful."""
        code, out, err = await self._run(["connect", host_port])
        # Success if output contains "connected to" or "already connected"
        return code == 0 and ("connected to" in out.lower() or "already connected" in out.lower())

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
        # Dump the current UI hierarchy (no delete - just overwrite)
        code, out, err = await self.shell(serial, "uiautomator", "dump", "/sdcard/uidump.xml")
        # Wait for dump to complete
        import asyncio
        await asyncio.sleep(0.3)
        data = await self.exec_out(serial, "cat", "/sdcard/uidump.xml")
        return data.decode("utf-8", errors="ignore")

    async def get_screen_size(self, serial: str) -> Tuple[int, int]:
        """Get screen width and height in pixels."""
        code, out, _ = await self.shell(serial, "wm", "size")
        # Output like: "Physical size: 1080x1920"
        import re
        match = re.search(r"(\d+)x(\d+)", out)
        if match:
            return int(match.group(1)), int(match.group(2))
        return 1080, 1920  # Default fallback

    async def open_deeplink(self, serial: str, uri: str) -> None:
        """Open a deep link URI (e.g., myapp://login, https://app.com/page)."""
        await self.shell(serial, "am", "start", "-a", "android.intent.action.VIEW", "-d", uri)

    async def start_activity(self, serial: str, component: str, extras: Optional[dict] = None) -> None:
        """
        Start a specific activity by component name.

        Args:
            component: Full component name like "com.package/.LoginActivity"
                       or "com.package/com.package.LoginActivity"
            extras: Optional dict of intent extras {"key": "value"}
        """
        args = ["am", "start", "-n", component]
        if extras:
            for key, value in extras.items():
                if isinstance(value, bool):
                    args.extend(["--ez", key, str(value).lower()])
                elif isinstance(value, int):
                    args.extend(["--ei", key, str(value)])
                else:
                    args.extend(["--es", key, str(value)])
        await self.shell(serial, *args)

    async def broadcast(self, serial: str, action: str, extras: Optional[dict] = None) -> None:
        """Send a broadcast intent."""
        args = ["am", "broadcast", "-a", action]
        if extras:
            for key, value in extras.items():
                if isinstance(value, bool):
                    args.extend(["--ez", key, str(value).lower()])
                elif isinstance(value, int):
                    args.extend(["--ei", key, str(value)])
                else:
                    args.extend(["--es", key, str(value)])
        await self.shell(serial, *args)

    async def dump_ui_elements(self, serial: str, filter_text: Optional[str] = None) -> List[dict]:
        """
        Dump all UI elements with their attributes for debugging.
        Optionally filter by text/description containing a string.
        """
        import re
        xml_text = await self.dump_ui_xml(serial)
        import xml.etree.ElementTree as ET

        results = []
        try:
            root = ET.fromstring(xml_text)
            for node in root.iter():
                text = node.attrib.get("text", "")
                desc = node.attrib.get("content-desc", "")
                rid = node.attrib.get("resource-id", "")
                bounds = node.attrib.get("bounds", "")
                cls = node.attrib.get("class", "")

                # Skip empty nodes
                if not text and not desc and not rid:
                    continue

                # Apply filter if specified
                if filter_text:
                    filter_lower = filter_text.lower()
                    if (filter_lower not in text.lower() and
                        filter_lower not in desc.lower() and
                        filter_lower not in rid.lower()):
                        continue

                results.append({
                    "text": text,
                    "content_desc": desc,
                    "resource_id": rid,
                    "class": cls,
                    "bounds": bounds,
                })
        except Exception as e:
            results.append({"error": str(e)})

        return results

    async def get_prop(self, serial: str, property_name: str) -> str:
        """Get a device property via getprop."""
        code, out, _ = await self.shell(serial, "getprop", property_name)
        return out.strip()

    async def get_device_info(self, serial: str) -> dict:
        """
        Get device information by querying multiple properties.
        Returns dict with manufacturer, model, brand, product, and detected device name.
        """
        props = {}
        try:
            # Query multiple properties to identify the device
            prop_names = [
                "ro.product.manufacturer",
                "ro.product.model",
                "ro.product.brand",
                "ro.product.name",
                "ro.build.product",
                "ro.product.device",
            ]

            for prop_name in prop_names:
                value = await self.get_prop(serial, prop_name)
                props[prop_name] = value

            # Detect emulator type from properties
            manufacturer = props.get("ro.product.manufacturer", "").lower()
            model = props.get("ro.product.model", "").lower()
            brand = props.get("ro.product.brand", "").lower()
            product = props.get("ro.product.name", "").lower()

            # Determine friendly device name
            device_name = None
            device_type = "adb"

            if "mumu" in manufacturer or "mumu" in model or "mumu" in product:
                device_name = "MumuPlayer"
                device_type = "mumu"
            elif "bluestacks" in manufacturer or "bluestacks" in model or "bluestacks" in product:
                device_name = "BlueStacks"
                device_type = "bluestacks"
            elif "nox" in manufacturer or "nox" in model or "nox" in product:
                device_name = "NoxPlayer"
                device_type = "nox"
            elif "ldplayer" in manufacturer or "ldplayer" in model or "ldplayer" in product:
                device_name = "LDPlayer"
                device_type = "ld"
            elif "genymotion" in manufacturer or "genymotion" in model:
                device_name = "Genymotion"
                device_type = "genymotion"
            elif model:
                device_name = model.upper()
            elif product:
                device_name = product

            props["detected_name"] = device_name
            props["detected_type"] = device_type

        except Exception as e:
            props["error"] = str(e)

        return props
