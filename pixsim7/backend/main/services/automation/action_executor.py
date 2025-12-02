"""
Action executor for automation presets.

Supports a minimal subset of actions:
- wait
- launch_app
- click_coords
- type_text
- press_back, press_home
- swipe
- screenshot

Uses UIAutomator2 for element-based interactions (more reliable than raw ADB).
Falls back to ADB for basic commands (tap, swipe, keyevent).
"""
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Callable, Awaitable
from datetime import datetime
import logging

from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.domain.automation import AppActionPreset
from .adb import ADB
from .uia2 import UIA2
import re
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)


@dataclass
class ExecutionContext:
    serial: str
    variables: Dict[str, Any]
    screenshots_dir: Path
    # Track execution progress for error reporting
    current_action_index: int = 0
    total_actions: int = 0
    # Track nested action path for detailed error reporting (e.g., [2, 0, 1] = action 2 > nested 0 > nested 1)
    action_path: list = None
    # Track condition results for IF actions: {path_key: bool} e.g. {"0": true, "2.1": false}
    condition_results: Dict[str, bool] = None
    # Track preset call stack for circular reference detection in call_preset
    preset_call_stack: list = None

    def __post_init__(self):
        if self.action_path is None:
            self.action_path = []
        if self.condition_results is None:
            self.condition_results = {}
        if self.preset_call_stack is None:
            self.preset_call_stack = []

    def get_current_path_key(self, action_index: int) -> str:
        """Get a string key for current action path, e.g. '2.0.1'"""
        full_path = [action_index] + list(self.action_path)
        return '.'.join(str(i) for i in full_path)


class ExecutionError(Exception):
    """Exception with detailed context about which action failed"""
    def __init__(self, message: str, action_index: int, action_type: str, action_params: Dict[str, Any], action_path: list = None):
        super().__init__(message)
        self.action_index = action_index
        self.action_type = action_type
        self.action_params = action_params
        self.action_path = action_path or [action_index]  # Full path for nested actions


