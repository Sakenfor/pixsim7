#!/usr/bin/env python3
"""Test script to diagnose launcher import issues"""
import sys
import traceback

print("=" * 60)
print("LAUNCHER IMPORT DIAGNOSTICS")
print("=" * 60)
print()

# Test 1: Check Python path
print("1. Python executable:", sys.executable)
print("2. Python version:", sys.version)
print()

# Test 2: Try importing launcher_core components
print("3. Testing launcher_core imports...")
print()

try:
    from pixsim7.launcher_core.process_manager import ProcessManager
    print("   ✓ ProcessManager imported successfully")
except Exception as e:
    print("   ✗ ProcessManager import FAILED:")
    traceback.print_exc()
    print()

try:
    from pixsim7.launcher_core.health_manager import HealthManager
    print("   ✓ HealthManager imported successfully")
except Exception as e:
    print("   ✗ HealthManager import FAILED:")
    traceback.print_exc()
    print()

try:
    from pixsim7.launcher_core.log_manager import LogManager
    print("   ✓ LogManager imported successfully")
except Exception as e:
    print("   ✗ LogManager import FAILED:")
    traceback.print_exc()
    print()

# Test 3: Try importing launcher GUI components
print()
print("4. Testing launcher GUI imports...")
print()

try:
    from scripts.launcher_gui.launcher_facade import LauncherFacade
    print("   ✓ LauncherFacade imported successfully")
except Exception as e:
    print("   ✗ LauncherFacade import FAILED:")
    traceback.print_exc()
    print()

try:
    from scripts.launcher_gui.service_adapter import ServiceProcessAdapter
    print("   ✓ ServiceProcessAdapter imported successfully")
except Exception as e:
    print("   ✗ ServiceProcessAdapter import FAILED:")
    traceback.print_exc()
    print()

try:
    from scripts.launcher_gui.qt_bridge import QtEventBridge
    print("   ✓ QtEventBridge imported successfully")
except Exception as e:
    print("   ✗ QtEventBridge import FAILED:")
    traceback.print_exc()
    print()

# Test 4: Check PySide6
print()
print("5. Testing PySide6 (Qt)...")
print()

try:
    from PySide6.QtWidgets import QApplication
    print("   ✓ PySide6 imported successfully")
except Exception as e:
    print("   ✗ PySide6 import FAILED:")
    traceback.print_exc()
    print()

print()
print("=" * 60)
print("DIAGNOSTICS COMPLETE")
print("=" * 60)
