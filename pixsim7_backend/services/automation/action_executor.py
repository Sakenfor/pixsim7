"""
Action executor for automation presets (ADB-based)

Supports a minimal subset of actions:
- wait
- launch_app
- click_coords
- type_text
- press_back, press_home
- swipe
- screenshot

This can be extended to UIAutomator2 for robust UI element interactions.
"""
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime

from pixsim7_backend.shared.config import settings
from pixsim7_backend.domain.automation import AppActionPreset
from .adb import ADB
import re
import xml.etree.ElementTree as ET


@dataclass
class ExecutionContext:
    serial: str
    variables: Dict[str, Any]
    screenshots_dir: Path


class ActionExecutor:
    def __init__(self, adb: Optional[ADB] = None):
        self.adb = adb or ADB()

    def _subst(self, value: Any, ctx: ExecutionContext) -> Any:
        if isinstance(value, str):
            try:
                return value.format(**ctx.variables)
            except Exception:
                return value
        return value

    async def execute(self, preset: AppActionPreset, ctx: ExecutionContext) -> None:
        actions = preset.actions or []
        for idx, action in enumerate(actions):
            a_type = action.get("type") or action.get("action")
            params = action.get("params", {})
            # Substitute variables in params recursively
            params = {k: self._subst(v, ctx) for k, v in params.items()}

            if a_type == "wait":
                seconds = float(params.get("seconds", 1))
                await asyncio.sleep(seconds)

            elif a_type == "launch_app":
                package = params.get("package") or preset.app_package
                await self.adb.launch_app(ctx.serial, package)

            elif a_type == "click_coords":
                x = int(params["x"])
                y = int(params["y"])
                await self.adb.input_tap(ctx.serial, x, y)

            elif a_type == "type_text":
                text = str(params.get("text", ""))
                await self.adb.input_text(ctx.serial, text)

            elif a_type == "press_back":
                await self.adb.keyevent(ctx.serial, 4)

            elif a_type == "press_home":
                await self.adb.keyevent(ctx.serial, 3)

            elif a_type == "swipe":
                await self.adb.swipe(
                    ctx.serial,
                    int(params.get("x1", 100)),
                    int(params.get("y1", 100)),
                    int(params.get("x2", 100)),
                    int(params.get("y2", 100)),
                    int(params.get("duration_ms", 300)),
                )

            elif a_type == "screenshot":
                ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
                filename = f"shot-{ts}.png"
                dest = ctx.screenshots_dir / filename
                await self.adb.screenshot(ctx.serial, dest)

            else:
                # Unsupported action: skip silently for now
                continue

    # ----- Element-based helpers via UI dump -----
    async def _load_ui(self, serial: str) -> ET.Element | None:
        xml_text = await self.adb.dump_ui_xml(serial)
        try:
            return ET.fromstring(xml_text)
        except Exception:
            return None

    def _parse_bounds(self, bounds: str) -> tuple[int, int, int, int] | None:
        # Bounds like: [x1,y1][x2,y2]
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds or "")
        if not m:
            return None
        x1, y1, x2, y2 = map(int, m.groups())
        return x1, y1, x2, y2

    def _find_element(self, root: ET.Element, resource_id: str | None = None, text: str | None = None, content_desc: str | None = None) -> ET.Element | None:
        # Iterate nodes; UI dump uses nodes named 'node' with attributes: resource-id, text, content-desc, bounds
        for node in root.iter():
            rid = node.attrib.get("resource-id")
            txt = node.attrib.get("text")
            desc = node.attrib.get("content-desc")
            if resource_id and rid == resource_id:
                return node
            if text and txt == text:
                return node
            if content_desc and desc == content_desc:
                return node
        return None

    async def wait_for_element(self, serial: str, resource_id: str | None = None, text: str | None = None, content_desc: str | None = None, timeout: float = 10.0, interval: float = 0.5) -> bool:
        import time
        end = time.time() + timeout
        while time.time() < end:
            root = await self._load_ui(serial)
            if root is not None:
                node = self._find_element(root, resource_id, text, content_desc)
                if node is not None:
                    return True
            await asyncio.sleep(interval)
        return False

    async def click_element(self, serial: str, resource_id: str | None = None, text: str | None = None, content_desc: str | None = None) -> bool:
        root = await self._load_ui(serial)
        if root is None:
            return False
        node = self._find_element(root, resource_id, text, content_desc)
        if node is None:
            return False
        bounds = node.attrib.get("bounds")
        rect = self._parse_bounds(bounds) if bounds else None
        if not rect:
            return False
        x1, y1, x2, y2 = rect
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        await self.adb.input_tap(serial, cx, cy)
        return True

    async def execute(self, preset: AppActionPreset, ctx: ExecutionContext) -> None:  # type: ignore[override]
        # Re-define to handle element actions and conditionals
        actions = preset.actions or []
        for idx, action in enumerate(actions):
            a_type = action.get("type") or action.get("action")
            params = {k: self._subst(v, ctx) for k, v in (action.get("params", {}) or {}).items()}

            if a_type == "wait":
                await asyncio.sleep(float(params.get("seconds", 1)))

            elif a_type == "launch_app":
                await self.adb.launch_app(ctx.serial, params.get("package") or preset.app_package)

            elif a_type == "click_coords":
                await self.adb.input_tap(ctx.serial, int(params["x"]), int(params["y"]))

            elif a_type == "type_text":
                await self.adb.input_text(ctx.serial, str(params.get("text", "")))

            elif a_type == "press_back":
                await self.adb.keyevent(ctx.serial, 4)

            elif a_type == "press_home":
                await self.adb.keyevent(ctx.serial, 3)

            elif a_type == "swipe":
                await self.adb.swipe(
                    ctx.serial,
                    int(params.get("x1", 100)),
                    int(params.get("y1", 100)),
                    int(params.get("x2", 100)),
                    int(params.get("y2", 100)),
                    int(params.get("duration_ms", 300)),
                )

            elif a_type == "screenshot":
                ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
                dest = ctx.screenshots_dir / f"shot-{ts}.png"
                await self.adb.screenshot(ctx.serial, dest)

            elif a_type == "wait_for_element":
                ok = await self.wait_for_element(
                    ctx.serial,
                    resource_id=params.get("resource_id"),
                    text=params.get("text"),
                    content_desc=params.get("content_desc"),
                    timeout=float(params.get("timeout", 10.0)),
                    interval=float(params.get("interval", 0.5)),
                )
                if not ok and not params.get("continue_on_timeout", False):
                    raise RuntimeError("wait_for_element timed out")

            elif a_type == "click_element":
                ok = await self.click_element(
                    ctx.serial,
                    resource_id=params.get("resource_id"),
                    text=params.get("text"),
                    content_desc=params.get("content_desc"),
                )
                if not ok:
                    raise RuntimeError("click_element failed: element not found")

            elif a_type == "if_element_exists":
                root = await self._load_ui(ctx.serial)
                exists = False
                if root is not None:
                    exists = self._find_element(
                        root,
                        resource_id=params.get("resource_id"),
                        text=params.get("text"),
                        content_desc=params.get("content_desc"),
                    ) is not None
                if exists:
                    for sub in params.get("actions", []) or []:
                        # Execute nested actions recursively (shallow for now)
                        await self.execute(AppActionPreset(actions=[sub], name=preset.name, description=preset.description), ctx)  # type: ignore[arg-type]

            elif a_type == "if_element_not_exists":
                root = await self._load_ui(ctx.serial)
                not_exists = True
                if root is not None:
                    not_exists = self._find_element(
                        root,
                        resource_id=params.get("resource_id"),
                        text=params.get("text"),
                        content_desc=params.get("content_desc"),
                    ) is None
                if not_exists:
                    for sub in params.get("actions", []) or []:
                        await self.execute(AppActionPreset(actions=[sub], name=preset.name, description=preset.description), ctx)  # type: ignore[arg-type]

            else:
                # Unsupported action types are best-effort no-ops for now
                continue
