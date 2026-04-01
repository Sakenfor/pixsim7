"""
Re-export from the shared pixsim_settings package.

All consumers should migrate to importing directly from pixsim_settings:
    from pixsim_settings import SettingsBase, UserSettingsBase
"""
from pixsim_settings.base import (  # noqa: F401
    SettingsBase,
    UserSettingsBase,
)
