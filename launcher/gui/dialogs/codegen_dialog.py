"""
Codegen Tools Dialog for running code generation tasks.

Reads from scripts/codegen.manifest.ts to dynamically list available generators.
Provides Run and Check buttons for each generator that supports them.
"""
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QScrollArea, QWidget, QFrame, QButtonGroup,
    QToolButton, QMenu
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


class CodegenGroupWidget(QFrame):
    """Header widget for a group of codegen tasks."""

    run_requested = Signal(str, bool)  # group, check_mode
    selected = Signal(str)  # group

    def __init__(self, group_id, label, count, show_actions=True, parent=None):
        super().__init__(parent)
        self.group_id = group_id
        self.label = label
        self.count = count
        self.show_actions = show_actions
        self._setup_ui()

    def _setup_ui(self):
        self.setFrameShape(QFrame.StyledPanel)
        self.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(10)

        self.btn_select = QPushButton(f"{self.label} ({self.count})")
        self.btn_select.setCheckable(True)
        self.btn_select.setStyleSheet(f"""
            QPushButton {{
                text-align: left;
                padding: 4px 6px;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                color: {theme.TEXT_PRIMARY};
                background-color: {theme.BG_TERTIARY};
                font-weight: bold;
                font-size: 9.5pt;
            }}
            QPushButton:checked {{
                background-color: {theme.ACCENT_PRIMARY};
                color: white;
            }}
        """)
        self.btn_select.clicked.connect(lambda: self.selected.emit(self.group_id))
        layout.addWidget(self.btn_select, 1)

        if self.show_actions:
            self.btn_run = QPushButton("Run")
            self.btn_run.setToolTip(f"Run all generators in group: {self.group_id}")
            self.btn_run.setFixedWidth(64)
            self.btn_run.setStyleSheet(f"""
                QPushButton {{
                    background-color: {theme.ACCENT_SUCCESS};
                    color: white;
                    font-weight: bold;
                }}
                QPushButton:hover {{ background-color: #56d364; }}
                QPushButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
            """)
            self.btn_run.clicked.connect(lambda: self.run_requested.emit(self.group_id, False))
            layout.addWidget(self.btn_run)

            self.btn_check = QPushButton("Check")
            self.btn_check.setToolTip(f"Check all generators in group: {self.group_id}")
            self.btn_check.setFixedWidth(64)
            self.btn_check.clicked.connect(lambda: self.run_requested.emit(self.group_id, True))
            layout.addWidget(self.btn_check)
        else:
            self.btn_run = None
            self.btn_check = None

    def set_enabled(self, enabled):
        self.btn_select.setEnabled(enabled)
        if self.btn_run:
            self.btn_run.setEnabled(enabled)
        if self.btn_check:
            self.btn_check.setEnabled(enabled)


class CodegenTaskEntryWidget(QFrame):
    """Sidebar entry for a codegen task with status dot."""

    def __init__(self, task_id, description, parent=None):
        super().__init__(parent)
        self.task_id = task_id
        self.description = description
        self._status = None
        self.button = None
        self._dot = None
        self._setup_ui()

    def _setup_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        self._dot = QFrame()
        self._dot.setFixedSize(8, 8)
        layout.addWidget(self._dot)

        self.button = QPushButton(self.task_id)
        self.button.setCheckable(True)
        self.button.setToolTip(self.description or "")
        self.button.setStyleSheet(f"""
            QPushButton {{
                text-align: left;
                padding: 4px 6px;
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_SM}px;
                color: {theme.TEXT_PRIMARY};
                background-color: {theme.BG_TERTIARY};
                font-size: 9pt;
            }}
            QPushButton:checked {{
                background-color: {theme.ACCENT_PRIMARY};
                color: white;
            }}
        """)
        layout.addWidget(self.button, 1)
        self.set_status(None)

    def set_status(self, status):
        self._status = status
        if status is None:
            color = theme.BORDER_DEFAULT
            tooltip = "Not checked"
        elif status:
            color = theme.ACCENT_SUCCESS
            tooltip = "Check passed"
        else:
            color = theme.ACCENT_ERROR
            tooltip = "Check failed"

        self._dot.setStyleSheet(
            f"background-color: {color}; border-radius: {theme.RADIUS_ROUND}px;"
        )
        self._dot.setToolTip(tooltip)

    def set_enabled(self, enabled):
        self.button.setEnabled(enabled)


