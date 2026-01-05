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
    QTextEdit, QGroupBox, QMessageBox, QFrame
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

        code, out, err = self._run_pnpm([
            "-s", "docs:openapi", "--", "--url", self.openapi_url
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


def show_openapi_tools_dialog(parent, openapi_url: str = None, types_path: str = None, service_name: str = None):
    """Show the OpenAPI Tools dialog.

    Args:
        parent: Parent widget
        openapi_url: Full OpenAPI URL (e.g., http://localhost:8000/openapi.json)
        types_path: Path to generated types file (relative to ROOT)
        service_name: Display name of the service
    """
    dlg = QDialog(parent)

    # Determine title based on service
    if service_name:
        dlg.setWindowTitle(f'OpenAPI Tools - {service_name}')
    else:
        dlg.setWindowTitle('OpenAPI / API Contract Tools')

    dlg.setMinimumWidth(700)
    dlg.setMinimumHeight(600)
    dlg.setStyleSheet(
        theme.get_dialog_stylesheet() +
        theme.get_button_stylesheet() +
        theme.get_scrollbar_stylesheet() +
        f"""
        QTextEdit {{
            background-color: {theme.BG_TERTIARY};
            color: {theme.TEXT_PRIMARY};
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 9pt;
            border: 1px solid {theme.BORDER_DEFAULT};
            border-radius: {theme.RADIUS_MD}px;
        }}
        QGroupBox {{
            background-color: {theme.BG_SECONDARY};
            border: 1px solid {theme.BORDER_DEFAULT};
            border-radius: {theme.RADIUS_MD}px;
            margin-top: 12px;
            padding-top: 12px;
            font-weight: bold;
            color: {theme.TEXT_PRIMARY};
        }}
        QGroupBox::title {{
            subcontrol-origin: margin;
            left: 10px;
            padding: 0 5px;
            color: {theme.ACCENT_PRIMARY};
        }}
        """
    )

    layout = QVBoxLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)

    # Header
    header = QLabel('OpenAPI Tools & Type Generation')
    header.setStyleSheet(f"font-size: 14pt; font-weight: bold; color: {theme.TEXT_PRIMARY}; margin-bottom: 8px;")
    layout.addWidget(header)

    help_text = QLabel(
        "Manage OpenAPI contract and TypeScript type generation. "
        "Backend must be running to use these tools."
    )
    help_text.setWordWrap(True)
    help_text.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-bottom: 8px;")
    layout.addWidget(help_text)

    # Determine OpenAPI URL and types path
    ports = read_env_ports()
    if openapi_url:
        # Use provided URL (service-specific)
        effective_openapi_url = openapi_url
        # Extract port from URL for display
        try:
            from urllib.parse import urlparse
            parsed = urlparse(openapi_url)
            display_info = f"{parsed.netloc}"
        except Exception:
            display_info = openapi_url
    else:
        # Fall back to default backend
        effective_openapi_url = f"http://localhost:{ports.backend}/openapi.json"
        display_info = f"localhost:{ports.backend}"

    effective_types_path = types_path or "packages/shared/types/src/openapi.generated.ts"

    # Status indicator
    status_frame = QFrame()
    status_frame.setFrameShape(QFrame.StyledPanel)
    status_frame.setStyleSheet(f"background-color: {theme.BG_TERTIARY}; border: 1px solid {theme.BORDER_DEFAULT}; border-radius: 6px; padding: 12px;")
    status_layout = QVBoxLayout(status_frame)
    status_layout.setContentsMargins(12, 12, 12, 12)

    service_label = QLabel(f'Service: {service_name or "Backend API"} ({display_info})')
    service_label.setStyleSheet(f"font-size: 10pt; font-weight: bold; color: {theme.TEXT_PRIMARY};")
    status_layout.addWidget(service_label)

    backend_status_label = QLabel('Status: Not checked')
    backend_status_label.setStyleSheet(f"font-size: 9pt; color: {theme.TEXT_SECONDARY}; margin-top: 4px;")
    status_layout.addWidget(backend_status_label)

    layout.addWidget(status_frame)

    # Browse/Documentation Section
    browse_group = QGroupBox("Documentation & API Specification")
    browse_layout = QVBoxLayout(browse_group)

    browse_info = QLabel("Open API documentation and specification in your browser:")
    browse_info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-bottom: 4px;")
    browse_layout.addWidget(browse_info)

    browse_buttons_row = QHBoxLayout()

    # Derive docs URL from OpenAPI URL (replace /openapi.json with /docs)
    docs_url = effective_openapi_url.replace('/openapi.json', '/docs')

    btn_open_docs = QPushButton('📖 Open API Docs')
    btn_open_docs.setToolTip(f"Open {docs_url} in browser")
    btn_open_docs.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    browse_buttons_row.addWidget(btn_open_docs)

    btn_open_json = QPushButton('📄 Open openapi.json')
    btn_open_json.setToolTip(f"Open {effective_openapi_url} in browser")
    btn_open_json.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    browse_buttons_row.addWidget(btn_open_json)

    browse_layout.addLayout(browse_buttons_row)
    layout.addWidget(browse_group)

    # Type Generation Section
    gen_group = QGroupBox("TypeScript Type Generation")
    gen_layout = QVBoxLayout(gen_group)

    gen_info = QLabel("Generate or check TypeScript types from the OpenAPI specification:")
    gen_info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-bottom: 4px;")
    gen_layout.addWidget(gen_info)

    gen_buttons_row1 = QHBoxLayout()

    btn_generate = QPushButton('🔄 Generate TS API Types')
    btn_generate.setToolTip("Run pnpm openapi:gen to generate TypeScript types")
    btn_generate.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    btn_generate.setStyleSheet(f"""
        QPushButton {{
            background-color: {theme.ACCENT_SUCCESS};
            color: white;
            font-weight: bold;
        }}
        QPushButton:hover {{
            background-color: #56d364;
        }}
    """)
    gen_buttons_row1.addWidget(btn_generate)

    btn_check = QPushButton('✓ Check Types Up-to-date')
    btn_check.setToolTip("Check if generated types match current OpenAPI spec")
    btn_check.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    gen_buttons_row1.addWidget(btn_check)

    gen_layout.addLayout(gen_buttons_row1)

    gen_buttons_row2 = QHBoxLayout()

    btn_reveal = QPushButton('📁 Reveal Generated File')
    btn_reveal.setToolTip("Open Explorer/Finder at the generated TypeScript file")
    btn_reveal.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    gen_buttons_row2.addWidget(btn_reveal)

    btn_refresh = QPushButton('🔍 Check Backend Status')
    btn_refresh.setToolTip("Test connection to backend OpenAPI endpoint")
    btn_refresh.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    gen_buttons_row2.addWidget(btn_refresh)

    gen_layout.addLayout(gen_buttons_row2)
    layout.addWidget(gen_group)

    # Documentation Generation Section
    docs_group = QGroupBox("API Documentation")
    docs_layout = QVBoxLayout(docs_group)

    docs_info = QLabel("Generate docs/api/ENDPOINTS.md from the running OpenAPI spec:")
    docs_info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; font-size: 9pt; margin-bottom: 4px;")
    docs_layout.addWidget(docs_info)

    docs_buttons_row = QHBoxLayout()

    btn_generate_docs = QPushButton("Generate API Docs")
    btn_generate_docs.setToolTip("Run pnpm docs:openapi to generate endpoint documentation")
    btn_generate_docs.setMinimumHeight(theme.BUTTON_HEIGHT_LG)
    docs_buttons_row.addWidget(btn_generate_docs)

    docs_layout.addLayout(docs_buttons_row)
    layout.addWidget(docs_group)

    # Output Section
    output_group = QGroupBox("Output / Logs")
    output_layout = QVBoxLayout(output_group)

    output_box = QTextEdit()
    output_box.setReadOnly(True)
    output_box.setMinimumHeight(200)
    output_box.setPlainText("Ready. Click a button to perform an operation.")
    output_layout.addWidget(output_box)

    layout.addWidget(output_group)

    # Close button
    btn_close = QPushButton('Close')
    btn_close.setStyleSheet(f"background-color: {theme.BG_TERTIARY};")
    layout.addWidget(btn_close)

    # Worker thread reference
    worker = None

    def set_buttons_enabled(enabled):
        """Enable/disable all operation buttons."""
        btn_open_docs.setEnabled(enabled)
        btn_open_json.setEnabled(enabled)
        btn_generate.setEnabled(enabled)
        btn_check.setEnabled(enabled)
        btn_reveal.setEnabled(enabled)
        btn_refresh.setEnabled(enabled)
        btn_generate_docs.setEnabled(enabled)

    def on_worker_finished(success, message):
        """Handle worker completion."""
        nonlocal worker
        set_buttons_enabled(True)

        if success:
            output_box.setPlainText(f"✓ Success\n\n{message}")
            # Update service status if this was a check
            if worker and worker.operation == "check":
                backend_status_label.setText('Status: ✓ Service reachable')
                backend_status_label.setStyleSheet(f"font-size: 9pt; color: {theme.ACCENT_SUCCESS}; margin-top: 4px;")
        else:
            output_box.setPlainText(f"✗ Failed\n\n{message}")
            # Update service status if this was a check
            if worker and worker.operation == "check":
                backend_status_label.setText('Status: ✗ Cannot reach service')
                backend_status_label.setStyleSheet(f"font-size: 9pt; color: {theme.ACCENT_ERROR}; margin-top: 4px;")

        worker = None

    def run_operation(operation):
        """Run an OpenAPI operation in background thread."""
        nonlocal worker
        if worker and worker.isRunning():
            QMessageBox.warning(dlg, "Operation in Progress", "Please wait for the current operation to complete.")
            return

        output_box.setPlainText(f"Running: {operation}...\n")
        set_buttons_enabled(False)

        worker = OpenApiWorker(operation, effective_openapi_url, effective_types_path, dlg)
        worker.finished.connect(on_worker_finished)
        worker.start()

    def open_url(url):
        """Open URL in default browser."""
        if not QDesktopServices.openUrl(QUrl(url)):
            QMessageBox.warning(dlg, "Error", f"Failed to open URL: {url}")

    def reveal_file():
        """Reveal generated TypeScript file in Explorer/Finder."""
        file_path = os.path.join(ROOT, effective_types_path)

        if not os.path.exists(file_path):
            QMessageBox.warning(
                dlg,
                "File Not Found",
                f"Generated file does not exist:\n{file_path}\n\nRun 'Generate TS API Types' first."
            )
            return

        # Platform-specific reveal
        if sys.platform == "win32":
            # Windows: use explorer /select
            subprocess.Popen(['explorer', '/select,', os.path.normpath(file_path)])
        elif sys.platform == "darwin":
            # macOS: use open -R
            subprocess.Popen(['open', '-R', file_path])
        else:
            # Linux: just open the containing directory
            dir_path = os.path.dirname(file_path)
            subprocess.Popen(['xdg-open', dir_path])

    # Connect buttons
    btn_open_docs.clicked.connect(lambda: open_url(docs_url))
    btn_open_json.clicked.connect(lambda: open_url(effective_openapi_url))
    btn_generate.clicked.connect(lambda: run_operation("generate"))
    btn_check.clicked.connect(lambda: run_operation("check_uptodate"))
    btn_refresh.clicked.connect(lambda: run_operation("check"))
    btn_generate_docs.clicked.connect(lambda: run_operation("generate_docs"))
    btn_reveal.clicked.connect(reveal_file)
    btn_close.clicked.connect(dlg.accept)

    # Auto-check service status on open
    run_operation("check")

    dlg.exec()
