"""
Database browser widget for the launcher.

Embeds the account browser UI so it can live inside tabs without spawning
external processes.
"""
from __future__ import annotations

import asyncio

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QLineEdit, QLabel, QComboBox, QMessageBox,
    QHeaderView
)
from PySide6.QtCore import Qt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select

try:
    from ..config import read_env_file
except ImportError:
    from config import read_env_file

from pixsim7.backend.main.domain import ProviderAccount


def _normalize_async_db_url(db_url: str) -> str:
    """Ensure the DB URL uses an async driver (asyncpg)."""
    if "+asyncpg" in db_url:
        return db_url

    if db_url.startswith("postgresql+psycopg2://"):
        return db_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if db_url.startswith("postgresql+psycopg://"):
        return db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)

    if db_url.startswith("postgres://"):
        return "postgresql+asyncpg://" + db_url[len("postgres://"):]
    if db_url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + db_url[len("postgresql://"):]

    return db_url


def _resolve_db_url() -> str:
    env = read_env_file()
    return env.get(
        "DATABASE_URL",
        "postgresql+asyncpg://pixsim7:pixsim7_secure_2024@localhost:5433/pixsim7",
    )


class DatabaseBrowserWidget(QWidget):
    """Inline database browser for provider accounts."""

    def __init__(self, db_url: str | None = None, parent=None):
        super().__init__(parent)
        self.db_url = _normalize_async_db_url(db_url or _resolve_db_url())
        self.engine = None
        self.accounts = []
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)

        # Filters
        filter_layout = QHBoxLayout()

        filter_layout.addWidget(QLabel("Provider:"))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["All", "pixverse", "runway", "pika", "sora"])
        self.provider_combo.currentTextChanged.connect(self.load_accounts)
        filter_layout.addWidget(self.provider_combo)

        filter_layout.addWidget(QLabel("Search:"))
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Email or nickname...")
        self.search_input.textChanged.connect(self.filter_table)
        filter_layout.addWidget(self.search_input)

        self.refresh_btn = QPushButton("Refresh")
        self.refresh_btn.clicked.connect(self.load_accounts)
        filter_layout.addWidget(self.refresh_btn)

        layout.addLayout(filter_layout)

        # Table
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels([
            "Email", "Provider", "Password", "Nickname", "Status", "Credits", "Videos"
        ])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        layout.addWidget(self.table)

        # Actions
        action_layout = QHBoxLayout()

        self.copy_email_btn = QPushButton("Copy Email")
        self.copy_email_btn.clicked.connect(lambda: self.copy_cell(0))
        action_layout.addWidget(self.copy_email_btn)

        self.copy_password_btn = QPushButton("Copy Password")
        self.copy_password_btn.clicked.connect(lambda: self.copy_cell(2))
        action_layout.addWidget(self.copy_password_btn)

        self.export_btn = QPushButton("Export CSV")
        self.export_btn.clicked.connect(self.export_csv)
        action_layout.addWidget(self.export_btn)

        action_layout.addStretch()
        layout.addLayout(action_layout)

        # Load initial data
        self._run_async(self._load_accounts_async())

    def _run_async(self, coro):
        """Run async coroutine in a new event loop."""
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(coro)
        except Exception as exc:
            QMessageBox.critical(self, "Error", f"Async operation failed:\n{exc}")
        finally:
            loop.close()

    def load_accounts(self):
        """Load accounts from database (sync wrapper)."""
        self._run_async(self._load_accounts_async())

    async def _load_accounts_async(self):
        """Load accounts from database."""
        try:
            if not self.engine:
                self.engine = create_async_engine(self.db_url, echo=False)

            async_session = sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )

            async with async_session() as session:
                query = select(ProviderAccount)

                provider = self.provider_combo.currentText()
                if provider != "All":
                    query = query.where(ProviderAccount.provider_id == provider)

                query = query.order_by(ProviderAccount.provider_id, ProviderAccount.email)

                result = await session.execute(query)
                self.accounts = result.scalars().all()

                self.populate_table()

        except Exception as exc:
            QMessageBox.critical(self, "Database Error", f"Failed to load accounts:\n{exc}")

    def populate_table(self):
        """Populate table with account data."""
        search_text = self.search_input.text().lower()

        filtered = [
            acc for acc in self.accounts
            if not search_text
            or search_text in (acc.email or "").lower()
            or search_text in (acc.nickname or "").lower()
        ]

        self.table.setRowCount(len(filtered))

        for row, acc in enumerate(filtered):
            self.table.setItem(row, 0, QTableWidgetItem(acc.email or ""))
            self.table.setItem(row, 1, QTableWidgetItem(acc.provider_id))

            pwd_item = QTableWidgetItem(acc.password or "N/A")
            if acc.password:
                pwd_item.setForeground(Qt.GlobalColor.darkGreen)
            self.table.setItem(row, 2, pwd_item)

            self.table.setItem(row, 3, QTableWidgetItem(acc.nickname or ""))

            status_item = QTableWidgetItem(acc.status.value)
            if acc.status.value == "active":
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif acc.status.value == "exhausted":
                status_item.setForeground(Qt.GlobalColor.red)
            self.table.setItem(row, 4, status_item)

            credits = "N/A"
            if hasattr(acc, "credits") and acc.credits:
                total = sum(c.amount for c in acc.credits)
                credits = str(total)
            self.table.setItem(row, 5, QTableWidgetItem(credits))

            self.table.setItem(row, 6, QTableWidgetItem(str(acc.total_videos_generated)))

    def filter_table(self):
        """Filter table based on search input."""
        self.populate_table()

    def copy_cell(self, column: int):
        """Copy selected cell to clipboard."""
        selected = self.table.selectedItems()
        if not selected:
            QMessageBox.information(self, "No Selection", "Please select a row first")
            return

        row = self.table.currentRow()
        item = self.table.item(row, column)
        if not item:
            QMessageBox.information(self, "No Data", "Selected row has no data")
            return

        from PySide6.QtWidgets import QApplication

        QApplication.clipboard().setText(item.text())

    def export_csv(self):
        """Export table to CSV."""
        if not self.accounts:
            QMessageBox.information(self, "No Data", "No accounts to export")
            return

        from PySide6.QtWidgets import QFileDialog

        filename, _ = QFileDialog.getSaveFileName(self, "Export CSV", "", "CSV Files (*.csv)")
        if not filename:
            return

        if not filename.endswith(".csv"):
            filename += ".csv"

        try:
            import csv
            with open(filename, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Email", "Provider", "Password", "Nickname", "Status", "Credits", "Videos"])
                for acc in self.accounts:
                    credits = ""
                    if hasattr(acc, "credits") and acc.credits:
                        credits = str(sum(c.amount for c in acc.credits))
                    writer.writerow([
                        acc.email or "",
                        acc.provider_id,
                        acc.password or "",
                        acc.nickname or "",
                        acc.status.value,
                        credits,
                        acc.total_videos_generated,
                    ])

            QMessageBox.information(self, "Export Complete", f"Exported to:\n{filename}")
        except Exception as exc:
            QMessageBox.critical(self, "Export Error", f"Failed to export CSV:\n{exc}")
