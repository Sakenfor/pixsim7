"""
Codegen Tools Dialog for running code generation tasks.

Reads from scripts/codegen.manifest.ts to dynamically list available generators.
Provides Run and Check buttons for each generator that supports them.
"""
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QWidget, QFrame, QToolButton, QMenu, QComboBox
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

    def __init__(self, task_id, script, check_mode=False, group=None, parent=None):
        super().__init__(parent)
        self.task_id = task_id
        self.script = script
        self.check_mode = check_mode
        self.group = group
        self._run_all = False

    def run(self):
        try:
            if self._run_all:
                result = self._run_pnpm_codegen()
            elif self.group:
                result = self._run_group()
            else:
                result = self._run_task()
            self.finished.emit(self.task_id, result[0], result[1])
        except Exception as e:
            self.finished.emit(self.task_id, False, f"Error: {str(e)}")

    def _run_task(self):
        """Run a single codegen task."""
        env = service_env()

        if self.check_mode:
            args = ["codegen", "--", "--only", self.task_id, "--check"]
        else:
            args = ["codegen", "--", "--only", self.task_id]

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

    def _run_group(self):
        """Run codegen for a group."""
        env = service_env()
        args = ["codegen", "--", "--group", self.group]
        if self.check_mode:
            args.append("--check")

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
            out, err = proc.communicate(timeout=180)

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
            return (False, "Command timed out after 180 seconds")

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


class CodegenBatchWorker(QThread):
    """Worker thread for batch codegen operations."""
    task_finished = Signal(str, bool, str)  # task_id, success, message
    batch_finished = Signal(bool, str)  # success, summary

    def __init__(self, tasks, check_mode=True, parent=None):
        super().__init__(parent)
        self.tasks = tasks
        self.check_mode = check_mode

    def run(self):
        env = service_env()
        pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
        summary_lines = []
        overall_success = True

        for task in self.tasks:
            task_id = task['id'] if isinstance(task, dict) else str(task)
            args = ["codegen", "--", "--only", task_id]
            if self.check_mode:
                args.append("--check")

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
                    summary_lines.append(f"{task_id} [OK]")
                    self.task_finished.emit(task_id, True, output_msg)
                else:
                    summary_lines.append(f"{task_id} [FAILED]")
                    overall_success = False
                    self.task_finished.emit(task_id, False, output_msg)
            except subprocess.TimeoutExpired:
                proc.kill()
                summary_lines.append(f"{task_id} [FAILED]")
                overall_success = False
                self.task_finished.emit(task_id, False, "Command timed out after 120 seconds")

        summary = "\n".join(summary_lines)
        self.batch_finished.emit(overall_success, summary)


