"""
AI Agents Widget -- launcher panel for managing agent sessions.

Each session is an independent agent CLI process connected to the backend.
Sessions can be started, stopped, and resumed individually.
Uses the launcher's PID store for process persistence across restarts.
"""

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QLineEdit, QFrame, QGridLayout, QScrollArea,
)
from PySide6.QtCore import Qt, QProcess, QProcessEnvironment, QTimer, Signal
from PySide6.QtGui import QTextCursor, QFont

try:
    from .. import theme
    from ..widgets.tab_builder import create_styled_frame, create_section_label
    from ..pid_store import save_pid, get_pid_entry, clear_pid, is_pid_running
except ImportError:
    import theme
    from widgets.tab_builder import create_styled_frame, create_section_label
    from pid_store import save_pid, get_pid_entry, clear_pid, is_pid_running

import json
import os
import sys
import time


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _input_style() -> str:
    return (
        f"background: {theme.BG_TERTIARY}; color: {theme.TEXT_PRIMARY}; "
        f"padding: 4px 8px; border-radius: {theme.RADIUS_SM}px; font-size: 9pt;"
    )


def _agent_service_key(session_id: int) -> str:
    return f"agent-session-{session_id}"


# =============================================================================
# Single session card
# =============================================================================


class AgentSessionCard(QFrame):
    """A single agent session with its own process, status, and controls."""

    session_changed = Signal()

    def __init__(self, session_id: int, backend_url: str, extra_args: str, parent=None):
        super().__init__(parent)
        self.session_id = session_id
        self._backend_url = backend_url
        self._extra_args = extra_args
        self._process: QProcess | None = None
        self._start_time: float = 0
        self.cli_session_uuid: str = ""
        self._service_key = _agent_service_key(session_id)

        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setStyleSheet(theme.get_group_frame_stylesheet())
        self._setup_ui()
        self._check_persisted_process()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(6)

        # Top row: status + label + buttons
        top = QHBoxLayout()
        top.setSpacing(6)

        self._status_dot = QLabel()
        self._status_dot.setFixedWidth(14)
        self._set_status("stopped")
        top.addWidget(self._status_dot)

        self._label = QLabel(f"Session {self.session_id + 1}")
        self._label.setStyleSheet(f"color: {theme.TEXT_PRIMARY}; font-weight: bold; font-size: 9pt;")
        top.addWidget(self._label)

        self._info = QLabel("")
        self._info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 8pt;")
        top.addWidget(self._info)

        top.addStretch()

        self._start_btn = QPushButton("Start")
        self._start_btn.setFixedWidth(55)
        self._start_btn.setStyleSheet(theme.get_primary_button_stylesheet())
        self._start_btn.clicked.connect(self._start)
        top.addWidget(self._start_btn)

        self._resume_btn = QPushButton("Resume")
        self._resume_btn.setFixedWidth(60)
        self._resume_btn.setStyleSheet(theme.get_button_stylesheet())
        self._resume_btn.clicked.connect(self._resume)
        self._resume_btn.setToolTip("Resume previous conversation")
        top.addWidget(self._resume_btn)

        self._stop_btn = QPushButton("Stop")
        self._stop_btn.setFixedWidth(45)
        self._stop_btn.setStyleSheet(theme.get_button_stylesheet())
        self._stop_btn.setEnabled(False)
        self._stop_btn.clicked.connect(self._stop)
        top.addWidget(self._stop_btn)

        layout.addLayout(top)

        # Log
        self._log = QTextEdit()
        self._log.setReadOnly(True)
        self._log.setFont(QFont("Consolas", 8))
        self._log.setStyleSheet(
            f"background: {theme.BG_TERTIARY}; color: {theme.TEXT_PRIMARY}; "
            f"border: 1px solid {theme.BORDER_DEFAULT}; border-radius: {theme.RADIUS_SM}px; "
            f"padding: 4px;"
        )
        self._log.setFixedHeight(80)
        self._log.setVisible(False)
        layout.addWidget(self._log)

    def _check_persisted_process(self):
        """Check if a previous process for this session is still alive."""
        entry = get_pid_entry(self._service_key)
        if not entry:
            return

        pid = entry.get("pid")
        cli_uuid = entry.get("cli_session_uuid", "")

        if cli_uuid:
            self.cli_session_uuid = str(cli_uuid)

        if pid and is_pid_running(int(pid)):
            # Process still alive from before launcher restart
            self._set_status("running", f"PID {pid} (reattached)")
            self._label.setText(f"Session {self.session_id + 1} -- PID {pid}")
            if cli_uuid:
                self._info.setText(f"Session: {str(cli_uuid)[:8]}")
            self._start_btn.setEnabled(False)
            self._stop_btn.setEnabled(True)
            self._log.setVisible(True)
            self._append_log(f"Reattached to running process (PID: {pid})")
            # We can't reattach QProcess to an existing PID, but we know it's alive
            # Stop will use os.kill, Start is disabled
        elif cli_uuid:
            # Process dead but we have the session UUID for resume
            self._info.setText(f"Previous: {str(cli_uuid)[:8]} (Resume to continue)")

    def _set_status(self, status: str, detail: str = ""):
        colors = {
            "running": theme.STATUS_HEALTHY,
            "connecting": theme.STATUS_STARTING,
            "stopped": theme.STATUS_STOPPED,
            "error": theme.STATUS_ERROR,
        }
        color = colors.get(status, theme.STATUS_STOPPED)
        self._status_dot.setText("●")
        self._status_dot.setStyleSheet(f"color: {color}; font-size: 12pt;")
        if detail:
            self._info.setText(detail)

    @property
    def is_running(self) -> bool:
        if self._process is not None and self._process.state() != QProcess.ProcessState.NotRunning:
            return True
        # Also check persisted PID
        entry = get_pid_entry(self._service_key)
        if entry and entry.get("pid") and is_pid_running(int(entry["pid"])):
            return True
        return False

    def _build_process(self) -> QProcess:
        proc = QProcess(self)
        proc.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        proc.readyReadStandardOutput.connect(self._on_output)
        proc.finished.connect(self._on_finished)

        repo_root = _repo_root()
        proc.setWorkingDirectory(repo_root)

        env = QProcessEnvironment.systemEnvironment()
        pythonpath = env.value("PYTHONPATH", "")
        if repo_root not in pythonpath:
            pythonpath = repo_root + os.pathsep + pythonpath if pythonpath else repo_root
            env.insert("PYTHONPATH", pythonpath)
        proc.setProcessEnvironment(env)

        return proc

    def _start(self):
        self._launch([])

    def _resume(self):
        if self.cli_session_uuid:
            self._launch(["--resume", self.cli_session_uuid])
        else:
            self._launch(["--continue"])

    def _launch(self, extra_claude_args: list[str]):
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            return

        # Kill any orphaned process from previous run
        entry = get_pid_entry(self._service_key)
        if entry and entry.get("pid"):
            old_pid = int(entry["pid"])
            if is_pid_running(old_pid):
                try:
                    import signal
                    os.kill(old_pid, signal.SIGTERM)
                    self._append_log(f"Killed orphaned process (PID: {old_pid})")
                except Exception:
                    pass

        self._log.setVisible(True)
        self._log.clear()

        self._process = self._build_process()

        args = ["-m", "pixsim7.client"]
        args.extend(["--url", self._backend_url])
        args.extend(["--pool-size", "1"])

        extra = self._extra_args.strip()
        if extra:
            args.extend(extra.split())

        args.extend(extra_claude_args)

        self._append_log(f"python {' '.join(args)}")
        self._start_time = time.time()
        self._process.start(sys.executable, args)

        # Persist PID
        pid = int(self._process.processId()) if self._process.processId() else 0
        if pid:
            save_pid(self._service_key, pid, metadata={
                "cli_session_uuid": self.cli_session_uuid,
                "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            })

        self._start_btn.setEnabled(False)
        self._resume_btn.setEnabled(False)
        self._stop_btn.setEnabled(True)
        self._set_status("connecting", "Starting...")
        self.session_changed.emit()

    def _stop(self):
        # Try QProcess first
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            self._append_log("Stopping...")
            self._process.terminate()
            if not self._process.waitForFinished(5000):
                self._process.kill()
        else:
            # Fall back to PID-based kill (for reattached orphans)
            entry = get_pid_entry(self._service_key)
            if entry and entry.get("pid"):
                pid = int(entry["pid"])
                if is_pid_running(pid):
                    try:
                        import signal
                        os.kill(pid, signal.SIGTERM)
                        self._append_log(f"Terminated process (PID: {pid})")
                    except Exception as e:
                        self._append_log(f"Failed to kill PID {pid}: {e}")

        clear_pid(self._service_key)
        self._start_btn.setEnabled(True)
        self._resume_btn.setEnabled(True)
        self._stop_btn.setEnabled(False)
        self._set_status("stopped")
        self.session_changed.emit()

    def _on_output(self):
        if not self._process:
            return
        data = self._process.readAllStandardOutput().data().decode(errors="replace")
        for line in data.splitlines():
            line = line.strip()
            if not line:
                continue
            self._append_log(line)
            if "Connected as" in line:
                agent_id = line.split("Connected as")[-1].strip()
                self._set_status("running", agent_id)
                self._label.setText(f"Session {self.session_id + 1} -- {agent_id}")
                self.session_changed.emit()
            elif "session_identified" in line and "cli_session=" in line:
                # Structured log: session_identified cli_session=<uuid>
                for part in line.split():
                    if part.startswith("cli_session="):
                        uuid_part = part.split("=", 1)[1].strip()
                        if len(uuid_part) > 8:
                            self.cli_session_uuid = uuid_part
                            entry = get_pid_entry(self._service_key)
                            if entry and entry.get("pid"):
                                save_pid(self._service_key, int(entry["pid"]), metadata={
                                    "cli_session_uuid": self.cli_session_uuid,
                                    "started_at": entry.get("started_at"),
                                })
                            self.session_changed.emit()
                        break
            elif "Reconnecting" in line or "reconnecting" in line:
                self._set_status("connecting", "Reconnecting...")
            elif "[task:" in line and "Done" in line:
                self._info.setText(line.split("Done")[0].split("]")[-1].strip()[:60])

    def _on_finished(self, exit_code, _exit_status):
        self._append_log(f"Exited (code: {exit_code})")
        # Don't clear PID here -- keep the cli_session_uuid for resume
        # But mark as not running
        entry = get_pid_entry(self._service_key)
        if entry:
            # Re-save with pid=0 but keep cli_session_uuid
            save_pid(self._service_key, 0, metadata={
                "cli_session_uuid": self.cli_session_uuid,
                "started_at": entry.get("started_at"),
            })

        self._start_btn.setEnabled(True)
        self._resume_btn.setEnabled(True)
        self._stop_btn.setEnabled(False)
        self._set_status("stopped", f"Exited ({exit_code})")
        self.session_changed.emit()

    def _append_log(self, text: str):
        self._log.moveCursor(QTextCursor.MoveOperation.End)
        self._log.insertPlainText(text + "\n")
        self._log.moveCursor(QTextCursor.MoveOperation.End)

    def cleanup(self):
        """Stop the process before widget destruction."""
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            self._process.terminate()
            self._process.waitForFinished(3000)


# =============================================================================
# Main widget
# =============================================================================


class AIAgentsWidget(QWidget):
    """Agent management widget with individually controllable sessions."""

    def __init__(self, parent=None, notify_target=None):
        super().__init__(parent)
        self._notify_target = notify_target
        self._session_cards: list[AgentSessionCard] = []
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Header
        header = QLabel("AI Agents")
        header.setStyleSheet(
            f"font-size: {theme.FONT_SIZE_LG}; font-weight: bold; "
            f"color: {theme.ACCENT_PRIMARY}; padding-bottom: {theme.SPACING_SM}px;"
        )
        layout.addWidget(header)

        desc = QLabel(
            "Each session is an independent agent CLI connected to the backend. "
            "Start new sessions or resume previous ones."
        )
        desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        desc.setWordWrap(True)
        layout.addWidget(desc)

        # Global config
        config_frame, config_layout = create_styled_frame()

        config_grid = QGridLayout()
        config_grid.setSpacing(6)

        config_grid.addWidget(create_section_label("Backend:"), 0, 0)
        self._url_input = QLineEdit("ws://localhost:8000/api/v1/ws/agent-cmd")
        self._url_input.setStyleSheet(_input_style())
        config_grid.addWidget(self._url_input, 0, 1)

        config_grid.addWidget(create_section_label("Agent args:"), 1, 0)
        self._extra_args = QLineEdit("--dangerously-skip-permissions")
        self._extra_args.setStyleSheet(_input_style())
        self._extra_args.setPlaceholderText("e.g. --dangerously-skip-permissions --model sonnet")
        config_grid.addWidget(self._extra_args, 1, 1)

        config_layout.addLayout(config_grid)

        # Buttons
        btn_row = QHBoxLayout()
        add_btn = QPushButton("+ Add Session")
        add_btn.setStyleSheet(theme.get_primary_button_stylesheet())
        add_btn.clicked.connect(lambda: self._add_session())
        btn_row.addWidget(add_btn)

        stop_all_btn = QPushButton("Stop All")
        stop_all_btn.setStyleSheet(theme.get_button_stylesheet())
        stop_all_btn.clicked.connect(self._stop_all)
        btn_row.addWidget(stop_all_btn)

        btn_row.addStretch()
        config_layout.addLayout(btn_row)

        layout.addWidget(config_frame)

        # Sessions scroll area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("background: transparent;")

        self._sessions_container = QWidget()
        self._sessions_layout = QVBoxLayout(self._sessions_container)
        self._sessions_layout.setContentsMargins(0, 0, 0, 0)
        self._sessions_layout.setSpacing(6)
        self._sessions_layout.addStretch()

        scroll.setWidget(self._sessions_container)
        layout.addWidget(scroll, 1)

        # Restore sessions from PID store or create default
        self._restore_sessions()

    def _add_session(self) -> AgentSessionCard:
        idx = len(self._session_cards)
        card = AgentSessionCard(
            session_id=idx,
            backend_url=self._url_input.text().strip(),
            extra_args=self._extra_args.text().strip(),
        )
        self._session_cards.append(card)
        self._sessions_layout.insertWidget(self._sessions_layout.count() - 1, card)
        return card

    def _restore_sessions(self):
        """Restore session cards from PID store entries."""
        # Check how many agent sessions exist in PID store
        restored = 0
        for i in range(10):  # max 10 sessions
            entry = get_pid_entry(_agent_service_key(i))
            if entry:
                self._add_session()
                restored += 1

        if restored == 0:
            self._add_session()

    def _stop_all(self):
        for card in self._session_cards:
            if card.is_running:
                card._stop()
