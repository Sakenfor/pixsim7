"""
Codegen Tools Dialog for running code generation tasks.

Reads from scripts/codegen.manifest.ts to dynamically list available generators.
Provides Run and Check buttons for each generator that supports them.
"""
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QScrollArea, QWidget, QFrame
)
from PySide6.QtCore import Qt, QThread, Signal
import subprocess
import os
import sys
import re

try:
    from .. import theme
    from ..config import service_env, ROOT
except ImportError:
    import theme
    from config import service_env, ROOT


def parse_codegen_manifest():
    """
    Parse scripts/codegen.manifest.ts to extract CodegenTask entries.

    Returns list of dicts with keys: id, description, script, supportsCheck, groups
    """
    manifest_path = os.path.join(ROOT, "scripts", "codegen.manifest.ts")

    if not os.path.exists(manifest_path):
        return []

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Find the CODEGEN_TASKS array
        match = re.search(r'export\s+const\s+CODEGEN_TASKS[^=]*=\s*\[', content)
        if not match:
            return []

        # Extract the array content (find matching bracket)
        start = match.end() - 1
        bracket_count = 0
        end = start
        for i, char in enumerate(content[start:], start):
            if char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if bracket_count == 0:
                    end = i + 1
                    break

        array_str = content[start:end]

        # Parse individual task objects using regex
        tasks = []
        task_pattern = re.compile(r'\{([^{}]+)\}', re.DOTALL)

        for task_match in task_pattern.finditer(array_str):
            task_content = task_match.group(1)

            task = {
                'id': '',
                'description': '',
                'script': '',
                'supportsCheck': False,
                'groups': []
            }

            id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", task_content)
            if id_match:
                task['id'] = id_match.group(1)

            desc_match = re.search(r"description:\s*['\"]([^'\"]+)['\"]", task_content)
            if desc_match:
                task['description'] = desc_match.group(1)

            script_match = re.search(r"script:\s*['\"]([^'\"]+)['\"]", task_content)
            if script_match:
                task['script'] = script_match.group(1)

            check_match = re.search(r"supportsCheck:\s*(true|false)", task_content)
            if check_match:
                task['supportsCheck'] = check_match.group(1) == 'true'

            groups_match = re.search(r"groups:\s*\[([^\]]*)\]", task_content)
            if groups_match:
                groups_str = groups_match.group(1)
                task['groups'] = re.findall(r"['\"]([^'\"]+)['\"]", groups_str)

            if task['id']:
                tasks.append(task)

        return tasks

    except Exception as e:
        print(f"Error parsing codegen manifest: {e}")
        return []


class CodegenWorker(QThread):
    """Worker thread for codegen operations."""
    finished = Signal(str, bool, str)  # task_id, success, message

    def __init__(self, task_id, script, check_mode=False, parent=None):
        super().__init__(parent)
        self.task_id = task_id
        self.script = script
        self.check_mode = check_mode
        self._run_all = False

    def run(self):
        try:
            if self._run_all:
                result = self._run_pnpm_codegen()
            else:
                result = self._run_codegen()
            self.finished.emit(self.task_id, result[0], result[1])
        except Exception as e:
            self.finished.emit(self.task_id, False, f"Error: {str(e)}")

    def _run_codegen(self):
        """Run the codegen script."""
        env = service_env()

        if self.check_mode:
            args = ["codegen:check", "--", "--filter", self.task_id]
        else:
            args = ["exec", "tsx", self.script]

        pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"

        proc = subprocess.Popen(
            [pnpm_cmd] + args,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env
        )

        try:
            out, err = proc.communicate(timeout=120)

            output_msg = ""
            if out:
                output_msg += f"{out}\n"
            if err:
                output_msg += f"{err}\n"

            if proc.returncode == 0:
                mode_str = "Check passed" if self.check_mode else "Generated"
                return (True, f"{mode_str}!\n\n{output_msg}")
            else:
                mode_str = "Check failed" if self.check_mode else "Generation failed"
                return (False, f"{mode_str} (exit code {proc.returncode}):\n\n{output_msg}")

        except subprocess.TimeoutExpired:
            proc.kill()
            return (False, "Command timed out after 120 seconds")

    def _run_pnpm_codegen(self):
        """Run pnpm codegen or codegen:check."""
        env = service_env()
        cmd = "codegen:check" if self.check_mode else "codegen"
        pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"

        proc = subprocess.Popen(
            [pnpm_cmd, cmd],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env
        )

        try:
            out, err = proc.communicate(timeout=180)

            output_msg = ""
            if out:
                output_msg += f"{out}\n"
            if err:
                output_msg += f"{err}\n"

            if proc.returncode == 0:
                mode_str = "All checks passed" if self.check_mode else "All generators completed"
                return (True, f"{mode_str}!\n\n{output_msg}")
            else:
                mode_str = "Some checks failed" if self.check_mode else "Some generators failed"
                return (False, f"{mode_str} (exit code {proc.returncode}):\n\n{output_msg}")

        except subprocess.TimeoutExpired:
            proc.kill()
            return (False, "Command timed out after 180 seconds")


