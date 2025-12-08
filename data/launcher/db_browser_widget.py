"""
Simple Database Manager UI for PixSim7 Launcher

Features:
- View accounts with passwords
- Copy credentials to clipboard
- Export to CSV
- Basic search/filter
"""
import sys
from pathlib import Path

# Go up 3 levels: data/launcher/db_browser_widget.py -> data/launcher -> data -> project_root
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

import asyncio
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, QTableWidgetItem,
    QPushButton, QLineEdit, QLabel, QComboBox, QMessageBox, QApplication,
    QHeaderView
)
from PyQt6.QtCore import Qt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select

from pixsim7.backend.main.domain import ProviderAccount, User


class DatabaseBrowserWidget(QWidget):
    """Database browser tab for launcher"""
    
    def __init__(self, db_url: str = "postgresql+asyncpg://pixsim7:pixsim7_secure_2024@localhost:5433/pixsim7"):
        super().__init__()
        self.db_url = db_url
        self.engine = None
        self.accounts = []
        self.init_ui()
    
    def init_ui(self):
        layout = QVBoxLayout()
        
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
        
        self.refresh_btn = QPushButton("🔄 Refresh")
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
        
        self.copy_email_btn = QPushButton("📋 Copy Email")
        self.copy_email_btn.clicked.connect(lambda: self.copy_cell(0))
        action_layout.addWidget(self.copy_email_btn)
        
        self.copy_password_btn = QPushButton("🔑 Copy Password")
        self.copy_password_btn.clicked.connect(lambda: self.copy_cell(2))
        action_layout.addWidget(self.copy_password_btn)
        
        self.export_btn = QPushButton("💾 Export CSV")
        self.export_btn.clicked.connect(self.export_csv)
        action_layout.addWidget(self.export_btn)
        
        action_layout.addStretch()
        layout.addLayout(action_layout)
        
        self.setLayout(layout)
        
        # Load initial data
        asyncio.create_task(self.load_accounts())
    
    async def load_accounts(self):
        """Load accounts from database"""
        try:
            if not self.engine:
                self.engine = create_async_engine(self.db_url, echo=False)
            
            AsyncSessionLocal = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
            
            async with AsyncSessionLocal() as session:
                query = select(ProviderAccount)
                
                # Filter by provider
                provider = self.provider_combo.currentText()
                if provider != "All":
                    query = query.where(ProviderAccount.provider_id == provider)
                
                query = query.order_by(ProviderAccount.provider_id, ProviderAccount.email)
                
                result = await session.execute(query)
                self.accounts = result.scalars().all()
                
                self.populate_table()
        
        except Exception as e:
            QMessageBox.critical(self, "Database Error", f"Failed to load accounts:\n{e}")
    
    def populate_table(self):
        """Populate table with account data"""
        search_text = self.search_input.text().lower()
        
        # Filter accounts by search
        filtered = [
            acc for acc in self.accounts
            if not search_text or 
            search_text in (acc.email or "").lower() or
            search_text in (acc.nickname or "").lower()
        ]
        
        self.table.setRowCount(len(filtered))
        
        for row, acc in enumerate(filtered):
            # Email
            self.table.setItem(row, 0, QTableWidgetItem(acc.email or ""))
            
            # Provider
            self.table.setItem(row, 1, QTableWidgetItem(acc.provider_id))
            
            # Password
            pwd_item = QTableWidgetItem(acc.password or "N/A")
            if acc.password:
                pwd_item.setForeground(Qt.GlobalColor.darkGreen)
            self.table.setItem(row, 2, pwd_item)
            
            # Nickname
            self.table.setItem(row, 3, QTableWidgetItem(acc.nickname or ""))
            
            # Status
            status_item = QTableWidgetItem(acc.status.value)
            if acc.status.value == "active":
                status_item.setForeground(Qt.GlobalColor.darkGreen)
            elif acc.status.value == "exhausted":
                status_item.setForeground(Qt.GlobalColor.red)
            self.table.setItem(row, 4, status_item)
            
            # Credits (from relationship if loaded)
            credits = "N/A"
            if hasattr(acc, 'credits') and acc.credits:
                total = sum(c.amount for c in acc.credits)
                credits = str(total)
            self.table.setItem(row, 5, QTableWidgetItem(credits))
            
            # Videos
            self.table.setItem(row, 6, QTableWidgetItem(str(acc.total_videos_generated)))
    
    def filter_table(self):
        """Filter table based on search input"""
        self.populate_table()
    
    def copy_cell(self, column: int):
        """Copy selected cell to clipboard"""
        selected = self.table.selectedItems()
        if not selected:
            QMessageBox.information(self, "No Selection", "Please select a row first")
            return
        
        row = self.table.currentRow()
        item = self.table.item(row, column)
        if item:
            text = item.text()
            if text and text != "N/A":
                QApplication.clipboard().setText(text)
                QMessageBox.information(self, "Copied", f"Copied to clipboard:\n{text}")
            else:
                QMessageBox.information(self, "No Data", "No data to copy")
    
    def export_csv(self):
        """Export accounts to CSV"""
        try:
            from datetime import datetime
            filename = f"accounts_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            filepath = Path.home() / "Downloads" / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                # Header
                f.write("Email,Provider,Password,Nickname,Status,Videos Generated\n")
                
                # Data
                for acc in self.accounts:
                    f.write(f'"{acc.email}","{acc.provider_id}","{acc.password or ""}","{acc.nickname or ""}","{acc.status.value}",{acc.total_videos_generated}\n')
            
            QMessageBox.information(self, "Export Successful", f"Exported to:\n{filepath}")
        
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export:\n{e}")
    
    def closeEvent(self, event):
        """Cleanup on close"""
        if self.engine:
            asyncio.create_task(self.engine.dispose())
        event.accept()


# Standalone app for testing
if __name__ == "__main__":
    import sys
    from PyQt6.QtWidgets import QApplication
    
    app = QApplication(sys.argv)
    widget = DatabaseBrowserWidget()
    widget.setWindowTitle("PixSim7 - Database Browser")
    widget.resize(1000, 600)
    widget.show()
    sys.exit(app.exec())
