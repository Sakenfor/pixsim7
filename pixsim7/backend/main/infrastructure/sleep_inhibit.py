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
    from ctypes import wintypes

    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _set_thread_execution_state = _kernel32.SetThreadExecutionState
    _set_thread_execution_state.argtypes = [wintypes.ULONG]
    _set_thread_execution_state.restype = wintypes.ULONG

    def inhibit_sleep() -> None:
        global _inhibited
        if _inhibited:
            return
        previous_state = _set_thread_execution_state(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
        if previous_state == 0:
            logger.warning(
                "sleep_inhibit_failed",
                msg="SetThreadExecutionState failed while enabling sleep inhibition",
                win32_error_code=ctypes.get_last_error(),
            )
            return
        _inhibited = True
        logger.info("sleep_inhibited", msg="Windows sleep inhibited while worker is active")

    def allow_sleep() -> None:
        global _inhibited
        if not _inhibited:
            return
        previous_state = _set_thread_execution_state(ES_CONTINUOUS)
        if previous_state == 0:
            logger.warning(
                "sleep_allow_failed",
                msg="SetThreadExecutionState failed while re-enabling normal sleep behavior",
                win32_error_code=ctypes.get_last_error(),
            )
            return
        _inhibited = False
        logger.info("sleep_allowed", msg="Windows sleep re-enabled")

else:
    def inhibit_sleep() -> None:
        pass

    def allow_sleep() -> None:
        pass
