"""
Simple script to integrate DatabaseLogViewer into launcher.py
Run this with: python integrate_db_logs.py
"""
import re

print("Integrating Database Log Viewer into launcher.py...")
print("=" * 60)

# Read the file
with open('launcher.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Check if already integrated
if 'DatabaseLogViewer' in content:
    print("✓ Already integrated!")
    exit(0)

print("Backing up original to launcher.py.backup...")
with open('launcher.py.backup', 'w', encoding='utf-8') as f:
    f.write(content)

# 1. Add QTabWidget to imports
print("1. Adding QTabWidget to imports...")
content = content.replace(
    'QScrollArea, QFrame, QGridLayout\n)',
    'QScrollArea, QFrame, QGridLayout, QTabWidget\n)'
)

# 2. Add DatabaseLogViewer import in try block
print("2. Adding DatabaseLogViewer import (try block)...")
content = content.replace(
    '    from .migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head\nexcept ImportError:',
    '    from .migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head\n    from .database_log_viewer import DatabaseLogViewer\nexcept ImportError:'
)

# 3. Add DatabaseLogViewer import in except block
print("3. Adding DatabaseLogViewer import (except block)...")
content = content.replace(
    '    from migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head\n\n\nclass HealthStatus',
    '    from migration_tools import get_current_revision, get_heads, get_history, upgrade_head, downgrade_one, stamp_head\n    from database_log_viewer import DatabaseLogViewer\n\n\nclass HealthStatus'
)

# 4. Add tab widget and wrap logs section
print("4. Wrapping log section in tabs...")

# Find the right panel section and add tab widget
content = content.replace(
    '        # Right panel: log tail\n        right = QWidget()\n        right_layout = QVBoxLayout(right)\n        right_layout.setContentsMargins(8, 8, 8, 8)\n        splitter.addWidget(right)\n\n        # Log header',
    '''        # Right panel: log tabs
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(8, 8, 8, 8)
        splitter.addWidget(right)

        # Create tab widget
        self.log_tabs = QTabWidget()

        # File logs tab
        file_log_tab = QWidget()
        file_log_layout = QVBoxLayout(file_log_tab)

        # Log header'''
)

# Change right_layout to file_log_layout for log components
print("5. Updating layout references...")
content = content.replace('file_log_layout.addLayout(log_header_layout)', 'file_log_layout.addLayout(log_header_layout)', 1)
content = content.replace('        right_layout.addLayout(log_header_layout)', '        file_log_layout.addLayout(log_header_layout)')
content = content.replace('        right_layout.addLayout(filter_layout)', '        file_log_layout.addLayout(filter_layout)')
content = content.replace('        right_layout.addWidget(self.log_view)', '        file_log_layout.addWidget(self.log_view)')
content = content.replace('        right_layout.addLayout(log_btn_row)', '        file_log_layout.addLayout(log_btn_row)')

# Add tabs at the end of log section
print("6. Adding database log tab...")
content = content.replace(
    '        file_log_layout.addLayout(log_btn_row)\n\n        # Connections',
    '''        file_log_layout.addLayout(log_btn_row)

        # Add file logs tab
        self.log_tabs.addTab(file_log_tab, "File Logs")

        # Add database logs tab
        self.db_log_viewer = DatabaseLogViewer()
        self.log_tabs.addTab(self.db_log_viewer, "Database Logs")

        # Add tabs to right layout
        right_layout.addWidget(self.log_tabs)

        # Connections'''
)

# Write the modified content
print("Writing changes to launcher.py...")
with open('launcher.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n" + "=" * 60)
print("✓ Integration complete!")
print("✓ Backup saved to: launcher.py.backup")
print("\nYou can now run the launcher and see two tabs:")
print("  - File Logs (existing)")
print("  - Database Logs (new!)")
print("\nRun with: python launcher.py")