class CodegenToolsWidget(QWidget):
    """Embeddable widget for codegen tools.

    Can be used inline in a tab or wrapped in a dialog.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._worker = None
        self._group_widgets = []
        self._group_headers = {}
        self._group_task_containers = {}
        self._task_buttons = {}
        self._task_entries = {}
        self._task_button_group = None
        self._tasks_by_id = {}
        self._group_tasks = {}
        self._active_group = "all"
        self._selected_task_id = None
        self._task_status = {}
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

        # Header row (count only)
        batch_row = QHBoxLayout()
        batch_row.addStretch()

        task_count = QLabel(f"{len(tasks)} generators")
        task_count.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        batch_row.addWidget(task_count)

        layout.addLayout(batch_row)

        # Group tasks
        self._tasks_by_id = {task['id']: task for task in tasks}
        self._task_status = {task['id']: None for task in tasks}
        grouped = {}
        group_order = []
        for task in tasks:
            group = task['groups'][0] if task.get('groups') else "other"
            if group not in grouped:
                grouped[group] = []
                group_order.append(group)
            grouped[group].append(task)
        self._group_tasks = grouped

        def group_label(group_id: str) -> str:
            if group_id == "other":
                return "Other"
            return group_id.replace("-", " ").title()

        # Group sidebar + details panel
        body_row = QHBoxLayout()
        body_row.setSpacing(12)

        sidebar = QFrame()
        sidebar.setFixedWidth(260)
        sidebar.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)

        sidebar_scroll = QScrollArea()
        sidebar_scroll.setWidgetResizable(True)
        sidebar_scroll.setStyleSheet("QScrollArea { border: none; background-color: transparent; }")

        sidebar_content = QWidget()
        sidebar_layout = QVBoxLayout(sidebar_content)
        sidebar_layout.setContentsMargins(10, 10, 10, 10)
        sidebar_layout.setSpacing(6)

        group_buttons = QButtonGroup(self)
        group_buttons.setExclusive(True)

        task_buttons = QButtonGroup(self)
        task_buttons.setExclusive(True)
        self._task_button_group = task_buttons

        total_tasks = len(tasks)
        all_header = CodegenGroupWidget("all", "All", total_tasks, show_actions=False)
        all_header.selected.connect(self._set_group_filter)
        self._group_headers["all"] = all_header
        self._group_widgets.append(all_header)
        group_buttons.addButton(all_header.btn_select)
        sidebar_layout.addWidget(all_header)

        for group_id in group_order:
            group_tasks = grouped[group_id]
            header = CodegenGroupWidget(
                group_id,
                group_label(group_id),
                len(group_tasks),
                show_actions=False
            )
            header.selected.connect(self._set_group_filter)
            self._group_headers[group_id] = header
            self._group_widgets.append(header)
            group_buttons.addButton(header.btn_select)
            sidebar_layout.addWidget(header)

            task_container = QWidget()
            task_layout = QVBoxLayout(task_container)
            task_layout.setContentsMargins(16, 4, 0, 4)
            task_layout.setSpacing(4)

            for task in group_tasks:
                task_id = task['id']
                entry = CodegenTaskEntryWidget(task_id, task.get('description', ''))
                entry.button.clicked.connect(lambda _checked, tid=task_id: self._select_task(tid))
                self._task_buttons[task_id] = entry.button
                self._task_entries[task_id] = entry
                task_buttons.addButton(entry.button)
                task_layout.addWidget(entry)

            task_container.setVisible(False)
            sidebar_layout.addWidget(task_container)
            self._group_task_containers[group_id] = task_container

        sidebar_layout.addStretch()
        sidebar_scroll.setWidget(sidebar_content)

        sidebar_layout_container = QVBoxLayout(sidebar)
        sidebar_layout_container.setContentsMargins(0, 0, 0, 0)
        sidebar_layout_container.addWidget(sidebar_scroll)

        details = QFrame()
        details.setStyleSheet(f"""
            QFrame {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
            }}
        """)
        details_layout = QVBoxLayout(details)
        details_layout.setContentsMargins(14, 12, 14, 12)
        details_layout.setSpacing(8)

        self._details_title = QLabel("Select a generator")
        self._details_title.setStyleSheet(f"font-weight: bold; color: {theme.TEXT_PRIMARY}; font-size: 10.5pt;")
        details_layout.addWidget(self._details_title)

        self._details_desc = QLabel("Pick a task from the left to view details.")
        self._details_desc.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt;")
        self._details_desc.setWordWrap(True)
        details_layout.addWidget(self._details_desc)

        self._details_script = QLabel("")
        self._details_script.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 8.5pt;")
        self._details_script.setWordWrap(True)
        details_layout.addWidget(self._details_script)

        self._details_groups = QLabel("")
        self._details_groups.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 8.5pt;")
        self._details_groups.setWordWrap(True)
        details_layout.addWidget(self._details_groups)

        details_layout.addStretch()

        details_actions = QHBoxLayout()

        self._details_run = QToolButton()
        self._details_run.setText("Run")
        self._details_run.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self._details_run.setPopupMode(QToolButton.MenuButtonPopup)
        self._details_run.setToolTip("Run selected generator")
        self._details_run.setStyleSheet(f"""
            QToolButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-weight: bold;
                border: 1px solid {theme.ACCENT_SUCCESS};
                border-radius: {theme.RADIUS_MD}px;
                padding: 4px 10px;
            }}
            QToolButton:hover {{ background-color: #56d364; }}
            QToolButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
        """)
        self._details_run.clicked.connect(lambda: self._run_selected(False))
        run_menu = QMenu(self)
        run_menu.addAction("Run All", self._run_all)
        self._details_run.setMenu(run_menu)
        details_actions.addWidget(self._details_run)

        self._details_check = QToolButton()
        self._details_check.setText("Check")
        self._details_check.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self._details_check.setPopupMode(QToolButton.MenuButtonPopup)
        self._details_check.setToolTip("Check selected generator")
        self._details_check.setStyleSheet(f"""
            QToolButton {{
                background-color: {theme.BG_TERTIARY};
                color: {theme.TEXT_PRIMARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                padding: 4px 10px;
            }}
            QToolButton:hover {{
                background-color: {theme.BG_HOVER};
                border: 1px solid {theme.BORDER_FOCUS};
            }}
            QToolButton:disabled {{
                background-color: {theme.BG_SECONDARY};
                color: {theme.TEXT_SECONDARY};
                border: 1px solid {theme.BORDER_SUBTLE};
            }}
        """)
        self._details_check.clicked.connect(lambda: self._run_selected(True))
        check_menu = QMenu(self)
        check_menu.addAction("Check All", self._check_all)
        self._details_check.setMenu(check_menu)
        details_actions.addWidget(self._details_check)

        details_actions.addStretch()
        details_layout.addLayout(details_actions)

        body_row.addWidget(sidebar)
        body_row.addWidget(details, 1)

        layout.addLayout(body_row, 1)

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
        self._details_run.setEnabled(False)
        self._details_check.setEnabled(False)
        self._set_group_filter("all")
        if tasks:
            self._select_task(tasks[0]['id'])

    def _set_all_enabled(self, enabled):
        for entry in self._task_entries.values():
            entry.set_enabled(enabled)
        for header in self._group_widgets:
            header.set_enabled(enabled)
        if self._details_run:
            self._details_run.setEnabled(enabled and self._selected_task_id is not None)
        if self._details_check:
            self._details_check.setEnabled(enabled and self._selected_task_id is not None)

    def _on_worker_finished(self, task_id, success, message):
        self._set_all_enabled(True)
        check_mode = bool(self._worker and getattr(self._worker, "check_mode", False))
        run_all = bool(self._worker and getattr(self._worker, "_run_all", False))
        group = self._worker.group if self._worker else None
        if check_mode and not run_all and not group and task_id in self._tasks_by_id:
            self._set_task_status(task_id, success)
        status = "[OK]" if success else "[FAILED]"
        self._output.setPlainText(f"{task_id} {status}\n\n{message}")
        self._worker = None

    def _run_task(self, task_id, script, check_mode):
        if self._worker and self._worker.isRunning():
            return

        mode_str = "Checking" if check_mode else "Running"
        self._output.setPlainText(f"{mode_str}: {task_id}...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker(task_id, script, check_mode, parent=self)
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _run_selected(self, check_mode: bool):
        if not self._selected_task_id:
            return
        task = self._tasks_by_id.get(self._selected_task_id)
        if not task:
            return
        if check_mode and not task.get('supportsCheck'):
            self._output.setPlainText(f"{task['id']} does not support check.")
            return
        self._run_task(task['id'], task['script'], check_mode)

    def _select_task(self, task_id: str):
        task = self._tasks_by_id.get(task_id)
        if not task:
            return
        self._selected_task_id = task_id
        btn = self._task_buttons.get(task_id)
        if btn and not btn.isChecked():
            btn.setChecked(True)

        self._details_title.setText(task_id)
        self._details_desc.setText(task.get('description', ''))
        script = task.get('script', '')
        self._details_script.setText(f"Script: {script}" if script else "")
        groups = task.get('groups') or []
        groups_label = ", ".join(groups) if groups else "other"
        self._details_groups.setText(f"Groups: {groups_label}")
        self._details_run.setEnabled(True)
        self._details_check.setEnabled(True)
        if task.get('supportsCheck'):
            self._details_check.setToolTip("Check selected generator")
        else:
            self._details_check.setToolTip("Selected generator does not support check")

    def _run_group(self, group_id, check_mode):
        if self._worker and self._worker.isRunning():
            return

        mode_str = "Checking" if check_mode else "Running"
        self._output.setPlainText(f"{mode_str} group: {group_id}...")
        self._set_all_enabled(False)

        self._worker = CodegenWorker(
            f"group:{group_id}",
            "",
            check_mode,
            group=group_id,
            parent=self,
        )
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _set_task_status(self, task_id, status):
        if task_id not in self._task_status:
            return
        self._task_status[task_id] = status
        entry = self._task_entries.get(task_id)
        if entry:
            entry.set_status(status)

    def _on_batch_task_finished(self, task_id, success, message):
        self._set_task_status(task_id, success)
        status = "[OK]" if success else "[FAILED]"
        if message:
            self._output.setPlainText(f"{task_id} {status}\n\n{message}")
        else:
            self._output.setPlainText(f"{task_id} {status}")

    def _on_batch_finished(self, success, summary):
        self._set_all_enabled(True)
        status = "OK" if success else "FAILED"
        if summary:
            self._output.setPlainText(f"Check All [{status}]\n\n{summary}")
        else:
            self._output.setPlainText(f"Check All [{status}]")
        self._worker = None

    def _set_group_filter(self, group_id: str):
        self._active_group = group_id
        header = self._group_headers.get(group_id)
        if header:
            header.btn_select.setChecked(True)
        if group_id == "all":
            for container in self._group_task_containers.values():
                container.setVisible(True)
        else:
            for gid, container in self._group_task_containers.items():
                container.setVisible(gid == group_id)

        if group_id == "all":
            if not self._selected_task_id and self._tasks_by_id:
                first = next(iter(self._tasks_by_id.keys()))
                self._select_task(first)
            return

        group_tasks = self._group_tasks.get(group_id, [])
        group_ids = {task['id'] for task in group_tasks}
        if group_tasks and self._selected_task_id not in group_ids:
            self._select_task(group_tasks[0]['id'])

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

        self._worker = CodegenBatchWorker(list(self._tasks_by_id.values()), True, self)
        self._worker.task_finished.connect(self._on_batch_task_finished)
        self._worker.batch_finished.connect(self._on_batch_finished)
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
