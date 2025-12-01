"""
UIAutomator2 wrapper for reliable Android UI automation.

Provides element finding and interaction using uiautomator2 library,
which is more reliable than raw ADB + uiautomator dump commands.
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List
from functools import partial

import uiautomator2 as u2

logger = logging.getLogger(__name__)


class UIA2:
    """UIAutomator2 wrapper for element-based interactions."""

    _devices: Dict[str, u2.Device] = {}

    @classmethod
    def get_device(cls, serial: str) -> u2.Device:
        """Get or create a u2 device connection."""
        if serial not in cls._devices:
            logger.info("uia2_connect", serial=serial)
            cls._devices[serial] = u2.connect(serial)
        return cls._devices[serial]

    @classmethod
    def disconnect(cls, serial: str) -> None:
        """Disconnect a device."""
        if serial in cls._devices:
            del cls._devices[serial]

    @classmethod
    async def find_element(
        cls,
        serial: str,
        resource_id: Optional[str] = None,
        text: Optional[str] = None,
        text_match_mode: str = "exact",
        content_desc: Optional[str] = None,
        content_desc_match_mode: str = "exact",
        class_name: Optional[str] = None,
        timeout: float = 0,
    ) -> Optional[Dict[str, Any]]:
        """
        Find an element using uiautomator2 selectors.

        Returns element info dict with bounds, or None if not found.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(
                cls._find_element_sync,
                serial, resource_id, text, text_match_mode,
                content_desc, content_desc_match_mode, class_name, timeout
            )
        )

    @classmethod
    def _find_element_sync(
        cls,
        serial: str,
        resource_id: Optional[str],
        text: Optional[str],
        text_match_mode: str,
        content_desc: Optional[str],
        content_desc_match_mode: str,
        class_name: Optional[str],
        timeout: float,
    ) -> Optional[Dict[str, Any]]:
        """Sync version of find_element for executor."""
        try:
            d = cls.get_device(serial)

            # Build selector kwargs
            selector: Dict[str, Any] = {}

            if resource_id:
                selector["resourceId"] = resource_id

            if text:
                if text_match_mode == "exact":
                    selector["text"] = text
                elif text_match_mode == "contains":
                    selector["textContains"] = text
                elif text_match_mode == "starts_with":
                    selector["textStartsWith"] = text
                elif text_match_mode == "regex":
                    selector["textMatches"] = text
                else:
                    selector["text"] = text

            if content_desc:
                if content_desc_match_mode == "exact":
                    selector["description"] = content_desc
                elif content_desc_match_mode == "contains":
                    selector["descriptionContains"] = content_desc
                elif content_desc_match_mode == "starts_with":
                    selector["descriptionStartsWith"] = content_desc
                elif content_desc_match_mode == "regex":
                    selector["descriptionMatches"] = content_desc
                else:
                    selector["description"] = content_desc

            if class_name:
                selector["className"] = class_name

            if not selector:
                logger.warning("uia2_find_no_selector")
                return None

            logger.debug("uia2_find", selector=selector, timeout=timeout)

            # Find element
            el = d(**selector)

            if timeout > 0:
                # Wait for element
                if not el.wait(timeout=timeout):
                    logger.debug("uia2_find_timeout", selector=selector)
                    return None
            else:
                # Just check if exists now
                if not el.exists:
                    logger.debug("uia2_find_not_found", selector=selector)
                    return None

            # Get element info
            info = el.info
            bounds = info.get("bounds", {})

            return {
                "bounds": bounds,
                "text": info.get("text"),
                "content_desc": info.get("contentDescription"),
                "resource_id": info.get("resourceName"),
                "class_name": info.get("className"),
                "center_x": (bounds.get("left", 0) + bounds.get("right", 0)) // 2,
                "center_y": (bounds.get("top", 0) + bounds.get("bottom", 0)) // 2,
            }

        except Exception as e:
            logger.error("uia2_find_error", error=str(e), exc_info=True)
            return None

    @classmethod
    async def click_element(
        cls,
        serial: str,
        resource_id: Optional[str] = None,
        text: Optional[str] = None,
        text_match_mode: str = "exact",
        content_desc: Optional[str] = None,
        content_desc_match_mode: str = "exact",
        class_name: Optional[str] = None,
        timeout: float = 0,
    ) -> bool:
        """Find and click an element."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(
                cls._click_element_sync,
                serial, resource_id, text, text_match_mode,
                content_desc, content_desc_match_mode, class_name, timeout
            )
        )

    @classmethod
    def _click_element_sync(
        cls,
        serial: str,
        resource_id: Optional[str],
        text: Optional[str],
        text_match_mode: str,
        content_desc: Optional[str],
        content_desc_match_mode: str,
        class_name: Optional[str],
        timeout: float,
    ) -> bool:
        """Sync version of click_element for executor."""
        try:
            d = cls.get_device(serial)

            # Build selector
            selector: Dict[str, Any] = {}

            if resource_id:
                selector["resourceId"] = resource_id

            if text:
                if text_match_mode == "exact":
                    selector["text"] = text
                elif text_match_mode == "contains":
                    selector["textContains"] = text
                elif text_match_mode == "starts_with":
                    selector["textStartsWith"] = text
                elif text_match_mode == "regex":
                    selector["textMatches"] = text
                else:
                    selector["text"] = text

            if content_desc:
                if content_desc_match_mode == "exact":
                    selector["description"] = content_desc
                elif content_desc_match_mode == "contains":
                    selector["descriptionContains"] = content_desc
                elif content_desc_match_mode == "starts_with":
                    selector["descriptionStartsWith"] = content_desc
                elif content_desc_match_mode == "regex":
                    selector["descriptionMatches"] = content_desc
                else:
                    selector["description"] = content_desc

            if class_name:
                selector["className"] = class_name

            if not selector:
                return False

            logger.debug("uia2_click", selector=selector)

            el = d(**selector)

            if timeout > 0:
                if not el.wait(timeout=timeout):
                    return False
            elif not el.exists:
                return False

            el.click()
            return True

        except Exception as e:
            logger.error("uia2_click_error", error=str(e), exc_info=True)
            return False

    @classmethod
    async def wait_for_element(
        cls,
        serial: str,
        resource_id: Optional[str] = None,
        text: Optional[str] = None,
        text_match_mode: str = "exact",
        content_desc: Optional[str] = None,
        content_desc_match_mode: str = "exact",
        class_name: Optional[str] = None,
        timeout: float = 10.0,
    ) -> bool:
        """Wait for an element to appear."""
        el = await cls.find_element(
            serial, resource_id, text, text_match_mode,
            content_desc, content_desc_match_mode, class_name, timeout
        )
        return el is not None

    @classmethod
    async def dump_hierarchy(cls, serial: str) -> str:
        """Dump UI hierarchy XML for debugging."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(cls._dump_hierarchy_sync, serial))

    @classmethod
    def _dump_hierarchy_sync(cls, serial: str) -> str:
        """Sync dump hierarchy."""
        try:
            d = cls.get_device(serial)
            return d.dump_hierarchy()
        except Exception as e:
            logger.error("uia2_dump_error", error=str(e))
            return ""

    @classmethod
    async def debug_find_all(
        cls,
        serial: str,
        content_desc_contains: Optional[str] = None,
        text_contains: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Debug helper: find all elements matching a partial query.
        Useful for discovering what elements exist on screen.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(cls._debug_find_all_sync, serial, content_desc_contains, text_contains)
        )

    @classmethod
    def _debug_find_all_sync(
        cls,
        serial: str,
        content_desc_contains: Optional[str],
        text_contains: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Sync debug find all."""
        results = []
        try:
            d = cls.get_device(serial)

            selector = {}
            if content_desc_contains:
                selector["descriptionContains"] = content_desc_contains
            if text_contains:
                selector["textContains"] = text_contains

            if not selector:
                return []

            elements = d(**selector)
            count = elements.count

            for i in range(count):
                el = elements[i]
                if el.exists:
                    info = el.info
                    bounds = info.get("bounds", {})
                    results.append({
                        "index": i,
                        "text": info.get("text"),
                        "content_desc": info.get("contentDescription"),
                        "resource_id": info.get("resourceName"),
                        "class_name": info.get("className"),
                        "bounds": bounds,
                    })

            logger.info("uia2_debug_find_all", count=len(results), selector=selector)

        except Exception as e:
            logger.error("uia2_debug_find_all_error", error=str(e))

        return results