class CodegenTaskWidget(QFrame):
    """Widget for a single codegen task with Run/Check buttons."""

    run_requested = Signal(str, str, bool)  # task_id, script, check_mode

    def __init__(self, task, parent=None):
        super().__init__(parent)
        self.task = task
        self._setup_ui()

    def _setup_ui(self):
        self.setFrameShape(QFrame.StyledPanel)
        self.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(12)

        # Left side: ID and description
        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)

        id_label = QLabel(self.task['id'])
        id_label.setStyleSheet(f"font-weight: bold; color: {theme.TEXT_PRIMARY}; font-size: 10pt;")
        info_layout.addWidget(id_label)

        desc_label = QLabel(self.task['description'])
        desc_label.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        desc_label.setWordWrap(True)
        info_layout.addWidget(desc_label)

        layout.addLayout(info_layout, 1)

        # Right side: buttons
        self.btn_run = QPushButton("Run")
        self.btn_run.setToolTip(f"Run: {self.task['script']}")
        self.btn_run.setFixedWidth(70)
        self.btn_run.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-weight: bold;
            }}
            QPushButton:hover {{ background-color: #56d364; }}
            QPushButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
        """)
        self.btn_run.clicked.connect(self._on_run)
        layout.addWidget(self.btn_run)

        if self.task.get('supportsCheck'):
            self.btn_check = QPushButton("Check")
            self.btn_check.setToolTip("Verify generated output is up-to-date")
            self.btn_check.setFixedWidth(70)
            self.btn_check.clicked.connect(self._on_check)
            layout.addWidget(self.btn_check)
        else:
            self.btn_check = None

    def _on_run(self):
        self.run_requested.emit(self.task['id'], self.task['script'], False)

    def _on_check(self):
        self.run_requested.emit(self.task['id'], self.task['script'], True)

    def set_enabled(self, enabled):
        self.btn_run.setEnabled(enabled)
        if self.btn_check:
            self.btn_check.setEnabled(enabled)


class CodegenToolsWidget(QWidget):
    """Embeddable widget for codegen tools.

    Can be used inline in a tab or wrapped in a dialog.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._worker = None
        self._task_widgets = []
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(8)
        layout.setContentsMargins(16, 16, 16, 16)

        # Parse manifest
        tasks = parse_codegen_manifest()

        if not tasks:
            no_tasks = QLabel("No codegen tasks found.\nCheck scripts/codegen.manifest.ts exists.")
            no_tasks.setStyleSheet(f"color: {theme.ACCENT_WARNING}; font-size: 10pt; padding: 20px;")
            layout.addWidget(no_tasks)
            layout.addStretch()
            return

        # Batch operation buttons
        batch_row = QHBoxLayout()

        self._btn_run_all = QPushButton("Run All")
        self._btn_run_all.setToolTip("Run all codegen tasks")
        self._btn_run_all.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-weight: bold;
            }}
            QPushButton:hover {{ background-color: #56d364; }}
            QPushButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
        """)
        self._btn_run_all.clicked.connect(self._run_all)
        batch_row.addWidget(self._btn_run_all)

        self._btn_check_all = QPushButton("Check All")
        self._btn_check_all.setToolTip("Verify all generated files are up-to-date")
        self._btn_check_all.clicked.connect(self._check_all)
        batch_row.addWidget(self._btn_check_all)

        batch_row.addStretch()

        task_count = QLabel(f"{len(tasks)} generators")
        task_count.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        batch_row.addWidget(task_count)

        layout.addLayout(batch_row)

        # Scrollable task list
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("QScrollArea { border: none; background-color: transparent; }")

        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setSpacing(6)
        scroll_layout.setContentsMargins(0, 0, 0, 0)

        for task in tasks:
            widget = CodegenTaskWidget(task)
            widget.run_requested.connect(self._run_task)
            self._task_widgets.append(widget)
            scroll_layout.addWidget(widget)

        scroll_layout.addStretch()
        scroll.setWidget(scroll_content)
        layout.addWidget(scroll, 1)

        # Output
        self._output = QTextEdit()
        self._output.setReadOnly(True)
        self._output.setMaximumHeight(120)
        self._output.setStyleSheet(f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)
        self._output.setPlainText("Ready.")
        layout.addWidget(self._output)

    def _set_all_enabled(self, enabled):
        for w in self._task_widgets:
            w.set_enabled(enabled)
        if hasattr(self, '_btn_run_all'):
            self._btn_run_all.setEnabled(enabled)
            self._btn_check_all.setEnabled(enabled)

    def _on_worker_finished(self, task_id, success, message):
        self._set_all_enabled(True)
        status = "[OK]" if success else "[FAILED]"
        self._output.setPlainText(f"{task_id} {status}\n\n{message}")
        self._worker = None

    def _run_task(self, task_id, script, check_mode):
        if self._worker and self._worker.isRunning():
            return

        mode_str = "Checking" if check_mode else "Running"
        self._output.setPlainText(f"{mode_str}: {task_id}...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker(task_id, script, check_mode, self)
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _run_all(self):
        if self._worker and self._worker.isRunning():
            return

        self._output.setPlainText("Running all codegen tasks...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker("all", "", False, self)
        self._worker._run_all = True
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _check_all(self):
        if self._worker and self._worker.isRunning():
            return

        self._output.setPlainText("Checking all codegen tasks...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker("all", "", True, self)
        self._worker._run_all = True
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()


def show_codegen_dialog(parent):
    """Show the Codegen Tools dialog (legacy wrapper)."""
    dlg = QDialog(parent)
    dlg.setWindowTitle("Codegen Tools")
    dlg.setMinimumWidth(500)
    dlg.setMinimumHeight(450)
    dlg.setStyleSheet(theme.get_dialog_stylesheet() + theme.get_button_stylesheet() + theme.get_scrollbar_stylesheet())

    layout = QVBoxLayout(dlg)
    layout.setContentsMargins(0, 0, 0, 0)

    widget = CodegenToolsWidget(dlg)
    layout.addWidget(widget)

    btn_close = QPushButton("Close")
    btn_close.setStyleSheet(f"background-color: {theme.BG_TERTIARY}; margin: 12px;")
    btn_close.clicked.connect(dlg.accept)
    layout.addWidget(btn_close)

    dlg.exec()
