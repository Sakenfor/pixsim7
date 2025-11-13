try:
    from pixsim_logging import configure_logging as _configure_logging
    launcher_logger = _configure_logging("launcher")
except Exception:
    launcher_logger = None