class CodegenToolsWidget(QWidget):
    """Embeddable widget for codegen tools.

    Simplified version with dropdown selector instead of sidebar.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._worker = None
        self._tasks_by_id = {}
        self._selected_task_id = None
        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        layout.setContentsMargins(16, 12, 16, 12)

        # Parse manifest
        tasks = parse_codegen_manifest()

        if not tasks:
            no_tasks = QLabel("No codegen tasks found.\nCheck scripts/codegen.manifest.ts exists.")
            no_tasks.setStyleSheet(f"color: {theme.ACCENT_WARNING}; font-size: 10pt; padding: 20px;")
            layout.addWidget(no_tasks)
            layout.addStretch()
            return

        # Header
        header = QLabel("Code Generation")
        header.setStyleSheet(f"font-size: 13pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        layout.addWidget(header)

        # Store tasks
        self._tasks_by_id = {task['id']: task for task in tasks}

        # Generator selector row
        selector_row = QHBoxLayout()
        selector_row.setSpacing(8)

        selector_row.addWidget(QLabel("Generator:"))

        self._task_combo = QComboBox()
        self._task_combo.setMinimumWidth(200)
        for task in tasks:
            self._task_combo.addItem(task['id'], task['id'])
        self._task_combo.currentIndexChanged.connect(self._on_task_selected)
        selector_row.addWidget(self._task_combo, 1)

        layout.addLayout(selector_row)

        # Details frame
        details_frame = QFrame()
        details_frame.setFrameShape(QFrame.StyledPanel)
        details_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_TERTIARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)
        details_layout = QVBoxLayout(details_frame)
        details_layout.setContentsMargins(12, 10, 12, 10)
        details_layout.setSpacing(4)

        self._details_desc = QLabel("")
        self._details_desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        self._details_desc.setWordWrap(True)
        details_layout.addWidget(self._details_desc)

        self._details_script = QLabel("")
        self._details_script.setStyleSheet(f"color: {theme.TEXT_DISABLED}; font-size: 8pt;")
        details_layout.addWidget(self._details_script)

        self._details_groups = QLabel("")
        self._details_groups.setStyleSheet(f"color: {theme.TEXT_DISABLED}; font-size: 8pt;")
        details_layout.addWidget(self._details_groups)

        layout.addWidget(details_frame)

        # Action buttons
        btn_row = QHBoxLayout()
        btn_row.setSpacing(8)

        self._btn_run = QToolButton()
        self._btn_run.setText("Run")
        self._btn_run.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self._btn_run.setPopupMode(QToolButton.MenuButtonPopup)
        self._btn_run.setToolTip("Run selected generator")
        self._btn_run.setStyleSheet(f"""
            QToolButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-weight: bold;
                border-radius: {theme.RADIUS_MD}px;
                padding: 6px 16px;
            }}
            QToolButton:hover {{ background-color: #56d364; }}
            QToolButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
            QToolButton::menu-button {{
                border-left: 1px solid rgba(255,255,255,0.3);
                width: 16px;
            }}
        """)
        self._btn_run.clicked.connect(lambda: self._run_selected(False))
        run_menu = QMenu(self)
        run_menu.addAction("Run All", self._run_all)
        self._btn_run.setMenu(run_menu)
        btn_row.addWidget(self._btn_run)

        self._btn_check = QToolButton()
        self._btn_check.setText("Check")
        self._btn_check.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self._btn_check.setPopupMode(QToolButton.MenuButtonPopup)
        self._btn_check.setToolTip("Check selected generator")
        self._btn_check.setStyleSheet(f"""
            QToolButton {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                padding: 6px 16px;
            }}
            QToolButton:hover {{ background-color: {theme.BG_HOVER}; }}
            QToolButton:disabled {{ background-color: {theme.BG_SECONDARY}; color: {theme.TEXT_SECONDARY}; }}
            QToolButton::menu-button {{
                border-left: 1px solid {theme.BORDER_DEFAULT};
                width: 16px;
            }}
        """)
        self._btn_check.clicked.connect(lambda: self._run_selected(True))
        check_menu = QMenu(self)
        check_menu.addAction("Check All", self._check_all)
        self._btn_check.setMenu(check_menu)
        btn_row.addWidget(self._btn_check)

        btn_row.addStretch()
        layout.addLayout(btn_row)

        # Output
        self._output = QTextEdit()
        self._output.setReadOnly(True)
        self._output.setMaximumHeight(140)
        self._output.setStyleSheet(f"""
            QTextEdit {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                font-family: 'Consolas', monospace;
                font-size: 9pt;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)
        self._output.setPlainText("Ready.")
        layout.addWidget(self._output)

        layout.addStretch()

        # Select first task
        if tasks:
            self._select_task(tasks[0]['id'])

    def _on_task_selected(self, index):
        task_id = self._task_combo.itemData(index)
        if task_id:
            self._select_task(task_id)

    def _select_task(self, task_id: str):
        task = self._tasks_by_id.get(task_id)
        if not task:
            return
        self._selected_task_id = task_id

        self._details_desc.setText(task.get('description', ''))
        script = task.get('script', '')
        self._details_script.setText(f"Script: {script}" if script else "")
        groups = task.get('groups') or []
        self._details_groups.setText(f"Groups: {', '.join(groups)}" if groups else "")

    def _set_all_enabled(self, enabled):
        self._task_combo.setEnabled(enabled)
        self._btn_run.setEnabled(enabled)
        self._btn_check.setEnabled(enabled)

    def _on_worker_finished(self, task_id, success, message):
        self._set_all_enabled(True)
        status = "[OK]" if success else "[FAILED]"
        self._output.setPlainText(f"{task_id} {status}\n\n{message}")
        self._worker = None

    def _run_selected(self, check_mode: bool):
        if not self._selected_task_id:
            return
        task = self._tasks_by_id.get(self._selected_task_id)
        if not task:
            return
        if check_mode and not task.get('supportsCheck'):
            self._output.setPlainText(f"{task['id']} does not support check.")
            return

        if self._worker and self._worker.isRunning():
            return

        mode_str = "Checking" if check_mode else "Running"
        self._output.setPlainText(f"{mode_str}: {task['id']}...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker(task['id'], task['script'], check_mode, parent=self)
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
