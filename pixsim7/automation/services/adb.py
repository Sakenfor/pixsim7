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

    async def get_foreground_package(self, serial: str) -> Optional[str]:
        """
        Get the package name of the currently focused app.
        Returns just the package name (e.g., 'com.pixverseai.pixverse') or None.
        """
        activity = await self.get_focused_activity(serial)
        if activity and "/" in activity:
            # Activity format: "com.package/com.package.Activity" or "com.package/.Activity"
            return activity.split("/")[0]
        return None

    async def launch_app(self, serial: str, package_name: str, force: bool = False) -> bool:
        """
        Launch an app by package name.

        Args:
            serial: Device serial
            package_name: Package to launch
            force: If True, always launch even if already in foreground

        Returns:
            True if app was launched, False if already in foreground (skipped)
        """
        if not force:
            # Check if app is already in foreground
            current_package = await self.get_foreground_package(serial)
            if current_package == package_name:
                return False  # Already running, skip launch

        # Use monkey to launch main activity
        await self.shell(serial, "monkey", "-p", package_name, "-c", "android.intent.category.LAUNCHER", "1")
        return True

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

    async def get_android_id(self, serial: str) -> Optional[str]:
        """
        Get the unique Android ID for the device.
        This is stable across reboots and can identify the same device
        connected via different methods (TCP vs emulator port).
        """
        code, out, _ = await self.shell(serial, "settings", "get", "secure", "android_id")
        android_id = out.strip()
        return android_id if android_id and android_id != "null" else None

    async def get_focused_activity(self, serial: str) -> Optional[str]:
        """
        Get the currently focused activity component name.
        Returns something like 'com.pixverseai.pixverse/.MainActivity' or None.
        """
        import re

        # Use dumpsys window and grep for mFocusedApp
        code, out, _ = await self.shell(serial, "dumpsys window | grep mFocusedApp")

        # Find all mFocusedApp entries - take the last non-null one
        # Output like: mFocusedApp=ActivityRecord{e7fc7d8 u0 com.pixverseai.pixverse/com.google.android.gms.ads.AdActivity t173}
        matches = re.findall(r"mFocusedApp=ActivityRecord\{[^\s]+ u\d+ ([^\s]+)", out)
        # Filter out null entries and return the last valid one
        valid_matches = [m for m in matches if m and m != "null"]
        if valid_matches:
            return valid_matches[-1]

        return None

    # Known ad SDK activity patterns
    AD_ACTIVITY_PATTERNS = [
        "com.google.android.gms.ads",      # Google AdMob
        "com.unity3d.services.ads",         # Unity Ads
        "com.unity3d.ads",                  # Unity Ads (alt)
        "com.applovin",                     # AppLovin
        "com.ironsource",                   # IronSource
        "com.vungle",                       # Vungle
        "com.adcolony",                     # AdColony
        "com.facebook.ads",                 # Facebook Audience Network
        "com.mbridge",                      # Mintegral
        "com.bytedance.sdk.openadsdk",      # Pangle (ByteDance)
        "com.chartboost",                   # Chartboost
        "com.inmobi",                       # InMobi
        "com.tapjoy",                       # Tapjoy
        "com.fyber",                        # Fyber
        "com.smaato",                       # Smaato
    ]

    async def is_ad_playing(self, serial: str) -> Tuple[bool, Optional[str]]:
        """
        Check if an ad is currently playing by examining the focused activity.

        Returns:
            (is_ad, activity_name) - True if ad detected, plus the activity name
        """
        activity = await self.get_focused_activity(serial)
        if not activity:
            return False, None

        activity_lower = activity.lower()
        for pattern in self.AD_ACTIVITY_PATTERNS:
            if pattern.lower() in activity_lower:
                return True, activity

        return False, activity

    async def check_path_exists(self, serial: str, path: str) -> bool:
        """Check if a path exists on the device."""
        code, out, _ = await self.shell(serial, f"ls {path} 2>/dev/null && echo EXISTS")
        return "EXISTS" in out

    async def detect_emulator_by_paths(self, serial: str) -> Optional[Tuple[str, str]]:
        """
        Detect emulator type by checking for emulator-specific paths.
        Returns (device_name, device_type) or None if not detected.

        This is needed because some emulators (like MuMu) spoof device properties
        to look like real devices (e.g., Samsung).
        """
        # MuMu: has /mnt/shared/MuMuShared folder
        if await self.check_path_exists(serial, "/mnt/shared/MuMuShared"):
            return ("MumuPlayer", "mumu")

        # BlueStacks: has specific paths
        if await self.check_path_exists(serial, "/sdcard/windows/BstSharedFolder"):
            return ("BlueStacks", "bluestacks")

        # Nox: has specific paths
        if await self.check_path_exists(serial, "/mnt/shared/Image"):
            # Double-check it's not MuMu (which also has /mnt/shared)
            code, out, _ = await self.shell(serial, "ls /mnt/shared/")
            if "Nox_share" in out or "nox" in out.lower():
                return ("NoxPlayer", "nox")

        # LDPlayer: check for LD-specific paths
        if await self.check_path_exists(serial, "/sdcard/Pictures/ldshare"):
            return ("LDPlayer", "ld")

        return None

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

            # First try property-based detection
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

            # If property-based detection didn't identify an emulator, try path-based detection
            # This handles emulators like MuMu that spoof device properties
            if device_type == "adb":
                path_result = await self.detect_emulator_by_paths(serial)
                if path_result:
                    device_name, device_type = path_result

            # Fallback to model/product name if still not detected
            if device_name is None:
                if model:
                    device_name = model.upper()
                elif product:
                    device_name = product

            props["detected_name"] = device_name
            props["detected_type"] = device_type

        except Exception as e:
            props["error"] = str(e)

        return props
