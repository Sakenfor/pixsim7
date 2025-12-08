from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QLabel, QScrollArea, QWidget, QFormLayout, QLineEdit,
    QHBoxLayout, QPushButton, QDialogButtonBox, QInputDialog, QMessageBox
)

try:
    from ..config import read_env_file
    from .. import theme
except ImportError:
    from config import read_env_file
    import theme


def show_env_editor(parent) -> dict | None:
    dlg = QDialog(parent)
    dlg.setWindowTitle('Edit Environment Variables')
    dlg.setModal(True)
    dlg.setMinimumWidth(600)
    dlg.setMinimumHeight(400)
    # Use centralized dark theme
    dlg.setStyleSheet(
        theme.get_dialog_stylesheet() +
        theme.get_input_stylesheet() +
        theme.get_scrollbar_stylesheet()
    )

    env_vars = read_env_file()
    result_env: dict = {}

    layout = QVBoxLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)

    info = QLabel('Edit environment variables in .env file:')
    info.setStyleSheet(f"color: {theme.TEXT_SECONDARY}; padding: 5px; font-weight: 500;")
    layout.addWidget(info)

    scroll = QScrollArea(); scroll.setWidgetResizable(True)
    scroll_widget = QWidget(); form_layout = QFormLayout(scroll_widget)
    form_layout.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)

    inputs: dict[str, QLineEdit] = {}

    common_vars = [
        'BACKEND_PORT', 'ADMIN_PORT', 'FRONTEND_PORT', 'GAME_FRONTEND_PORT',
        'DATABASE_URL', 'REDIS_URL', 'SECRET_KEY', 'DEBUG',
        'PIXVERSE_API_KEY', 'OPENAI_API_KEY'
    ]

    all_vars = sorted(set(list(env_vars.keys()) + common_vars))
    for var in all_vars:
        input_field = QLineEdit(env_vars.get(var, ''))
        input_field.setPlaceholderText('(not set)' if var not in env_vars else '')
        inputs[var] = input_field
        form_layout.addRow(f'{var}:', input_field)

    scroll.setWidget(scroll_widget)
    layout.addWidget(scroll)

    button_layout = QHBoxLayout()
    add_btn = QPushButton('Add New Variable')
    button_layout.addWidget(add_btn)
    button_layout.addStretch()

    buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
    button_layout.addWidget(buttons)
    layout.addLayout(button_layout)

    def add_variable():
        var_name, ok = QInputDialog.getText(dlg, 'Add Variable', 'Variable name:')
        if ok and var_name:
            vn = var_name.strip().upper()
            if vn in inputs:
                QMessageBox.warning(dlg, 'Variable Exists', f'{vn} already exists.')
                return
            input_field = QLineEdit('')
            inputs[vn] = input_field
            form_layout.addRow(f'{vn}:', input_field)

    def on_accept():
        result_env.clear()
        for var, input_field in inputs.items():
            value = input_field.text().strip()
            if value:
                result_env[var] = value
        dlg.accept()

    add_btn.clicked.connect(add_variable)
    buttons.accepted.connect(on_accept)
    buttons.rejected.connect(dlg.reject)

    if dlg.exec() == QDialog.Accepted:
        return dict(result_env)
    return None
