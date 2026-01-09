"""
OpenAPI Tools Dialog for managing API contract and TypeScript type generation.

Provides controls for:
- Opening API docs and openapi.json in browser
- Generating TypeScript API types
- Checking if types are up-to-date
- Revealing generated files in explorer
"""
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QMessageBox, QFrame, QWidget
)
from PySide6.QtCore import Qt, QThread, Signal, QUrl
from PySide6.QtGui import QFont, QDesktopServices
import subprocess
import os
import sys
import urllib.request
import urllib.error

try:
    from .. import theme
    from ..config import read_env_ports, service_env, ROOT
    from ..openapi_checker import update_schema_cache
except ImportError:
    import theme
    from config import read_env_ports, service_env, ROOT
    from openapi_checker import update_schema_cache


class OpenApiWorker(QThread):
    """Worker thread for OpenAPI operations to prevent UI freezing."""
    finished = Signal(bool, str)  # success, message

    def __init__(self, operation, openapi_url, types_path=None, parent=None):
        super().__init__(parent)
        self.operation = operation
        self.openapi_url = openapi_url
        self.types_path = types_path or "packages/shared/types/src/openapi.generated.ts"

    def run(self):
        try:
            if self.operation == "check":
                result = self._check_backend()
            elif self.operation == "generate":
                result = self._generate_types()
            elif self.operation == "check_uptodate":
                result = self._check_uptodate()
            elif self.operation == "generate_docs":
                result = self._generate_docs()
            else:
                result = (False, f"Unknown operation: {self.operation}")

            self.finished.emit(result[0], result[1])
        except Exception as e:
            self.finished.emit(False, f"Error: {str(e)}")

    def _check_backend(self):
        """Check if backend is reachable."""
        try:
            req = urllib.request.Request(self.openapi_url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    return (True, f"✓ Service is reachable at {self.openapi_url}")
                else:
                    return (False, f"Service returned status {response.status}")
        except urllib.error.URLError as e:
            return (False, f"Cannot reach service: {str(e)}")
        except Exception as e:
            return (False, f"Error checking service: {str(e)}")

    def _run_pnpm(self, args, timeout=60):
        """Run pnpm command and return (returncode, stdout, stderr)."""
        env = service_env()
        env['OPENAPI_URL'] = self.openapi_url
        env['OPENAPI_TYPES_OUT'] = self.types_path

        # Use pnpm from PATH
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
            out, err = proc.communicate(timeout=timeout)
            return proc.returncode, out, err
        except subprocess.TimeoutExpired:
            proc.kill()
            return -1, "", "Command timed out"

    def _run_python(self, args, timeout=60):
        """Run a Python command and return (returncode, stdout, stderr)."""
        env = service_env()
        proc = subprocess.Popen(
            [sys.executable] + args,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env
        )
        try:
            out, err = proc.communicate(timeout=timeout)
            return proc.returncode, out, err
        except subprocess.TimeoutExpired:
            proc.kill()
            return -1, "", "Command timed out"

    def _generate_types(self):
        """Generate TypeScript types from OpenAPI spec."""
        # First check backend is reachable
        check_result = self._check_backend()
        if not check_result[0]:
            return check_result

        # Run the generation script
        code, out, err = self._run_pnpm(["-s", "openapi:gen"], timeout=120)

        output_msg = ""
        if out:
            output_msg += f"stdout:\n{out}\n"
        if err:
            output_msg += f"stderr:\n{err}\n"

        if code == 0:
            # Update the schema cache so freshness checks work
            cache_updated = update_schema_cache(self.openapi_url, self.types_path)
            if cache_updated:
                output_msg += "\n✓ Schema cache updated for freshness tracking.\n"

            return (True, f"✓ Types generated successfully!\n\n{output_msg}")
        else:
            return (False, f"Generation failed (exit code {code}):\n\n{output_msg}")

    def _generate_docs(self):
        """Generate API endpoint documentation from OpenAPI spec."""
        check_result = self._check_backend()
        if not check_result[0]:
            return check_result

        code, out, err = self._run_python([
            "scripts/gen_openapi_docs.py", "--url", self.openapi_url
        ], timeout=120)

        output_msg = ""
        if out:
            output_msg += f"stdout:\n{out}\n"
        if err:
            output_msg += f"stderr:\n{err}\n"

        if code == 0:
            output_msg += "\nGenerated docs/api/ENDPOINTS.md\n"
            return (True, f"Docs generated successfully!\n\n{output_msg}")

        return (False, f"Docs generation failed (exit code {code}):\n\n{output_msg}")

    def _check_uptodate(self):
        """Check if generated types are up-to-date."""
        # First check backend is reachable
        check_result = self._check_backend()
        if not check_result[0]:
            return check_result

        # Run with --check flag
        code, out, err = self._run_pnpm([
            "-s", "exec", "openapi-typescript",
            self.openapi_url,
            "-o", self.types_path,
            "--check", "--alphabetize", "--immutable", "--empty-objects-unknown"
        ], timeout=60)

        output_msg = ""
        if out:
            output_msg += f"stdout:\n{out}\n"
        if err:
            output_msg += f"stderr:\n{err}\n"

        if code == 0:
            return (True, f"✓ Types are up-to-date!\n\n{output_msg}")
        else:
            # Exit code 1 from --check means types are stale
            return (False, f"⚠️ Types are NOT up-to-date (exit code {code}):\n\n{output_msg}")


class OpenApiToolsWidget(QWidget):
    """Embeddable widget for OpenAPI tools.

    Can be used inline in a tab or wrapped in a dialog.
    """

    def __init__(self, parent=None, openapi_url: str = None, types_path: str = None, service_name: str = None):
        super().__init__(parent)
        self._worker = None
        self._setup_ui(openapi_url, types_path, service_name)

    def _setup_ui(self, openapi_url, types_path, service_name):
        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(16, 16, 16, 16)

        # Determine OpenAPI URL and types path
        ports = read_env_ports()
        if openapi_url:
            self._openapi_url = openapi_url
            try:
                from urllib.parse import urlparse
                parsed = urlparse(openapi_url)
                display_info = f"{parsed.netloc}"
            except Exception:
                display_info = openapi_url
        else:
            self._openapi_url = f"http://localhost:{ports.backend}/openapi.json"
            display_info = f"localhost:{ports.backend}"

        self._types_path = types_path or "packages/shared/types/src/openapi.generated.ts"
        self._docs_url = self._openapi_url.replace('/openapi.json', '/docs')

        # Status indicator
        status_frame = QFrame()
        status_frame.setFrameShape(QFrame.StyledPanel)
        status_frame.setStyleSheet(f"background-color: {theme.BG_TERTIARY}; border: 1px solid {theme.BORDER_DEFAULT}; border-radius: 6px;")
        status_layout = QVBoxLayout(status_frame)
        status_layout.setContentsMargins(12, 8, 12, 8)

        service_label = QLabel(f'Backend API ({display_info})')
        service_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
        status_layout.addWidget(service_label)

        self._status_label = QLabel('Status: Not checked')
        self._status_label.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY};")
        status_layout.addWidget(self._status_label)

        layout.addWidget(status_frame)

        # Documentation buttons
        doc_row = QHBoxLayout()
        self._btn_open_docs = QPushButton('Open API Docs')
        self._btn_open_docs.setToolTip(f"Open {self._docs_url} in browser")
        self._btn_open_docs.clicked.connect(lambda: self._open_url(self._docs_url))
        doc_row.addWidget(self._btn_open_docs)

        self._btn_open_json = QPushButton('Open openapi.json')
        self._btn_open_json.setToolTip(f"Open {self._openapi_url} in browser")
        self._btn_open_json.clicked.connect(lambda: self._open_url(self._openapi_url))
        doc_row.addWidget(self._btn_open_json)
        doc_row.addStretch()
        layout.addLayout(doc_row)

        # Generation buttons
        gen_group = QGroupBox("TypeScript Type Generation")
        gen_group.setStyleSheet(f"""
            QGroupBox {{
                background-color: {theme.BG_SECONDARY};
                border: 1px solid {theme.BORDER_DEFAULT};
                border-radius: {theme.RADIUS_MD}px;
                margin-top: 8px;
                padding-top: 8px;
                font-weight: bold;
                color: {theme.TEXT_PRIMARY};
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
                color: {theme.ACCENT_PRIMARY};
            }}
        """)
        gen_layout = QVBoxLayout(gen_group)

        gen_row1 = QHBoxLayout()
        self._btn_generate = QPushButton('Generate TS Types')
        self._btn_generate.setToolTip("Run pnpm openapi:gen to generate TypeScript types")
        self._btn_generate.setStyleSheet(f"""
            QPushButton {{
                background-color: {theme.ACCENT_SUCCESS};
                color: white;
                font-weight: bold;
            }}
            QPushButton:hover {{ background-color: #56d364; }}
            QPushButton:disabled {{ background-color: {theme.BG_TERTIARY}; color: {theme.TEXT_SECONDARY}; }}
        """)
        self._btn_generate.clicked.connect(lambda: self._run_operation("generate"))
        gen_row1.addWidget(self._btn_generate)

        self._btn_check = QPushButton('Check Up-to-date')
        self._btn_check.setToolTip("Check if generated types match current OpenAPI spec")
        self._btn_check.clicked.connect(lambda: self._run_operation("check_uptodate"))
        gen_row1.addWidget(self._btn_check)
        gen_layout.addLayout(gen_row1)

        gen_row2 = QHBoxLayout()
        self._btn_reveal = QPushButton('Reveal File')
        self._btn_reveal.setToolTip("Open Explorer at the generated TypeScript file")
        self._btn_reveal.clicked.connect(self._reveal_file)
        gen_row2.addWidget(self._btn_reveal)

        self._btn_refresh = QPushButton('Check Status')
        self._btn_refresh.setToolTip("Test connection to backend OpenAPI endpoint")
        self._btn_refresh.clicked.connect(lambda: self._run_operation("check"))
        gen_row2.addWidget(self._btn_refresh)
        gen_layout.addLayout(gen_row2)

        layout.addWidget(gen_group)

        # Docs generation
        docs_row = QHBoxLayout()
        self._btn_generate_docs = QPushButton('Generate ENDPOINTS.md')
        self._btn_generate_docs.setToolTip("Generate docs/api/ENDPOINTS.md from running spec")
        self._btn_generate_docs.clicked.connect(lambda: self._run_operation("generate_docs"))
        docs_row.addWidget(self._btn_generate_docs)
        docs_row.addStretch()
        layout.addLayout(docs_row)

        # Output
        self._output = QTextEdit()
        self._output.setReadOnly(True)
        self._output.setMinimumHeight(120)
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

        layout.addStretch()

    def showEvent(self, event):
        """Auto-check status when widget becomes visible."""
        super().showEvent(event)
        if self._worker is None:
            self._run_operation("check")

    def _set_buttons_enabled(self, enabled):
        self._btn_open_docs.setEnabled(enabled)
        self._btn_open_json.setEnabled(enabled)
        self._btn_generate.setEnabled(enabled)
        self._btn_check.setEnabled(enabled)
        self._btn_reveal.setEnabled(enabled)
        self._btn_refresh.setEnabled(enabled)
        self._btn_generate_docs.setEnabled(enabled)

    def _on_worker_finished(self, success, message):
        self._set_buttons_enabled(True)
        status = "[OK]" if success else "[FAILED]"
        self._output.setPlainText(f"{status}\n\n{message}")

        if self._worker and self._worker.operation == "check":
            if success:
                self._status_label.setText('Status: Reachable')
                self._status_label.setStyleSheet(f"font-size: 9pt; color: {theme.ACCENT_SUCCESS};")
            else:
                self._status_label.setText('Status: Unreachable')
                self._status_label.setStyleSheet(f"font-size: 9pt; color: {theme.ACCENT_ERROR};")

        self._worker = None

    def _run_operation(self, operation):
        if self._worker and self._worker.isRunning():
            return

        self._output.setPlainText(f"Running: {operation}...")
        self._set_buttons_enabled(False)

        self._worker = OpenApiWorker(operation, self._openapi_url, self._types_path, self)
        self._worker.finished.connect(self._on_worker_finished)
        self._worker.start()

    def _open_url(self, url):
        if not QDesktopServices.openUrl(QUrl(url)):
            QMessageBox.warning(self, "Error", f"Failed to open URL: {url}")

    def _reveal_file(self):
        file_path = os.path.join(ROOT, self._types_path)
        if not os.path.exists(file_path):
            QMessageBox.warning(self, "File Not Found", f"Generated file does not exist:\n{file_path}")
            return

        if sys.platform == "win32":
            subprocess.Popen(['explorer', '/select,', os.path.normpath(file_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(['open', '-R', file_path])
        else:
            subprocess.Popen(['xdg-open', os.path.dirname(file_path)])


def show_openapi_tools_dialog(parent, openapi_url: str = None, types_path: str = None, service_name: str = None):
    """Show the OpenAPI Tools dialog (legacy wrapper)."""
    dlg = QDialog(parent)
    dlg.setWindowTitle('OpenAPI Tools' if not service_name else f'OpenAPI Tools - {service_name}')
    dlg.setMinimumWidth(500)
    dlg.setMinimumHeight(450)
    dlg.setStyleSheet(theme.get_dialog_stylesheet() + theme.get_button_stylesheet() + theme.get_scrollbar_stylesheet())

    layout = QVBoxLayout(dlg)
    layout.setContentsMargins(0, 0, 0, 0)

    widget = OpenApiToolsWidget(dlg, openapi_url, types_path, service_name)
    layout.addWidget(widget)

    btn_close = QPushButton('Close')
    btn_close.setStyleSheet(f"background-color: {theme.BG_TERTIARY}; margin: 12px;")
    btn_close.clicked.connect(dlg.accept)
    layout.addWidget(btn_close)

    dlg.exec()
