from PySide6.QtWidgets import QDialog, QFormLayout, QLineEdit, QDialogButtonBox, QMessageBox

try:
    from ..config import Ports
    from .. import theme
except ImportError:
    from config import Ports
    import theme


def show_ports_dialog(parent, current_ports: Ports) -> Ports | None:
    dlg = QDialog(parent)
    dlg.setWindowTitle('Edit Ports')
    dlg.setModal(True)
    dlg.setMinimumWidth(400)
    # Use centralized dark theme
    dlg.setStyleSheet(theme.get_dialog_stylesheet() + theme.get_input_stylesheet())

    layout = QFormLayout(dlg)
    layout.setSpacing(12)
    layout.setContentsMargins(20, 20, 20, 20)

    backend_input = QLineEdit(str(current_ports.backend))
    frontend_input = QLineEdit(str(current_ports.frontend))
    game_frontend_input = QLineEdit(str(current_ports.game_frontend))
    game_service_input = QLineEdit(str(current_ports.game_service))
    devtools_input = QLineEdit(str(current_ports.devtools))
    admin_input = QLineEdit(str(current_ports.admin))

    layout.addRow('Backend Port:', backend_input)
    layout.addRow('Frontend Port:', frontend_input)
    layout.addRow('Game Frontend Port:', game_frontend_input)
    layout.addRow('Game Service Port:', game_service_input)
    layout.addRow('DevTools Port:', devtools_input)
    layout.addRow('Admin Port:', admin_input)

    result: Ports | None = None

    def on_accept():
        nonlocal result
        try:
            # Parse ports
            ports_dict = {
                'Backend': int(backend_input.text()),
                'Frontend': int(frontend_input.text()),
                'Game Frontend': int(game_frontend_input.text()),
                'Game Service': int(game_service_input.text()),
                'DevTools': int(devtools_input.text()),
                'Admin': int(admin_input.text()),
            }

            # Validate port range
            for name, port in ports_dict.items():
                if not (1 <= port <= 65535):
                    QMessageBox.warning(
                        dlg,
                        'Invalid Port',
                        f'{name} port must be between 1 and 65535.\nGot: {port}'
                    )
                    return

            # Check for duplicates
            port_values = list(ports_dict.values())
            seen = set()
            for name, port in ports_dict.items():
                if port in seen:
                    # Find which other service uses this port
                    duplicate_name = [n for n, p in ports_dict.items() if p == port and n != name][0]
                    QMessageBox.warning(
                        dlg,
                        'Duplicate Port',
                        f'{name} and {duplicate_name} cannot use the same port: {port}'
                    )
                    return
                seen.add(port)

            # All validations passed
            result = Ports(
                backend=ports_dict['Backend'],
                frontend=ports_dict['Frontend'],
                game_frontend=ports_dict['Game Frontend'],
                game_service=ports_dict['Game Service'],
                devtools=ports_dict['DevTools'],
                admin=ports_dict['Admin'],
            )
            dlg.accept()
        except ValueError as e:
            QMessageBox.warning(
                dlg,
                'Invalid Input',
                f'All ports must be valid integers.\nError: {e}'
            )

    buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
    buttons.accepted.connect(on_accept)
    buttons.rejected.connect(dlg.reject)
    layout.addRow(buttons)

    if dlg.exec() == QDialog.Accepted:
        return result
    return None
