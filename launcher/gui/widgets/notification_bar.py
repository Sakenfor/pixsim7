from PySide6.QtWidgets import QWidget, QLabel, QHBoxLayout
from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QPainter, QFontMetrics, QColor


class _TickerViewport(QWidget):
    """Viewport that scrolls text from right to left like a news ticker."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._text = ""
        self._offset = 0
        self._text_width = 0
        self._text_color = QColor("#d6f0da")

    def set_text(self, text: str):
        self._text = text
        self._text_width = QFontMetrics(self.font()).horizontalAdvance(text)
        self._offset = 0
        self.update()

    def set_text_color(self, color: QColor):
        self._text_color = color
        self.update()

    def scroll_step(self, speed: int):
        self._offset += speed
        # Reset when text has fully exited left side
        if self._offset > self.width() + self._text_width:
            self._offset = 0
        self.update()

    def reset_scroll(self):
        self._offset = 0
        self.update()

    def paintEvent(self, event):
        if not self._text:
            return
        painter = QPainter(self)
        painter.setClipRect(self.rect())
        painter.setPen(self._text_color)
        # Start from right edge, scroll left
        x = self.width() - self._offset
        y = (self.height() + painter.fontMetrics().ascent() - painter.fontMetrics().descent()) // 2
        painter.drawText(x, y, self._text)


class NotificationBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self.hide)
        self._scroll_timer = QTimer(self)
        self._scroll_timer.timeout.connect(self._scroll_step)
        self._scroll_speed = 2
        self._init_ui()

    def _init_ui(self):
        self.setVisible(False)
        self.setAutoFillBackground(True)
        self.setAttribute(Qt.WA_StyledBackground, True)
        self.setStyleSheet(self._style_for_level("info")["css"])
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(8)

        self.tag_label = QLabel("")
        self.tag_label.setStyleSheet(
            "background: rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 4px;"
        )
        self.tag_label.setFixedHeight(18)
        layout.addWidget(self.tag_label)

        self.viewport = _TickerViewport()
        self.viewport.setMinimumHeight(20)
        self.viewport.setMaximumHeight(20)
        layout.addWidget(self.viewport, 1)

    def show_message(self, text: str, duration_ms: int = 3000, level: str = "info", category: str = "INFO"):
        style = self._style_for_level(level)
        self.setStyleSheet(style["css"])
        self.viewport.set_text_color(QColor(style["text_color"]))
        self.tag_label.setText(category.upper())
        self.viewport.set_text(text)
        self.show()
        self.raise_()
        self._timer.start(duration_ms)
        self._scroll_timer.start(30)

    def _style_for_level(self, level: str) -> dict:
        if level == "warning":
            return {
                "css": "background: #3a2a0f; color: #f7d6a3; border: 1px solid #4a3a1f; border-radius: 6px;",
                "text_color": "#f7d6a3",
            }
        if level == "error":
            return {
                "css": "background: #3a1f1f; color: #f7b0b0; border: 1px solid #4a2a2a; border-radius: 6px;",
                "text_color": "#f7b0b0",
            }
        return {
            "css": "background: #1d2a1f; color: #d6f0da; border: 1px solid #2b3a2e; border-radius: 6px;",
            "text_color": "#d6f0da",
        }

    def _scroll_step(self):
        if not self.isVisible():
            self._scroll_timer.stop()
            return
        self.viewport.scroll_step(self._scroll_speed)

    def hideEvent(self, event):
        self._scroll_timer.stop()
        return super().hideEvent(event)

    def resizeEvent(self, event):
        self.viewport.reset_scroll()
        return super().resizeEvent(event)
