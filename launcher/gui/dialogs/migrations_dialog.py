from PySide6.QtWidgets import QDialog, QVBoxLayout

try:
    from ..widgets.migrations_widget import MigrationsWidget
    from .. import theme
except ImportError:
    from widgets.migrations_widget import MigrationsWidget
    import theme


def show_migrations_dialog(parent):
    dlg = QDialog(parent)
    dlg.setWindowTitle('Database Migrations Manager')
    dlg.setMinimumWidth(700)
    dlg.setMinimumHeight(550)
    dlg.setStyleSheet(
        theme.get_dialog_stylesheet()
        + theme.get_button_stylesheet()
        + theme.get_scrollbar_stylesheet()
    )

    layout = QVBoxLayout(dlg)
    widget = MigrationsWidget(
        parent=dlg,
        notify_target=parent,
        show_close_button=True,
        on_close=dlg.accept,
    )
    layout.addWidget(widget)

    dlg.exec()
