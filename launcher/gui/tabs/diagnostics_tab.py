"""
Diagnostics Tab for Launcher

Provides a starter UI for running socket flap diagnostics from the launcher.
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from PySide6.QtCore import QProcess, QUrl
from PySide6.QtGui import QDesktopServices, QFont
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QLineEdit, QMessageBox
)

try:
    from .. import theme
    from ..config import ROOT
    from ..widgets.tab_builder import TabBuilder, create_page, create_info_label
except ImportError:
    import theme
    from config import ROOT
    from widgets.tab_builder import TabBuilder, create_page, create_info_label


class FlapWatchWidget(QWidget):
    """Run diagnostics/watch_flap.ps1 and stream output into the launcher UI."""

    def __init__(self, notify_target=None, parent=None):
        super().__init__(parent)
        self._notify_target = notify_target
        self._process: QProcess | None = None
        self._last_output_path: Path | None = None

        self._repo_root = Path(ROOT)
        self._diag_dir = self._repo_root / "tmp" / "diagnostics"
        self._script_path = self._repo_root / "scripts" / "diagnostics" / "watch_flap.ps1"

        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        controls = QHBoxLayout()
        controls.setSpacing(8)

        controls.addWidget(QLabel("Duration (s):"))
        self.duration_input = QLineEdit("600")
        self.duration_input.setFixedWidth(80)
        self.duration_input.setStyleSheet(theme.get_input_stylesheet())
        controls.addWidget(self.duration_input)

        controls.addWidget(QLabel("Interval (s):"))
        self.interval_input = QLineEdit("2.0")
        self.interval_input.setFixedWidth(80)
        self.interval_input.setStyleSheet(theme.get_input_stylesheet())
        controls.addWidget(self.interval_input)

        controls.addWidget(QLabel("Output:"))
        self.output_input = QLineEdit("")
        self.output_input.setPlaceholderText("optional (auto-generated when empty)")
        self.output_input.setStyleSheet(theme.get_input_stylesheet())
        controls.addWidget(self.output_input, 1)

        layout.addLayout(controls)

        button_row = QHBoxLayout()
        button_row.setSpacing(8)

        self.start_btn = QPushButton("Start Watch")
        self.start_btn.setStyleSheet(theme.get_primary_button_stylesheet())
        self.start_btn.clicked.connect(self.start_watch)
        button_row.addWidget(self.start_btn)

        self.stop_btn = QPushButton("Stop Watch")
        self.stop_btn.setStyleSheet(theme.get_button_stylesheet())
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_watch)
        button_row.addWidget(self.stop_btn)

        self.open_latest_btn = QPushButton("Open Latest File")
        self.open_latest_btn.setStyleSheet(theme.get_button_stylesheet())
        self.open_latest_btn.clicked.connect(self.open_latest_file)
        button_row.addWidget(self.open_latest_btn)

        self.open_dir_btn = QPushButton("Open Diagnostics Folder")
        self.open_dir_btn.setStyleSheet(theme.get_button_stylesheet())
        self.open_dir_btn.clicked.connect(self.open_diagnostics_folder)
        button_row.addWidget(self.open_dir_btn)

        button_row.addStretch()
        layout.addLayout(button_row)

        self.status_label = QLabel("Idle")
        self.status_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY};")
        layout.addWidget(self.status_label)

        self.log_output = QTextEdit()
        self.log_output.setReadOnly(True)
        self.log_output.setFont(QFont("Consolas", 8))
        self.log_output.setStyleSheet(theme.get_text_browser_stylesheet())
        layout.addWidget(self.log_output, 1)

    def _notify(self, message: str):
        if self._notify_target and hasattr(self._notify_target, "notify"):
            try:
                self._notify_target.notify(message)
                return
            except Exception:
                pass
        self.status_label.setText(message)

    def _append_log(self, text: str):
        self.log_output.append(text)

    def _is_running(self) -> bool:
        return bool(self._process and self._process.state() != QProcess.NotRunning)

    def _build_output_path(self) -> Path:
        raw = self.output_input.text().strip()
        if raw:
            return Path(raw)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return self._diag_dir / f"flap_watch_{stamp}.jsonl"

    def _parse_inputs(self) -> tuple[int, float]:
        try:
            duration = int(self.duration_input.text().strip())
        except Exception as exc:
            raise ValueError("Duration must be a whole number of seconds.") from exc
        if duration <= 0:
            raise ValueError("Duration must be greater than 0.")

        try:
            interval = float(self.interval_input.text().strip())
        except Exception as exc:
            raise ValueError("Interval must be a number in seconds.") from exc
        if interval <= 0:
            raise ValueError("Interval must be greater than 0.")

        return duration, interval

    def start_watch(self):
        if self._is_running():
            return

        if not self._script_path.exists():
            QMessageBox.warning(self, "Missing Script", f"Script not found:\n{self._script_path}")
            return

        try:
            duration, interval = self._parse_inputs()
        except ValueError as exc:
            QMessageBox.warning(self, "Invalid Input", str(exc))
            return

        self._diag_dir.mkdir(parents=True, exist_ok=True)
        out_path = self._build_output_path()
        self._last_output_path = out_path
        self.output_input.setText(str(out_path))

        proc = QProcess(self)
        proc.setProcessChannelMode(QProcess.MergedChannels)
        proc.readyReadStandardOutput.connect(self._on_output)
        proc.finished.connect(self._on_finished)
        proc.setWorkingDirectory(str(self._repo_root))
        proc.setProgram("powershell")
        proc.setArguments([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(self._script_path),
            "-DurationSec",
            str(duration),
            "-IntervalSec",
            str(interval),
            "-OutPath",
            str(out_path),
        ])

        self._process = proc
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.status_label.setText(f"Running: {out_path.name}")
        self._append_log(
            f"> powershell -NoProfile -ExecutionPolicy Bypass -File {self._script_path} "
            f"-DurationSec {duration} -IntervalSec {interval} -OutPath {out_path}"
        )

        proc.start()
        if not proc.waitForStarted(3000):
            err = proc.errorString() or "Failed to start diagnostics process."
            self._append_log(err)
            self._notify(f"Diagnostics watcher failed to start: {err}")
            self._finalize_process_state()
            return

        self._notify("Diagnostics watcher started")

    def stop_watch(self):
        self._stop_watch(silent=False)

    def _stop_watch(self, *, silent: bool):
        if not self._is_running():
            return

        proc = self._process
        if not proc:
            return

        self._append_log("> stopping watcher...")
        proc.terminate()
        if not proc.waitForFinished(2000):
            proc.kill()
            proc.waitForFinished(2000)

        if not silent:
            self._notify("Diagnostics watcher stopped")

    def _on_output(self):
        if not self._process:
            return
        raw = bytes(self._process.readAllStandardOutput()).decode("utf-8", errors="replace")
        for line in raw.splitlines():
            if line.strip():
                self._append_log(line.rstrip())

    def _on_finished(self, exit_code: int, _exit_status):
        self._append_log(f"> watcher exited (code={exit_code})")
        self._finalize_process_state()
        if exit_code == 0:
            self._notify("Diagnostics watcher finished")
        else:
            self._notify(f"Diagnostics watcher exited with code {exit_code}")

    def _finalize_process_state(self):
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.status_label.setText("Idle")

        if self._process:
            try:
                self._process.deleteLater()
            except Exception:
                pass
        self._process = None

    def _latest_output_path(self) -> Path | None:
        if self._last_output_path and self._last_output_path.exists():
            return self._last_output_path

        if not self._diag_dir.exists():
            return None

        candidates = sorted(
            self._diag_dir.glob("flap_watch_*.jsonl"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            return candidates[0]
        return None

    def open_latest_file(self):
        latest = self._latest_output_path()
        if not latest:
            QMessageBox.information(self, "No Diagnostics", "No flap watch output file found yet.")
            return
        if not QDesktopServices.openUrl(QUrl.fromLocalFile(str(latest))):
            try:
                os.startfile(str(latest))  # type: ignore[attr-defined]
            except Exception as exc:
                QMessageBox.warning(self, "Open Failed", f"Could not open file:\n{latest}\n\n{exc}")

    def open_diagnostics_folder(self):
        self._diag_dir.mkdir(parents=True, exist_ok=True)
        if not QDesktopServices.openUrl(QUrl.fromLocalFile(str(self._diag_dir))):
            try:
                os.startfile(str(self._diag_dir))  # type: ignore[attr-defined]
            except Exception as exc:
                QMessageBox.warning(self, "Open Failed", f"Could not open folder:\n{self._diag_dir}\n\n{exc}")

    def shutdown(self):
        self._stop_watch(silent=True)
        self._finalize_process_state()


class DiagnosticsTab:
    """Diagnostics tab builder for launcher network/service diagnostics."""

    @staticmethod
    def create(launcher):
        builder = TabBuilder()
        builder.add_page("Flap Watch", lambda: DiagnosticsTab._create_watch_page(launcher))
        container, _, _ = builder.build()
        return container

    @staticmethod
    def _create_watch_page(launcher):
        page, layout = create_page(
            "Socket Flap Watch",
            "Run a lightweight network/socket watcher while reproducing backend-worker flapping."
        )

        watch_widget = FlapWatchWidget(notify_target=launcher, parent=page)
        launcher.diagnostics_watch_widget = watch_widget

        layout.addWidget(watch_widget, 1)
        layout.addWidget(
            create_info_label(
                "Output is written to tmp/diagnostics/flap_watch_*.jsonl for post-incident analysis."
            )
        )
        return page
