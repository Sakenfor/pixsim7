"""
Windows sleep inhibitor — prevents the OS from sleeping while generations are active.

Uses SetThreadExecutionState on Windows.  No-op on other platforms.

Usage:
    inhibit_sleep()    # call when processing starts
    allow_sleep()      # call when all processing done / shutdown
"""
import sys

from pixsim_logging import configure_logging

logger = configure_logging("sleep_inhibit")

_inhibited = False

if sys.platform == "win32":
    import ctypes

    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001

    def inhibit_sleep() -> None:
        global _inhibited
        if _inhibited:
            return
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
        )
        _inhibited = True
        logger.info("sleep_inhibited", msg="Windows sleep inhibited while worker is active")

    def allow_sleep() -> None:
        global _inhibited
        if not _inhibited:
            return
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        _inhibited = False
        logger.info("sleep_allowed", msg="Windows sleep re-enabled")

else:
    def inhibit_sleep() -> None:
        pass

    def allow_sleep() -> None:
        pass
