"""
Databases widget for displaying configured database connections.

Shows cards for each database configured via environment variables with
connection testing, URL copying, and logging DB-specific features.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QFrame, QScrollArea, QDialog, QComboBox, QMessageBox,
    QApplication
)
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QFont

try:
    from ..config import read_env_file
    from .. import theme
    from .base_card import BaseCard
except ImportError:
    from config import read_env_file
    import theme
    from base_card import BaseCard


# Known database environment variables
KNOWN_DATABASES = {
    "DATABASE_URL": ("Main Database", "primary"),
    "LOG_DATABASE_URL": ("Logging Database", "logging"),
    "LOCAL_DATABASE_URL": ("Local Database", "local"),
}


@dataclass
class DatabaseInfo:
    """Information about a configured database."""
    name: str
    url: str
    db_type: str  # "primary", "logging", "local"
    env_key: str


def discover_databases() -> list[DatabaseInfo]:
    """Discover configured databases from environment variables."""
    env = read_env_file()
    databases = []
    for env_key, (name, db_type) in KNOWN_DATABASES.items():
        if url := env.get(env_key):
            databases.append(DatabaseInfo(name, url, db_type, env_key))
    return databases


def mask_url(url: str) -> str:
    """
    Mask password in database URL.

    postgresql://user:password@host:port/db -> postgresql://user:***@host:port/db
    """
    if "://" in url and "@" in url:
        prefix, rest = url.split("://", 1)
        if ":" in rest.split("@")[0]:
            user_pass, host_part = rest.split("@", 1)
            user = user_pass.split(":")[0]
            return f"{prefix}://{user}:***@{host_part}"
    return url


def _normalize_db_url(url: str) -> str:
    """Normalize database URL for psycopg."""
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://"):]
    elif url.startswith("postgresql+psycopg://"):
        return "postgresql://" + url[len("postgresql+psycopg://"):]
    elif url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url[len("postgresql+psycopg2://"):]
    elif url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def _get_db_connection(url: str, timeout: int = 3):
    """
    Try to connect using available PostgreSQL drivers.
    Returns (connection, driver_name) or raises exception.
    """
    url = _normalize_db_url(url)

    # Try psycopg (v3) first
    try:
        import psycopg
        return psycopg.connect(url, connect_timeout=timeout), "psycopg"
    except ImportError:
        pass

    # Try psycopg2
    try:
        import psycopg2
        return psycopg2.connect(url, connect_timeout=timeout), "psycopg2"
    except ImportError:
        pass

    # Try pg8000
    try:
        import pg8000
        # pg8000 needs parsed URL components
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return pg8000.connect(
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path.lstrip('/'),
            timeout=timeout
        ), "pg8000"
    except ImportError:
        pass

    raise ImportError("No PostgreSQL driver found. Install psycopg, psycopg2, or pg8000")


class ConnectionTestWorker(QThread):
    """Worker thread for testing database connections."""
    finished = Signal(bool, str)  # (success, message)

    def __init__(self, db_url: str, parent=None):
        super().__init__(parent)
        self.db_url = db_url

    def run(self):
        try:
            conn, driver = _get_db_connection(self.db_url, timeout=3)
            with conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            self.finished.emit(True, "Connected")
        except ImportError as e:
            self.finished.emit(False, str(e))
        except Exception as e:
            err_str = str(e).lower()
            if "connection refused" in err_str or "could not connect" in err_str:
                self.finished.emit(False, "Connection refused - Docker may not be running")
            elif "timeout" in err_str:
                self.finished.emit(False, "Connection timeout")
            elif "authentication" in err_str or "password" in err_str:
                self.finished.emit(False, "Authentication failed")
            elif "does not exist" in err_str:
                self.finished.emit(False, "Database does not exist")
            else:
                self.finished.emit(False, str(e)[:80])


class LoggingStatsWorker(QThread):
    """Worker thread for fetching logging database statistics."""
    finished = Signal(bool, int, str)  # (success, row_count, size_pretty)

    def __init__(self, db_url: str, parent=None):
        super().__init__(parent)
        self.db_url = db_url

    def run(self):
        try:
            conn, _ = _get_db_connection(self.db_url, timeout=3)
            with conn:
                with conn.cursor() as cur:
                    # Get approximate row count (fast)
                    cur.execute(
                        "SELECT reltuples::bigint FROM pg_class WHERE relname = 'logs'"
                    )
                    result = cur.fetchone()
                    row_count = result[0] if result and result[0] else 0

                    # Get table size
                    cur.execute(
                        "SELECT pg_size_pretty(pg_total_relation_size('logs'))"
                    )
                    result = cur.fetchone()
                    size_pretty = result[0] if result else "Unknown"

            self.finished.emit(True, row_count, size_pretty)
        except Exception:
            self.finished.emit(False, 0, "")


class CleanupWorker(QThread):
    """Worker thread for deleting old log entries."""
    finished = Signal(bool, int, str)  # (success, deleted_count, message)

    def __init__(self, db_url: str, days: int, parent=None):
        super().__init__(parent)
        self.db_url = db_url
        self.days = days

    def run(self):
        try:
            conn, _ = _get_db_connection(self.db_url, timeout=30)
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '%s days'",
                        (self.days,)
                    )
                    deleted = cur.rowcount
                conn.commit()

            self.finished.emit(True, deleted, f"Deleted {deleted:,} log entries")
        except Exception as e:
            self.finished.emit(False, 0, str(e))


class CleanupDialog(QDialog):
    """Dialog for cleaning up old log entries."""

    def __init__(self, db_info: DatabaseInfo, parent=None):
        super().__init__(parent)
        self.db_info = db_info
        self.cleanup_worker: Optional[CleanupWorker] = None
        self.setWindowTitle("Cleanup Old Logs")
        self.setMinimumWidth(400)
        self.setStyleSheet(theme.get_dialog_stylesheet())
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Header
        header = QLabel("Delete Old Log Entries")
        header.setStyleSheet(
            f"font-size: 14pt; font-weight: bold; color: {theme.TEXT_PRIMARY};"
        )
        layout.addWidget(header)

        # Description
        desc = QLabel(
            "This will permanently delete log entries older than the selected period. "
            "This action cannot be undone."
        )
        desc.setWordWrap(True)
        desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        layout.addWidget(desc)

        # Period selection
        period_row = QHBoxLayout()
        period_label = QLabel("Delete logs older than:")
        period_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
        period_row.addWidget(period_label)

        self.period_combo = QComboBox()
        self.period_combo.addItem("7 days", 7)
        self.period_combo.addItem("30 days", 30)
        self.period_combo.addItem("90 days", 90)
        self.period_combo.addItem("1 year", 365)
        self.period_combo.setCurrentIndex(1)  # Default to 30 days
        self.period_combo.setStyleSheet(theme.get_combobox_stylesheet())
        period_row.addWidget(self.period_combo)
        period_row.addStretch()
        layout.addLayout(period_row)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.addStretch()

        cancel_btn = QPushButton("Cancel")
        cancel_btn.setObjectName("cancelButton")
        cancel_btn.clicked.connect(self.reject)
        btn_row.addWidget(cancel_btn)

        self.delete_btn = QPushButton("Delete Logs")
        self.delete_btn.setStyleSheet(
            f"""
            QPushButton {{
                background-color: {theme.ACCENT_ERROR};
                color: white;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: #d9534f;
            }}
            """
        )
        self.delete_btn.clicked.connect(self._do_cleanup)
        btn_row.addWidget(self.delete_btn)

        layout.addLayout(btn_row)

    def _do_cleanup(self):
        days = self.period_combo.currentData()

        reply = QMessageBox.warning(
            self,
            "Confirm Deletion",
            f"Are you sure you want to delete all log entries older than {days} days?\n\n"
            "This action cannot be undone!",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if reply != QMessageBox.Yes:
            return

        self.delete_btn.setEnabled(False)
        self.delete_btn.setText("Deleting...")

        self.cleanup_worker = CleanupWorker(self.db_info.url, days, self)
        self.cleanup_worker.finished.connect(self._on_cleanup_finished)
        self.cleanup_worker.start()

    def _on_cleanup_finished(self, success: bool, deleted: int, message: str):
        self.delete_btn.setEnabled(True)
        self.delete_btn.setText("Delete Logs")

        if success:
            QMessageBox.information(
                self,
                "Cleanup Complete",
                f"Successfully deleted {deleted:,} old log entries."
            )
            self.accept()
        else:
            QMessageBox.critical(
                self,
                "Cleanup Failed",
                f"Failed to delete logs:\n{message}"
            )


class DatabaseCardWidget(BaseCard):
    """Widget displaying a single database connection card."""

    # Connection status
    CONNECTION_UNKNOWN = "unknown"
    CONNECTION_CONNECTED = "connected"
    CONNECTION_DISCONNECTED = "disconnected"

    def __init__(self, db_info: DatabaseInfo, parent=None):
        super().__init__(card_id=db_info.env_key, parent=parent)
        self.db_info = db_info
        self.connection_status = self.CONNECTION_UNKNOWN
        self.test_worker: Optional[ConnectionTestWorker] = None
        self.stats_worker: Optional[LoggingStatsWorker] = None
        self._build_ui()
        # Test connection on creation
        self._test_connection()
        # Load stats if logging database
        if db_info.db_type == "logging":
            self._load_stats()

    def _build_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(theme.SPACING_LG, theme.SPACING_MD, theme.SPACING_LG, theme.SPACING_MD)
        layout.setSpacing(theme.SPACING_LG)

        # Status indicator (colored dot like ServiceCard)
        self.status_indicator = QLabel()
        self.status_indicator.setFixedSize(10, 10)
        self._update_status_indicator()
        layout.addWidget(self.status_indicator)

        # Info section
        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        # Title
        self.title_label = QLabel(self.db_info.name)
        title_font = QFont()
        title_font.setPointSize(9)
        title_font.setBold(True)
        self.title_label.setFont(title_font)
        self.title_label.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
        info_layout.addWidget(self.title_label)

        # Status/URL info
        self.status_label = QLabel(mask_url(self.db_info.url))
        status_font = QFont()
        status_font.setPointSize(7)
        self.status_label.setFont(status_font)
        self.status_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        info_layout.addWidget(self.status_label)

        layout.addLayout(info_layout, stretch=1)

        # Stats badge (for logging DB)
        if self.db_info.db_type == "logging":
            self.stats_badge = QLabel("...")
            self.stats_badge.setFixedHeight(18)
            stats_font = QFont()
            stats_font.setPointSize(7)
            self.stats_badge.setFont(stats_font)
            self.stats_badge.setStyleSheet(f"""
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_SECONDARY};
                border-radius: 3px;
                padding: 1px 6px;
            """)
            layout.addWidget(self.stats_badge)

        # Action buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self.test_btn = self._make_btn("Test", 36, "Test database connection",
                                        theme.ACCENT_PRIMARY, theme.ACCENT_HOVER)
        self.test_btn.clicked.connect(self._test_connection)
        btn_layout.addWidget(self.test_btn)

        copy_btn = self._make_btn("Copy", 36, "Copy connection URL",
                                   theme.BG_TERTIARY, theme.BG_HOVER, text_color=theme.TEXT_PRIMARY)
        copy_btn.clicked.connect(self._copy_url)
        btn_layout.addWidget(copy_btn)

        if self.db_info.db_type == "logging":
            cleanup_btn = self._make_btn("Cleanup", 52, "Delete old log entries",
                                          theme.ACCENT_WARNING, "#e8a730")
            cleanup_btn.clicked.connect(self._show_cleanup_dialog)
            btn_layout.addWidget(cleanup_btn)

        layout.addLayout(btn_layout)

    def _make_btn(self, text, min_width, tooltip, bg_color, hover_color, text_color="white"):
        """Create a styled button matching ServiceCard style."""
        btn = QPushButton(text)
        btn.setMinimumWidth(min_width)
        btn.setFixedHeight(theme.BUTTON_HEIGHT_MD)
        btn.setToolTip(tooltip)
        btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {bg_color};
                color: {text_color};
                font-size: {theme.FONT_SIZE_XS};
                font-weight: 600;
                border: none;
                border-radius: {theme.RADIUS_SM}px;
            }}
            QPushButton:hover {{
                background-color: {hover_color};
            }}
            QPushButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_DISABLED};
            }}
        """)
        return btn

    def _update_status_indicator(self):
        """Update the status indicator dot color."""
        if self.connection_status == self.CONNECTION_CONNECTED:
            color = theme.ACCENT_SUCCESS
        elif self.connection_status == self.CONNECTION_DISCONNECTED:
            color = theme.ACCENT_ERROR
        else:
            color = theme.TEXT_DISABLED
        self.status_indicator.setStyleSheet(f"""
            background-color: {color};
            border-radius: 5px;
            border: none;
        """)

    def _test_connection(self):
        self.test_btn.setEnabled(False)
        self.test_btn.setText("...")
        self.connection_status = self.CONNECTION_UNKNOWN
        self._update_status_indicator()

        self.test_worker = ConnectionTestWorker(self.db_info.url, self)
        self.test_worker.finished.connect(self._on_test_finished)
        self.test_worker.start()

    def _on_test_finished(self, success: bool, message: str):
        self.test_btn.setEnabled(True)
        self.test_btn.setText("Test")

        if success:
            self.connection_status = self.CONNECTION_CONNECTED
            self.status_label.setText(f"Connected | {mask_url(self.db_info.url)}")
            self.status_label.setToolTip(self.db_info.url)
        else:
            self.connection_status = self.CONNECTION_DISCONNECTED
            # Show shortened error in label, full in tooltip
            short_msg = message[:40] + "..." if len(message) > 40 else message
            self.status_label.setText(f"Disconnected | {short_msg}")
            self.status_label.setToolTip(f"{message}\n\nURL: {self.db_info.url}")
        self._update_status_indicator()

    def _copy_url(self):
        QApplication.clipboard().setText(self.db_info.url)
        # Brief visual feedback
        sender = self.sender()
        if sender:
            original_text = sender.text()
            sender.setText("OK")
            from PySide6.QtCore import QTimer
            QTimer.singleShot(1000, lambda: sender.setText(original_text))

    def _load_stats(self):
        self.stats_worker = LoggingStatsWorker(self.db_info.url, self)
        self.stats_worker.finished.connect(self._on_stats_finished)
        self.stats_worker.start()

    def _on_stats_finished(self, success: bool, row_count: int, size_pretty: str):
        if success and hasattr(self, 'stats_badge'):
            self.stats_badge.setText(f"{row_count:,} rows")
            self.stats_badge.setToolTip(f"Rows: {row_count:,} | Size: {size_pretty}")
        elif hasattr(self, 'stats_badge'):
            self.stats_badge.setText("N/A")

    def _show_cleanup_dialog(self):
        dialog = CleanupDialog(self.db_info, self)
        if dialog.exec() == QDialog.Accepted:
            # Refresh stats after cleanup
            self._load_stats()

    def _get_status_color(self) -> str:
        """Return status-based border color for selected state."""
        if self.connection_status == self.CONNECTION_CONNECTED:
            return theme.ACCENT_SUCCESS
        elif self.connection_status == self.CONNECTION_DISCONNECTED:
            return theme.ACCENT_ERROR
        return theme.ACCENT_PRIMARY


class DatabasesWidget(QWidget):
    """Widget displaying all configured database connections."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        # Scroll area for cards
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(
            f"""
            QScrollArea {{
                background-color: transparent;
                border: none;
            }}
            """
            + theme.get_scrollbar_stylesheet()
        )

        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(0, 0, 16, 0)
        container_layout.setSpacing(12)

        # Discover and display databases
        databases = discover_databases()

        if not databases:
            no_db_label = QLabel(
                "No databases configured.\n\n"
                "Set DATABASE_URL or LOG_DATABASE_URL in your .env file."
            )
            no_db_label.setStyleSheet(
                f"color: {theme.TEXT_SECONDARY}; font-size: 10pt;"
            )
            no_db_label.setAlignment(Qt.AlignCenter)
            container_layout.addWidget(no_db_label)
        else:
            for db_info in databases:
                card = DatabaseCardWidget(db_info, container)
                container_layout.addWidget(card)

        container_layout.addStretch()
        scroll.setWidget(container)
        layout.addWidget(scroll)
