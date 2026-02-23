from __future__ import annotations

import os
import re
import socket
from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QFormLayout,
    QLineEdit,
    QPushButton,
    QLabel,
    QPlainTextEdit,
    QWidget,
)

try:
    from ..config import ROOT
    from .. import theme
except ImportError:
    from config import ROOT
    import theme


class AccountLiveFeedDialog(QDialog):
    """Lightweight local debug view for per-account worker activity."""

    MAX_LINES = 1200

    def __init__(
        self,
        parent=None,
        *,
        default_account_id: str = "2",
        default_email: str = "stst1616@gmail.com",
        default_provider: str = "pixverse",
    ):
        super().__init__(parent)
        self.setWindowTitle("ARQ Worker Account Live Feed")
        self.resize(980, 640)
        self.setModal(False)

        self._log_path = Path(ROOT) / "data" / "logs" / "console" / "worker.log"
        self._log_pos = 0
        self._paused = False
        self._line_count = 0
        self._tailed_count = 0

        self._queue_refresh_counter = 0
        self._timer = QTimer(self)
        self._timer.setInterval(1000)
        self._timer.timeout.connect(self._tick)

        root = QVBoxLayout(self)
        root.setContentsMargins(12, 10, 12, 10)
        root.setSpacing(8)

        filters_card = QWidget()
        filters_card.setStyleSheet(
            f"background-color: {theme.BG_SECONDARY}; border: 1px solid {theme.BORDER_DEFAULT}; border-radius: {theme.RADIUS_SM}px;"
        )
        filters_layout = QVBoxLayout(filters_card)
        filters_layout.setContentsMargins(10, 8, 10, 8)
        filters_layout.setSpacing(6)

        title = QLabel("Worker Account Feed (local log tail)")
        title_font = QFont()
        title_font.setBold(True)
        title_font.setPointSize(10)
        title.setFont(title_font)
        title.setStyleSheet(f"color: {theme.TEXT_PRIMARY};")
        filters_layout.addWidget(title)

        form = QFormLayout()
        form.setContentsMargins(0, 0, 0, 0)
        form.setSpacing(6)
        form.setHorizontalSpacing(10)

        self.account_id_input = QLineEdit(default_account_id)
        self.email_input = QLineEdit(default_email)
        self.provider_input = QLineEdit(default_provider)
        for widget in (self.account_id_input, self.email_input, self.provider_input):
            widget.setMinimumWidth(240)

        form.addRow("Account ID", self.account_id_input)
        form.addRow("Email", self.email_input)
        form.addRow("Provider", self.provider_input)
        filters_layout.addLayout(form)

        btn_row = QHBoxLayout()
        self.apply_btn = QPushButton("Apply")
        self.pause_btn = QPushButton("Pause")
        self.clear_btn = QPushButton("Clear")
        self.jump_end_btn = QPushButton("Jump To End")
        for btn in (self.apply_btn, self.pause_btn, self.clear_btn, self.jump_end_btn):
            btn.setFixedHeight(theme.BUTTON_HEIGHT_MD)
        btn_row.addWidget(self.apply_btn)
        btn_row.addWidget(self.pause_btn)
        btn_row.addWidget(self.clear_btn)
        btn_row.addWidget(self.jump_end_btn)
        btn_row.addStretch(1)
        filters_layout.addLayout(btn_row)

        stats_card = QWidget()
        stats_card.setStyleSheet(
            f"background-color: {theme.BG_TERTIARY}; border: 1px solid {theme.BORDER_DEFAULT}; border-radius: {theme.RADIUS_SM}px;"
        )
        stats_layout = QVBoxLayout(stats_card)
        stats_layout.setContentsMargins(10, 8, 10, 8)
        stats_layout.setSpacing(4)
        self.queue_stats_label = QLabel("Queues: loading...")
        self.queue_stats_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        self.match_stats_label = QLabel("Matches: 0")
        self.match_stats_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        self.log_path_label = QLabel(f"Log: {self._log_path}")
        self.log_path_label.setStyleSheet(f"color: {theme.TEXT_DISABLED}; font-size: {theme.FONT_SIZE_XS};")
        self.log_path_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        stats_layout.addWidget(self.queue_stats_label)
        stats_layout.addWidget(self.match_stats_label)
        stats_layout.addWidget(self.log_path_label)

        self.feed = QPlainTextEdit()
        self.feed.setReadOnly(True)
        self.feed.setLineWrapMode(QPlainTextEdit.NoWrap)
        self.feed.setStyleSheet(
            f"background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_PRIMARY}; border: 1px solid {theme.BORDER_DEFAULT};"
        )

        root.addWidget(filters_card)
        root.addWidget(stats_card)
        root.addWidget(self.feed, 1)

        self.apply_btn.clicked.connect(self._apply_filters)
        self.pause_btn.clicked.connect(self._toggle_pause)
        self.clear_btn.clicked.connect(self._clear_feed)
        self.jump_end_btn.clicked.connect(self._jump_to_end)

        self._apply_filters(initial=True)
        self._timer.start()

    def closeEvent(self, event):  # type: ignore[override]
        try:
            self._timer.stop()
        except Exception:
            pass
        super().closeEvent(event)

    def _apply_filters(self, initial: bool = False) -> None:
        self._account_id = (self.account_id_input.text() or "").strip()
        self._email = (self.email_input.text() or "").strip().lower()
        self._provider = (self.provider_input.text() or "").strip().lower()
        if not initial:
            self._clear_feed()
            self._jump_to_end()
        self._update_match_stats()

    def _toggle_pause(self) -> None:
        self._paused = not self._paused
        self.pause_btn.setText("Resume" if self._paused else "Pause")

    def _clear_feed(self) -> None:
        self.feed.clear()
        self._line_count = 0
        self._update_match_stats()

    def _jump_to_end(self) -> None:
        try:
            if self._log_path.exists():
                self._log_pos = self._log_path.stat().st_size
        except Exception:
            pass

    def _tick(self) -> None:
        self._queue_refresh_counter += 1
        if self._queue_refresh_counter >= 2:
            self._queue_refresh_counter = 0
            self._refresh_queue_stats()
        if self._paused:
            return
        self._tail_log_once()

    def _tail_log_once(self) -> None:
        path = self._log_path
        if not path.exists():
            self.match_stats_label.setText("Matches: waiting for worker.log")
            return
        try:
            size = path.stat().st_size
            if size < self._log_pos:
                self._log_pos = 0  # log rotated/truncated
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                fh.seek(self._log_pos)
                new_lines = fh.readlines()
                self._log_pos = fh.tell()
            for raw_line in new_lines:
                line = raw_line.rstrip("\r\n")
                if not line:
                    continue
                if self._matches_filters(line):
                    self._append_line(line)
                self._tailed_count += 1
        except Exception as exc:
            self.match_stats_label.setText(f"Matches: error reading log ({exc})")

    def _matches_filters(self, line: str) -> bool:
        lower = line.lower()
        if self._provider and self._provider not in lower:
            return False
        has_account_filter = bool(self._account_id)
        has_email_filter = bool(self._email)
        if has_account_filter or has_email_filter:
            account_match = False
            email_match = False
            if has_email_filter:
                email_match = self._email in lower
            if has_account_filter:
                # Match common structured log formats: account_id=2 / "account_id":2 / account_id=2,
                acct = re.escape(self._account_id)
                patterns = [
                    rf"\baccount_id={acct}\b",
                    rf'"account_id"\s*:\s*{acct}\b',
                    rf"\baccountid={acct}\b",
                ]
                account_match = any(re.search(p, line, flags=re.IGNORECASE) for p in patterns)
            # OR semantics for account/email: most lines contain only one of them
            if not (account_match or email_match):
                return False
        return True

    def _append_line(self, line: str) -> None:
        self.feed.appendPlainText(line)
        self._line_count += 1
        # Trim oldest lines to keep UI responsive
        if self._line_count > self.MAX_LINES:
            text = self.feed.toPlainText().splitlines()
            text = text[-self.MAX_LINES :]
            self.feed.setPlainText("\n".join(text))
            self._line_count = len(text)
        cursor = self.feed.textCursor()
        cursor.movePosition(cursor.End)
        self.feed.setTextCursor(cursor)
        self._update_match_stats()

    def _update_match_stats(self) -> None:
        acct = self._account_id or "*"
        email = self._email or "*"
        provider = self._provider or "*"
        self.match_stats_label.setText(
            f"Matches shown: {self._line_count} | scanned: {self._tailed_count} | filters(OR acct/email): account_id={acct} email={email} provider={provider}"
        )

    def _refresh_queue_stats(self) -> None:
        redis_url = os.getenv("ARQ_REDIS_URL") or os.getenv("REDIS_URL") or "redis://localhost:6380/0"
        host = "localhost"
        port = 6379
        try:
            from urllib.parse import urlparse

            parsed = urlparse(redis_url)
            host = parsed.hostname or host
            port = parsed.port or port
        except Exception:
            pass

        try:
            fresh = self._redis_first_int(host, port, "LLEN", ["arq:queue", "arq:queue:default"])
            retry = self._redis_first_int(host, port, "LLEN", ["arq:queue:generation-retry"])
            in_progress = self._redis_first_int(
                host,
                port,
                "ZCARD",
                ["arq:in-progress", "arq:in-progress:arq:queue"],
            )
            self.queue_stats_label.setText(
                f"Queues ({host}:{port}): fresh={self._fmt_num(fresh)} | retry={self._fmt_num(retry)} | in-progress={self._fmt_num(in_progress)}"
            )
        except Exception as exc:
            self.queue_stats_label.setText(f"Queues ({host}:{port}): unavailable ({exc})")

    @staticmethod
    def _fmt_num(value: Optional[int]) -> str:
        return "n/a" if value is None else str(value)

    def _redis_first_int(self, host: str, port: int, command: str, keys: list[str]) -> Optional[int]:
        last_error: Optional[str] = None
        for key in keys:
            try:
                value = self._redis_int(host, port, command, key)
                if value is not None:
                    return value
            except Exception as exc:
                last_error = str(exc)
        if last_error:
            raise RuntimeError(last_error)
        return None

    def _redis_int(self, host: str, port: int, command: str, key: str) -> Optional[int]:
        def _bulk(s: str) -> bytes:
            raw = s.encode("utf-8")
            return b"$" + str(len(raw)).encode("ascii") + b"\r\n" + raw + b"\r\n"

        payload = b"*2\r\n" + _bulk(command) + _bulk(key)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.75)
        try:
            sock.connect((host, port))
            sock.sendall(payload)
            resp = sock.recv(128)
            if resp.startswith(b":"):
                return int(resp[1:].split(b"\r\n", 1)[0])
            if resp.startswith(b"-"):
                # Surface Redis error replies (e.g. NOAUTH) instead of silent n/a
                raise RuntimeError(resp[1:].split(b"\r\n", 1)[0].decode("utf-8", errors="replace"))
            return None
        finally:
            try:
                sock.close()
            except Exception:
                pass


def show_account_live_feed_dialog(
    parent=None,
    *,
    default_account_id: str = "2",
    default_email: str = "stst1616@gmail.com",
    default_provider: str = "pixverse",
) -> AccountLiveFeedDialog:
    dialog = AccountLiveFeedDialog(
        parent=parent,
        default_account_id=default_account_id,
        default_email=default_email,
        default_provider=default_provider,
    )
    dialog.show()
    dialog.raise_()
    dialog.activateWindow()
    return dialog