class ActionExecutor:
    def __init__(
        self,
        adb: Optional[ADB] = None,
        preset_loader: Optional[Callable[[int], Awaitable[Optional[AppActionPreset]]]] = None
    ):
        self.adb = adb or ADB()
        self._screen_size_cache: Dict[str, tuple[int, int]] = {}
        self._preset_loader = preset_loader

    async def _get_screen_size(self, serial: str) -> tuple[int, int]:
        """Get cached screen size for a device."""
        if serial not in self._screen_size_cache:
            self._screen_size_cache[serial] = await self.adb.get_screen_size(serial)
        return self._screen_size_cache[serial]

    async def _resolve_coord(self, value: float, dimension: int) -> int:
        """
        Resolve coordinate value to pixels.
        - If 0 < value <= 1: treat as percentage of dimension
        - Otherwise: treat as absolute pixels
        """
        if 0 < value <= 1:
            return int(value * dimension)
        return int(value)

    async def _resolve_coords(self, serial: str, x: float, y: float) -> tuple[int, int]:
        """Resolve x,y coordinates (supports both percentage 0-1 and absolute pixels)."""
        width, height = await self._get_screen_size(serial)
        px = await self._resolve_coord(x, width)
        py = await self._resolve_coord(y, height)
        return px, py

    def _resolve_element_variable(self, params: Dict[str, Any], preset: AppActionPreset) -> Dict[str, Any]:
        """
        If params contains a _variable reference, resolve it from preset.variables
        and return the merged element selector params.
        """
        var_name = params.get("_variable")
        if not var_name or not preset.variables:
            return params

        # Find the variable by name
        variable = next((v for v in preset.variables if v.get("name") == var_name), None)
        if not variable or variable.get("type") != "element":
            return params

        # Get element selector from variable
        element = variable.get("element", {})
        if not element:
            return params

        # Merge variable's element selector with remaining params (like timeout, interval)
        resolved = {**params}
        # Remove the _variable marker
        resolved.pop("_variable", None)
        # Apply element selector from variable
        if element.get("resource_id"):
            resolved["resource_id"] = element["resource_id"]
        if element.get("text"):
            resolved["text"] = element["text"]
        if element.get("text_match_mode"):
            resolved["text_match_mode"] = element["text_match_mode"]
        if element.get("content_desc"):
            resolved["content_desc"] = element["content_desc"]
        if element.get("content_desc_match_mode"):
            resolved["content_desc_match_mode"] = element["content_desc_match_mode"]

        return resolved

    def _subst(self, value: Any, ctx: ExecutionContext) -> Any:
        if isinstance(value, str):
            try:
                return value.format(**ctx.variables)
            except Exception:
                return value
        return value

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

    def _match_text(self, actual: str | None, pattern: str, mode: str = "exact") -> bool:
        """Match text based on match mode"""
        if actual is None:
            return False
        if mode == "exact":
            return actual == pattern
        elif mode == "contains":
            return pattern in actual
        elif mode == "starts_with":
            return actual.startswith(pattern)
        elif mode == "ends_with":
            return actual.endswith(pattern)
        elif mode == "regex":
            try:
                return re.search(pattern, actual) is not None
            except re.error:
                return False
        return actual == pattern  # Default to exact

    def _find_element(
        self,
        root: ET.Element,
        resource_id: str | None = None,
        text: str | None = None,
        text_match_mode: str = "exact",
        content_desc: str | None = None,
        content_desc_match_mode: str = "exact",
    ) -> ET.Element | None:
        # Iterate nodes; UI dump uses nodes named 'node' with attributes: resource-id, text, content-desc, bounds
        for node in root.iter():
            rid = node.attrib.get("resource-id")
            txt = node.attrib.get("text")
            desc = node.attrib.get("content-desc")
            # Resource ID is always exact match
            if resource_id and rid == resource_id:
                return node
            # Text with match mode
            if text and self._match_text(txt, text, text_match_mode):
                return node
            # Content desc with match mode
            if content_desc and self._match_text(desc, content_desc, content_desc_match_mode):
                return node
        return None

    async def wait_for_element(
        self,
        serial: str,
        resource_id: str | None = None,
        text: str | None = None,
        text_match_mode: str = "exact",
        content_desc: str | None = None,
        content_desc_match_mode: str = "exact",
        timeout: float = 10.0,
        interval: float = 0.5,
    ) -> bool:
        """Wait for element using UIAutomator2 (more reliable than ADB dump)."""
        return await UIA2.wait_for_element(
            serial,
            resource_id=resource_id,
            text=text,
            text_match_mode=text_match_mode,
            content_desc=content_desc,
            content_desc_match_mode=content_desc_match_mode,
            timeout=timeout,
        )

    async def click_element(
        self,
        serial: str,
        resource_id: str | None = None,
        text: str | None = None,
        text_match_mode: str = "exact",
        content_desc: str | None = None,
        content_desc_match_mode: str = "exact",
    ) -> bool:
        """Click element using UIAutomator2 (more reliable than ADB dump)."""
        return await UIA2.click_element(
            serial,
            resource_id=resource_id,
            text=text,
            text_match_mode=text_match_mode,
            content_desc=content_desc,
            content_desc_match_mode=content_desc_match_mode,
        )

    async def element_exists(
        self,
        serial: str,
        resource_id: str | None = None,
        text: str | None = None,
        text_match_mode: str = "exact",
        content_desc: str | None = None,
        content_desc_match_mode: str = "exact",
    ) -> bool:
        """Check if element exists using UIAutomator2."""
        el = await UIA2.find_element(
            serial,
            resource_id=resource_id,
            text=text,
            text_match_mode=text_match_mode,
            content_desc=content_desc,
            content_desc_match_mode=content_desc_match_mode,
            timeout=0,  # No wait, just check
        )
        return el is not None

    async def execute_action(self, action: Dict[str, Any], ctx: ExecutionContext, preset: AppActionPreset, action_index: int = 0) -> None:
        """Execute a single action (supports nesting)"""
        # Skip disabled actions
        if action.get("enabled") is False:
            return

        a_type = action.get("type") or action.get("action")
        params = {k: self._subst(v, ctx) for k, v in (action.get("params", {}) or {}).items()}

        # Resolve element variables for element-based actions
        if a_type in ("wait_for_element", "click_element", "if_element_exists", "if_element_not_exists"):
            params = self._resolve_element_variable(params, preset)

        try:
            if a_type == "wait":
                await asyncio.sleep(float(params.get("seconds", 1)))

            elif a_type == "launch_app":
                await self.adb.launch_app(ctx.serial, params.get("package") or preset.app_package)

            elif a_type == "open_deeplink":
                await self.adb.open_deeplink(ctx.serial, params.get("uri", ""))

            elif a_type == "start_activity":
                await self.adb.start_activity(ctx.serial, params.get("component", ""))

            elif a_type == "click_coords":
                # Support both percentage (0-1) and absolute pixel coordinates
                x, y = await self._resolve_coords(ctx.serial, float(params["x"]), float(params["y"]))
                await self.adb.input_tap(ctx.serial, x, y)

            elif a_type == "type_text":
                await self.adb.input_text(ctx.serial, str(params.get("text", "")))

            elif a_type == "press_back":
                await self.adb.keyevent(ctx.serial, 4)

            elif a_type == "emulator_back":
                # Soft back button (not physical/swipe) - navigates back in app
                await self.adb.keyevent(ctx.serial, 4)

            elif a_type == "press_home":
                await self.adb.keyevent(ctx.serial, 3)

            elif a_type == "swipe":
                # Support both percentage (0-1) and absolute pixel coordinates
                x1, y1 = await self._resolve_coords(ctx.serial, float(params.get("x1", 0.5)), float(params.get("y1", 0.5)))
                x2, y2 = await self._resolve_coords(ctx.serial, float(params.get("x2", 0.5)), float(params.get("y2", 0.5)))
                await self.adb.swipe(ctx.serial, x1, y1, x2, y2, int(params.get("duration_ms", 300)))

            elif a_type == "screenshot":
                ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
                dest = ctx.screenshots_dir / f"shot-{ts}.png"
                await self.adb.screenshot(ctx.serial, dest)

            elif a_type == "wait_for_element":
                ok = await self.wait_for_element(
                    ctx.serial,
                    resource_id=params.get("resource_id"),
                    text=params.get("text"),
                    text_match_mode=params.get("text_match_mode", "exact"),
                    content_desc=params.get("content_desc"),
                    content_desc_match_mode=params.get("content_desc_match_mode", "exact"),
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
                    text_match_mode=params.get("text_match_mode", "exact"),
                    content_desc=params.get("content_desc"),
                    content_desc_match_mode=params.get("content_desc_match_mode", "exact"),
                )
                if not ok and not params.get("continue_on_error", False):
                    raise RuntimeError("click_element failed: element not found")

            elif a_type == "if_element_exists":
                # IF checks should NEVER fail - they're conditions, not assertions
                # Even if element check errors out, treat it as "condition not met"
                try:
                    exists = await self.element_exists(
                        ctx.serial,
                        resource_id=params.get("resource_id"),
                        text=params.get("text"),
                        text_match_mode=params.get("text_match_mode", "exact"),
                        content_desc=params.get("content_desc"),
                        content_desc_match_mode=params.get("content_desc_match_mode", "exact"),
                    )
                except Exception as check_err:
                    logger.warning("if_element_check_error err=%s action_type=%s", str(check_err), a_type)
                    exists = False  # On error, treat as "not found"

                # Record condition result for UI feedback
                path_key = ctx.get_current_path_key(action_index)
                ctx.condition_results[path_key] = exists
                if exists:
                    # Execute nested actions recursively (fully nested support)
                    nested_actions = params.get("actions", []) or []
                    for nested_idx, nested_action in enumerate(nested_actions):
                        ctx.action_path.append(nested_idx)
                        try:
                            await self.execute_action(nested_action, ctx, preset, action_index)
                        finally:
                            ctx.action_path.pop()
                else:
                    # Execute else_actions if condition not met
                    else_actions = params.get("else_actions", []) or []
                    for nested_idx, nested_action in enumerate(else_actions):
                        ctx.action_path.append(f"else:{nested_idx}")
                        try:
                            await self.execute_action(nested_action, ctx, preset, action_index)
                        finally:
                            ctx.action_path.pop()

            elif a_type == "if_element_not_exists":
                # IF checks should NEVER fail - they're conditions, not assertions
                # Even if element check errors out, treat it as "element not found" = condition met
                try:
                    exists = await self.element_exists(
                        ctx.serial,
                        resource_id=params.get("resource_id"),
                        text=params.get("text"),
                        text_match_mode=params.get("text_match_mode", "exact"),
                        content_desc=params.get("content_desc"),
                        content_desc_match_mode=params.get("content_desc_match_mode", "exact"),
                    )
                except Exception as check_err:
                    logger.warning("if_element_check_error err=%s action_type=%s", str(check_err), a_type)
                    exists = False  # On error, treat as "not found"

                not_exists = not exists
                # Record condition result for UI feedback (true = element not found = condition met)
                path_key = ctx.get_current_path_key(action_index)
                ctx.condition_results[path_key] = not_exists
                if not_exists:
                    # Execute nested actions recursively
                    nested_actions = params.get("actions", []) or []
                    for nested_idx, nested_action in enumerate(nested_actions):
                        ctx.action_path.append(nested_idx)
                        try:
                            await self.execute_action(nested_action, ctx, preset, action_index)
                        finally:
                            ctx.action_path.pop()
                else:
                    # Execute else_actions if condition not met (element exists)
                    else_actions = params.get("else_actions", []) or []
                    for nested_idx, nested_action in enumerate(else_actions):
                        ctx.action_path.append(f"else:{nested_idx}")
                        try:
                            await self.execute_action(nested_action, ctx, preset, action_index)
                        finally:
                            ctx.action_path.pop()

            elif a_type == "repeat":
                # Repeat nested actions N times or while condition is met
                count = int(params.get("count", 1))
                max_iterations = int(params.get("max_iterations", 100))  # Safety limit
                nested_actions = params.get("actions", []) or []

                for i in range(min(count, max_iterations)):
                    for nested_idx, nested_action in enumerate(nested_actions):
                        ctx.action_path.append(nested_idx)
                        try:
                            await self.execute_action(nested_action, ctx, preset, action_index)
                        finally:
                            ctx.action_path.pop()
                    # Optional: add delay between iterations
                    if "delay_between" in params:
                        await asyncio.sleep(float(params["delay_between"]))

            elif a_type == "call_preset":
                # Execute another preset's actions inline
                called_preset_id = int(params.get("preset_id", 0))
                inherit_variables = params.get("inherit_variables", True)

                logger.info("call_preset_start preset_id=%s inherit_variables=%s", called_preset_id, inherit_variables)

                if not called_preset_id:
                    raise RuntimeError("call_preset: preset_id is required (got 0 or empty)")

                if not self._preset_loader:
                    raise RuntimeError("call_preset: no preset loader configured - this may happen in test mode")

                # Check for circular reference
                if called_preset_id in ctx.preset_call_stack:
                    call_chain = " -> ".join(str(pid) for pid in ctx.preset_call_stack + [called_preset_id])
                    raise RuntimeError(f"call_preset: circular reference detected: {call_chain}")

                # Load the called preset
                try:
                    called_preset = await self._preset_loader(called_preset_id)
                except Exception as load_err:
                    logger.error("call_preset_load_error preset_id=%s err=%s", called_preset_id, str(load_err))
                    raise RuntimeError(f"call_preset: failed to load preset {called_preset_id}: {load_err}")

                if not called_preset:
                    raise RuntimeError(f"call_preset: preset {called_preset_id} not found in database")

                # Push to call stack
                ctx.preset_call_stack.append(called_preset_id)
                try:
                    # Merge variables if inherit_variables is True
                    # Called preset's variables override caller's variables (if the field exists)
                    called_variables = getattr(called_preset, 'variables', None)
                    if inherit_variables and called_variables:
                        for var in called_variables:
                            var_name = var.get("name")
                            var_type = var.get("type")
                            if var_name and var_type == "text" and var.get("text"):
                                ctx.variables[var_name] = var["text"]
                            elif var_name and var_type == "number" and var.get("number") is not None:
                                ctx.variables[var_name] = var["number"]

                    # Execute called preset's actions
                    called_actions = called_preset.actions or []
                    logger.info("call_preset_executing preset_id=%s preset_name=%s action_count=%s", called_preset_id, getattr(called_preset, 'name', 'unknown'), len(called_actions))

                    for nested_idx, nested_action in enumerate(called_actions):
                        ctx.action_path.append(f"preset:{called_preset_id}:{nested_idx}")
                        try:
                            await self.execute_action(nested_action, ctx, called_preset, action_index)
                        finally:
                            ctx.action_path.pop()

                    logger.info("call_preset_completed preset_id=%s", called_preset_id)
                finally:
                    # Pop from call stack
                    ctx.preset_call_stack.pop()

            else:
                # Unsupported action types are best-effort no-ops for now
                pass

        except ExecutionError as e:
            # Check if we should continue on error (default is True now)
            continue_on_error = action.get("continue_on_error", True)
            if continue_on_error:
                logger.warning("action_error_continuing action_index=%s action_type=%s err=%s action_path=%s",
                    action_index, a_type, str(e), e.action_path)
                return  # Continue to next action
            # Re-raise ExecutionError as-is
            raise
        except Exception as e:
            # Check if we should continue on error (default is True now)
            continue_on_error = action.get("continue_on_error", True)
            if continue_on_error:
                logger.warning("action_error_continuing action_index=%s action_type=%s err=%s",
                    action_index, a_type, str(e))
                return  # Continue to next action
            # Wrap exception with action context
            # Build full path: [top_level_index, nested_idx, nested_idx, ...]
            full_path = [action_index] + list(ctx.action_path)
            raise ExecutionError(
                str(e),
                action_index=action_index,
                action_type=a_type or "unknown",
                action_params=params,
                action_path=full_path
            ) from e

    async def execute(self, preset: AppActionPreset, ctx: ExecutionContext) -> None:  # type: ignore[override]
        """Execute all actions in a preset"""
        actions = preset.actions or []
        ctx.total_actions = len(actions)

        logger.info("execute_start action_count=%s actions_types=%s", len(actions), [a.get("type") if isinstance(a, dict) else getattr(a, "type", "unknown") for a in actions])

        for index, action in enumerate(actions):
            ctx.current_action_index = index
            action_type = action.get("type") if isinstance(action, dict) else getattr(action, "type", "unknown")
            logger.info("execute_action index=%s action_type=%s", index, action_type)
            await self.execute_action(action, ctx, preset, action_index=index)

        logger.info("execute_complete actions_executed=%s", len(actions))
