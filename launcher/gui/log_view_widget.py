"""
Unified Log View Widget

A reusable QTextBrowser-based log viewer with:
- Smart scroll position preservation
- Auto-scroll behavior
- Pause/resume functionality
- Consistent styling

Used by both Console Logs and Database Logs for unified behavior.
"""

from PySide6.QtWidgets import QTextBrowser
from PySide6.QtCore import QTimer, Signal
from PySide6.QtGui import QTextCursor


class LogViewWidget(QTextBrowser):
    """
    Enhanced QTextBrowser for displaying logs with smart scrolling.

    Features:
    - Preserves scroll position when user is reading old logs
    - Auto-scrolls to bottom when user is at bottom
    - Can be paused to freeze updates
    - Deferred scroll restoration using QTimer for proper Qt event loop handling
    """

    # Signal emitted when content is updated
    content_updated = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)

        # Configuration
        self.setReadOnly(True)
        self.setOpenExternalLinks(True)
        self.setUndoRedoEnabled(False)  # Prevent memory leak

        # State
        self._autoscroll_enabled = False
        self._paused = False
        self._pending_html = None
        self._pending_scroll_restore = None

    def set_autoscroll(self, enabled: bool):
        """Enable/disable auto-scrolling to bottom."""
        self._autoscroll_enabled = enabled

    def set_paused(self, paused: bool):
        """Pause/resume log updates."""
        self._paused = paused
        if not paused and self._pending_html is not None:
            # Apply pending update when resuming
            self._apply_html(self._pending_html, self._pending_scroll_restore)
            self._pending_html = None
            self._pending_scroll_restore = None

    def is_paused(self) -> bool:
        """Check if updates are paused."""
        return self._paused

    def update_content(self, html: str, force: bool = False):
        """
        Update log content with smart scroll preservation.

        Args:
            html: HTML content to display
            force: If True, update even when paused
        """
        if self._paused and not force:
            # Store for later when unpaused
            self._pending_html = html
            self._pending_scroll_restore = None
            return

        self._apply_html(html, None)

    def _apply_html(self, html: str, saved_scroll_state):
        """
        Internal method to apply HTML with smart scrolling.

        Uses QTimer.singleShot to defer scroll restoration until after
        Qt's event loop has finished processing the document change.
        """
        scrollbar = self.verticalScrollBar()

        # Save scroll state before update
        old_scroll_value = scrollbar.value()
        old_scroll_max = scrollbar.maximum()

        # Check if user was at bottom (within 10 pixels)
        was_at_bottom = (old_scroll_value >= old_scroll_max - 10) if old_scroll_max > 0 else True

        # Apply HTML content
        self.blockSignals(True)
        try:
            self.setHtml(html)
        finally:
            self.blockSignals(False)

        # Defer scroll restoration until Qt processes the document change
        def restore_scroll():
            if self._autoscroll_enabled or was_at_bottom:
                # Auto-scroll to bottom
                cursor = self.textCursor()
                cursor.movePosition(QTextCursor.End)
                self.setTextCursor(cursor)
                scrollbar.setValue(scrollbar.maximum())
            else:
                # Preserve exact scroll position
                if saved_scroll_state is not None:
                    scrollbar.setValue(saved_scroll_state)
                else:
                    scrollbar.setValue(min(old_scroll_value, scrollbar.maximum()))

            self.content_updated.emit()

        QTimer.singleShot(0, restore_scroll)

    def clear_content(self):
        """Clear all content."""
        self.clear()

    def get_scroll_position(self) -> int:
        """Get current scroll position."""
        return self.verticalScrollBar().value()

    def set_scroll_position(self, value: int):
        """Set scroll position (use with caution, prefer update_content)."""
        self.verticalScrollBar().setValue(value)
