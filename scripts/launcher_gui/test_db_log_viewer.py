"""
Standalone test for Database Log Viewer.
Run this to test the viewer before integrating into the launcher.
"""
import sys
from PySide6.QtWidgets import QApplication
from database_log_viewer import DatabaseLogViewer

if __name__ == "__main__":
    app = QApplication(sys.argv)

    # Create and show the viewer
    viewer = DatabaseLogViewer(api_url="http://localhost:8001")
    viewer.setWindowTitle("Database Log Viewer - Test")
    viewer.resize(1200, 700)
    viewer.show()

    sys.exit(app.exec())
