"""
Simple Git Workflow Dialog for common operations.

Provides one-click solutions for:
- Commit all changes
- Push to GitHub
- Pull and merge feature branches
- Clean up merged branches
"""
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QMessageBox, QProgressDialog
)
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QFont
import subprocess
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


class GitWorker(QThread):
    """Worker thread for git operations to prevent UI freezing."""
    finished = Signal(bool, str)  # success, message

    def __init__(self, operation, conflict_strategy='skip', parent=None):
        super().__init__(parent)
        self.operation = operation
        self.conflict_strategy = conflict_strategy  # 'ours', 'theirs', or 'skip'

    def run(self):
        try:
            if self.operation == "status":
                result = self._check_status()
            elif self.operation == "commit":
                result = self._commit_all()
            elif self.operation == "push":
                result = self._push()
            elif self.operation == "pull_merge":
                result = self._pull_and_merge()
            elif self.operation == "cleanup":
                result = self._cleanup_branches()
            else:
                result = (False, f"Unknown operation: {self.operation}")

            self.finished.emit(result[0], result[1])
        except Exception as e:
            self.finished.emit(False, f"Error: {str(e)}")

    def _run_git(self, args, timeout=30):
        """Run git command and return (returncode, stdout, stderr)."""
        proc = subprocess.Popen(
            ["git"] + args,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        try:
            out, err = proc.communicate(timeout=timeout)
            return proc.returncode, out, err
        except subprocess.TimeoutExpired:
            proc.kill()
            return -1, "", "Command timed out"

    def _check_status(self):
        """Check current git status."""
        # Check if there are uncommitted changes
        code, out, err = self._run_git(["status", "--porcelain"])
        if code != 0:
            return (False, f"Git status failed: {err}")

        has_changes = bool(out.strip())

        # Check commits ahead/behind
        code, out, err = self._run_git(["status", "-sb"])
        status_line = out.split('\n')[0] if out else ""

        # Check for unmerged branches
        code, out, err = self._run_git(["branch", "-r", "--no-merged", "main"])
        unmerged = [line.strip() for line in out.split('\n') if line.strip() and 'origin/HEAD' not in line]

        # Check for merged branches (excluding main)
        code, out, err = self._run_git(["branch", "-r", "--merged", "main"])
        merged = [line.strip() for line in out.split('\n')
                  if line.strip() and 'origin/main' not in line and 'origin/HEAD' not in line]

        status_msg = f"{'✓' if not has_changes else '•'} {status_line}\n"
        status_msg += f"{'✓' if not has_changes else '•'} {'No uncommitted changes' if not has_changes else 'Has uncommitted changes'}\n"
        status_msg += f"• {len(unmerged)} unmerged feature branch(es)\n"
        status_msg += f"• {len(merged)} merged branch(es) to clean up"

        return (True, status_msg)

    def _commit_all(self):
        """Commit all changes with auto-generated message."""
        # Check if there are changes
        code, out, err = self._run_git(["status", "--porcelain"])
        if code != 0:
            return (False, f"Status check failed: {err}")

        if not out.strip():
            return (False, "No changes to commit")

        # Stage all changes
        code, out, err = self._run_git(["add", "-A"])
        if code != 0:
            return (False, f"Failed to stage files: {err}")

        # Get changed file summary
        code, out, err = self._run_git(["diff", "--cached", "--stat"])
        summary = out.strip().split('\n')[-1] if out else "changes"

        # Commit with auto message
        commit_msg = f"chore: auto-commit via launcher\n\n{summary}\n\n🤖 Generated with Launcher GUI"
        code, out, err = self._run_git(["commit", "-m", commit_msg])
        if code != 0:
            return (False, f"Commit failed: {err}")

        return (True, f"✓ Committed successfully\n{summary}")

    def _push(self):
        """Push to origin/main."""
        code, out, err = self._run_git(["push", "origin", "main"], timeout=60)
        if code != 0:
            return (False, f"Push failed: {err}")

        return (True, "✓ Pushed to GitHub successfully")

    def _pull_and_merge(self):
        """Fetch and merge all unmerged feature branches."""
        # Fetch first
        code, out, err = self._run_git(["fetch"], timeout=60)
        if code != 0:
            return (False, f"Fetch failed: {err}")

        # Get unmerged branches
        code, out, err = self._run_git(["branch", "-r", "--no-merged", "main"])
        if code != 0:
            return (False, f"Failed to list branches: {err}")

        branches = [line.strip() for line in out.split('\n')
                   if line.strip() and 'origin/HEAD' not in line]

        if not branches:
            return (True, "✓ No feature branches to merge")

        merged_count = 0
        conflicts = []

        for branch in branches:
            # Try to merge
            code, out, err = self._run_git(["merge", branch, "--no-ff", "-m", f"Merge {branch}"])
            if code != 0:
                # Check if it's a conflict
                if "CONFLICT" in err or "CONFLICT" in out:
                    # Get list of conflicted files
                    code_status, out_status, _ = self._run_git(["status", "--porcelain"])
                    conflicted_files = []
                    if code_status == 0:
                        for line in out_status.split('\n'):
                            if line.startswith('UU ') or line.startswith('AA '):
                                conflicted_files.append(line[3:].strip())

                    conflict_info = f"{branch}\n  Conflicts in: {', '.join(conflicted_files[:3])}"
                    if len(conflicted_files) > 3:
                        conflict_info += f" (+{len(conflicted_files)-3} more)"

                    # Resolve based on strategy
                    if self.conflict_strategy == 'skip':
                        conflicts.append(conflict_info + " [SKIPPED]")
                        self._run_git(["merge", "--abort"])
                    elif self.conflict_strategy in ['ours', 'theirs']:
                        # Resolve all conflicts with chosen strategy
                        for cf in conflicted_files:
                            self._run_git(["checkout", f"--{self.conflict_strategy}", cf])

                        # Stage resolved files
                        self._run_git(["add", "-A"])

                        # Complete the merge
                        commit_code, _, commit_err = self._run_git(["commit", "--no-edit"])
                        if commit_code == 0:
                            merged_count += 1
                        else:
                            conflicts.append(conflict_info + f" [FAILED: {commit_err[:30]}]")
                            self._run_git(["merge", "--abort"])
                    else:
                        conflicts.append(conflict_info + " [UNKNOWN STRATEGY]")
                        self._run_git(["merge", "--abort"])
                else:
                    conflicts.append(f"{branch} (error: {err[:50]})")
            else:
                merged_count += 1

        result_msg = f"✓ Merged {merged_count} branch(es)"
        if conflicts:
            result_msg += f"\n⚠ {len(conflicts)} branch(es) had conflicts (skipped):\n"
            result_msg += "\n".join(f"  - {c}" for c in conflicts[:5])

        return (True, result_msg)

    def _cleanup_branches(self):
        """Delete all merged remote branches (except main)."""
        # Get merged branches
        code, out, err = self._run_git(["branch", "-r", "--merged", "main"])
        if code != 0:
            return (False, f"Failed to list branches: {err}")

        branches = [line.strip().replace('origin/', '')
                   for line in out.split('\n')
                   if line.strip() and 'origin/main' not in line and 'origin/HEAD' not in line]

        if not branches:
            return (True, "✓ No merged branches to clean up")

        # Delete from remote
        deleted = []
        failed = []

        for branch in branches:
            code, out, err = self._run_git(["push", "origin", "--delete", branch])
            if code == 0:
                deleted.append(branch)
            else:
                failed.append(f"{branch}: {err[:30]}")

        # Prune local references
        self._run_git(["fetch", "--prune"])

        result_msg = f"✓ Deleted {len(deleted)} merged branch(es)"
        if failed:
            result_msg += f"\n⚠ {len(failed)} branch(es) failed to delete"

        return (True, result_msg)


class SimpleGitDialog(QDialog):
    """Simple Git workflow dialog with common operations."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Git Workflow")
        self.setMinimumSize(700, 600)
        self.worker = None
        self._setup_ui()
        self._refresh_status()

    def _setup_ui(self):
        """Setup the UI layout."""
        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QLabel("Simple Git Workflow")
        title_font = QFont()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        # Status group
        status_group = QGroupBox("Current Status")
        status_layout = QVBoxLayout(status_group)

        self.status_label = QLabel("Checking status...")
        self.status_label.setStyleSheet("font-family: 'Consolas', monospace; padding: 10px;")
        status_layout.addWidget(self.status_label)

        refresh_btn = QPushButton("🔄 Refresh Status")
        refresh_btn.clicked.connect(self._refresh_status)
        status_layout.addWidget(refresh_btn)

        layout.addWidget(status_group)

        # Actions group
        actions_group = QGroupBox("Quick Actions")
        actions_layout = QVBoxLayout(actions_group)

        # Workflow 1: Commit + Push
        workflow1 = QHBoxLayout()
        self.commit_btn = QPushButton("1️⃣ Commit All Changes")
        self.commit_btn.setToolTip("Stage and commit all local changes")
        self.commit_btn.clicked.connect(self._commit_all)

        self.push_btn = QPushButton("2️⃣ Push to GitHub")
        self.push_btn.setToolTip("Push commits to origin/main")
        self.push_btn.clicked.connect(self._push)

        workflow1.addWidget(self.commit_btn)
        workflow1.addWidget(self.push_btn)
        actions_layout.addLayout(workflow1)

        # Workflow 2: Pull + Merge
        workflow2 = QHBoxLayout()
        self.pull_merge_btn = QPushButton("3️⃣ Pull & Merge Features")
        self.pull_merge_btn.setToolTip("Fetch and merge all feature branches into main")
        self.pull_merge_btn.clicked.connect(self._pull_and_merge)

        self.cleanup_btn = QPushButton("4️⃣ Clean Up Branches")
        self.cleanup_btn.setToolTip("Delete merged remote branches")
        self.cleanup_btn.clicked.connect(self._cleanup_branches)

        workflow2.addWidget(self.pull_merge_btn)
        workflow2.addWidget(self.cleanup_btn)
        actions_layout.addLayout(workflow2)

        # One-click sync
        sync_all_btn = QPushButton("⚡ Full Sync (Commit → Push → Pull → Cleanup)")
        sync_all_btn.setStyleSheet("background-color: #4CAF50; font-weight: bold; padding: 12px;")
        sync_all_btn.setToolTip("Do everything: commit, push, pull/merge, cleanup")
        sync_all_btn.clicked.connect(self._sync_all)
        actions_layout.addWidget(sync_all_btn)

        layout.addWidget(actions_group)

        # Output
        output_label = QLabel("Output:")
        layout.addWidget(output_label)

        self.output = QTextEdit()
        self.output.setReadOnly(True)
        self.output.setStyleSheet("""
            QTextEdit {
                background-color: #1e1e1e;
                color: #d4d4d4;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 10pt;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 8px;
            }
        """)
        layout.addWidget(self.output)

        # Close button
        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        layout.addWidget(close_btn)

        self._apply_styles()

    def _apply_styles(self):
        """Apply stylesheet to dialog."""
        self.setStyleSheet("""
            QDialog {
                background-color: #f5f5f5;
            }
            QGroupBox {
                font-weight: bold;
                border: 2px solid #ddd;
                border-radius: 6px;
                margin-top: 12px;
                padding-top: 12px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
            QPushButton {
                background-color: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 10px 16px;
                font-weight: bold;
                min-height: 32px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
            QPushButton:pressed {
                background-color: #0D47A1;
            }
            QPushButton:disabled {
                background-color: #ccc;
                color: #888;
            }
        """)

    def _log(self, message):
        """Add message to output."""
        self.output.append(message)
        self.output.verticalScrollBar().setValue(
            self.output.verticalScrollBar().maximum()
        )

    def _run_operation(self, operation, description, conflict_strategy='skip'):
        """Run a git operation in worker thread."""
        if self.worker and self.worker.isRunning():
            QMessageBox.warning(self, "Busy", "Another operation is in progress")
            return

        self._log(f"\n{'='*60}")
        self._log(f"{description}...")
        self._log(f"{'='*60}")

        # Disable buttons
        self._set_buttons_enabled(False)

        self.worker = GitWorker(operation, conflict_strategy=conflict_strategy)
        self.worker.finished.connect(self._operation_finished)
        self.worker.start()

    def _operation_finished(self, success, message):
        """Handle operation completion."""
        if success:
            self._log(f"✓ {message}")
            # Update status label for status checks
            if self.worker and self.worker.operation == "status":
                self.status_label.setText(message)
        else:
            self._log(f"✗ {message}")

        # Re-enable buttons
        self._set_buttons_enabled(True)

        # Only refresh status if it wasn't a status operation (prevent infinite loop)
        if self.worker and self.worker.operation != "status":
            self._refresh_status()

    def _set_buttons_enabled(self, enabled):
        """Enable/disable all action buttons."""
        self.commit_btn.setEnabled(enabled)
        self.push_btn.setEnabled(enabled)
        self.pull_merge_btn.setEnabled(enabled)
        self.cleanup_btn.setEnabled(enabled)

    def _refresh_status(self):
        """Refresh git status display."""
        self._run_operation("status", "Checking status")

    def _commit_all(self):
        """Commit all changes."""
        reply = QMessageBox.question(
            self,
            "Confirm Commit",
            "This will stage and commit ALL local changes. Continue?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self._run_operation("commit", "Committing all changes")

    def _push(self):
        """Push to GitHub."""
        self._run_operation("push", "Pushing to GitHub")

    def _pull_and_merge(self):
        """Pull and merge feature branches."""
        # First ask if they want to merge
        reply = QMessageBox.question(
            self,
            "Confirm Merge",
            "This will fetch and merge ALL unmerged feature branches.\n\nContinue?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply != QMessageBox.Yes:
            return

        # Ask about conflict resolution strategy
        strategy_dialog = QMessageBox(self)
        strategy_dialog.setWindowTitle("Conflict Resolution Strategy")
        strategy_dialog.setText(
            "If conflicts occur during merge, what should I do?\n\n"
            "• Keep My Code: Use your local changes\n"
            "• Keep Their Code: Use incoming branch changes\n"
            "• Skip: Abort merge for conflicted branches"
        )
        keep_mine = strategy_dialog.addButton("Keep My Code", QMessageBox.AcceptRole)
        keep_theirs = strategy_dialog.addButton("Keep Their Code", QMessageBox.ActionRole)
        skip_btn = strategy_dialog.addButton("Skip Conflicts", QMessageBox.RejectRole)

        strategy_dialog.exec()

        clicked = strategy_dialog.clickedButton()
        if clicked == keep_mine:
            strategy = 'ours'
        elif clicked == keep_theirs:
            strategy = 'theirs'
        else:
            strategy = 'skip'

        self._run_operation("pull_merge", "Fetching and merging feature branches", conflict_strategy=strategy)

    def _cleanup_branches(self):
        """Clean up merged branches."""
        reply = QMessageBox.question(
            self,
            "Confirm Cleanup",
            "This will delete ALL merged remote branches from GitHub. Continue?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self._run_operation("cleanup", "Cleaning up merged branches")

    def _sync_all(self):
        """Full sync: commit, push, pull/merge, cleanup."""
        reply = QMessageBox.question(
            self,
            "Confirm Full Sync",
            "This will:\n"
            "1. Commit all changes\n"
            "2. Push to GitHub\n"
            "3. Fetch and merge feature branches\n"
            "4. Clean up merged branches\n\n"
            "Continue?",
            QMessageBox.Yes | QMessageBox.No
        )
        if reply != QMessageBox.Yes:
            return

        # Run operations sequentially
        self._log("\n" + "="*60)
        self._log("FULL SYNC STARTED")
        self._log("="*60)

        # TODO: Chain operations properly
        # For now, just run commit as first step
        self._run_operation("commit", "Step 1/4: Committing changes")


def show_conflict_resolution_dialog(parent, branch_name, conflicted_files):
    """
    Show a simple conflict resolution dialog.

    Returns: 'ours', 'theirs', or 'skip'
    """
    dialog = QMessageBox(parent)
    dialog.setWindowTitle("Merge Conflict Detected")
    dialog.setIcon(QMessageBox.Warning)

    files_list = '\n'.join(f"  • {f}" for f in conflicted_files[:10])
    if len(conflicted_files) > 10:
        files_list += f'\n  ... and {len(conflicted_files) - 10} more'

    dialog.setText(f"Conflict in branch: {branch_name}\n\n"
                   f"Conflicted files:\n{files_list}\n\n"
                   f"Choose how to resolve:")

    keep_mine = dialog.addButton("Keep My Code", QMessageBox.AcceptRole)
    keep_theirs = dialog.addButton("Keep Their Code", QMessageBox.ActionRole)
    skip_btn = dialog.addButton("Skip This Branch", QMessageBox.RejectRole)

    dialog.exec()

    clicked = dialog.clickedButton()
    if clicked == keep_mine:
        return 'ours'
    elif clicked == keep_theirs:
        return 'theirs'
    else:
        return 'skip'


def show_simple_git_dialog(parent=None):
    """Show the simple git dialog."""
    dialog = SimpleGitDialog(parent)
    dialog.exec()
