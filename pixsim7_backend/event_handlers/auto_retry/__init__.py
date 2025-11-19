"""
Auto-Retry Event Handler

Automatically retries failed generations when appropriate.
"""
from .manifest import handle_event, manifest, on_register

__all__ = ["handle_event", "manifest", "on_register"]
