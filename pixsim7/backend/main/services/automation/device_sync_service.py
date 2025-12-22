"""
Device discovery and sync service

Discovers ADB-connected devices and syncs to AndroidDevice table.
Extensible: emulator detection can be added later.
"""
from typing import Dict
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.automation import AndroidDevice, DeviceStatus, DeviceType, ConnectionMethod
from .adb import ADB


class DeviceSyncService:
    def __init__(self, db: AsyncSession, adb: ADB | None = None):
        self.db = db
        self.adb = adb or ADB()

    async def scan_and_sync(self) -> Dict[str, int]:
        """Scan ADB devices and sync database records.

        Returns dict with counts: scanned, added, updated, offline
        """
        scanned = 0
        added = 0
        updated = 0
        offline = 0

        # Try to connect to devices before scanning
        # 1. Try previously known device ports
        result = await self.db.execute(
            select(AndroidDevice).where(
                AndroidDevice.connection_method == ConnectionMethod.ADB,
                AndroidDevice.instance_port.isnot(None)
            )
        )
        known_devices = result.scalars().all()
        ports_to_try = set()
        for device in known_devices:
            if device.instance_port:
                ports_to_try.add(device.instance_port)

        # 2. Also try common BlueStacks ports for first-time discovery
        common_ports = [5555, 5556, 5557, 5558, 5559]
        ports_to_try.update(common_ports)

        # 3. Attempt connections
        for port in ports_to_try:
            try:
                await self.adb.connect(f"127.0.0.1:{port}")
            except Exception:
                pass  # Ignore connection failures

        # Mark all as offline initially (optional optimization: only for ADB connection_method)
        result = await self.db.execute(select(AndroidDevice))
        all_devices = result.scalars().all()
        for d in all_devices:
            d.status = DeviceStatus.OFFLINE
        await self.db.commit()

        # Scan (will also try common emulator ports)
        devices = await self.adb.devices()
        scanned = len(devices)
        now = datetime.utcnow()

        for serial, state in devices:
            # Find existing by adb_id
            existing = (
                await self.db.execute(
                    select(AndroidDevice).where(AndroidDevice.adb_id == serial)
                )
            ).scalars().first()

            # Map ADB state to device status
            error_msg = None
            if state == "device":
                status = DeviceStatus.ONLINE
            elif state == "offline":
                status = DeviceStatus.OFFLINE
            else:
                # unauthorized, no permissions, etc.
                status = DeviceStatus.ERROR
                error_msg = f"ADB state: {state}"

            # Extract port from serial if present
            instance_port = None
            if serial.startswith("emulator-"):
                try:
                    instance_port = int(serial.split("-")[-1])
                except Exception:
                    pass
            elif ":" in serial:
                # 127.0.0.1:5555 etc.
                try:
                    instance_port = int(serial.split(":")[-1])
                except Exception:
                    pass

            # Query device properties to detect emulator type and name
            dev_type = DeviceType.ADB
            instance_name = None
            device_name = serial  # Default to serial

            if status == DeviceStatus.ONLINE:
                try:
                    device_info = await self.adb.get_device_info(serial)
                    detected_type = device_info.get("detected_type", "adb")
                    detected_name = device_info.get("detected_name")

                    # Map detected type to DeviceType enum
                    type_mapping = {
                        "bluestacks": DeviceType.BLUESTACKS,
                        "mumu": DeviceType.MUMU,
                        "nox": DeviceType.NOX,
                        "ld": DeviceType.LDPLAYER,
                        "genymotion": DeviceType.GENYMOTION,
                        "adb": DeviceType.ADB,
                    }
                    dev_type = type_mapping.get(detected_type, DeviceType.ADB)

                    # Use detected name if available
                    if detected_name:
                        device_name = detected_name
                        instance_name = detected_name

                    # If we have a port, append it to make name unique
                    if instance_port and detected_name:
                        device_name = f"{detected_name}:{instance_port}"

                except Exception as e:
                    # If device info query fails, fall back to heuristics
                    if serial.startswith("emulator-") or ":" in serial:
                        dev_type = DeviceType.BLUESTACKS
                        device_name = f"Emulator:{instance_port}" if instance_port else serial

            if not existing:
                # Create new
                dev = AndroidDevice(
                    name=device_name,
                    device_type=dev_type,
                    connection_method=ConnectionMethod.ADB,
                    adb_id=serial,
                    instance_name=instance_name,
                    instance_port=instance_port,
                    status=status,
                    error_message=error_msg,
                    last_seen=now,
                    created_at=now,
                    updated_at=now,
                )
                self.db.add(dev)
                added += 1
            else:
                # Update existing
                existing.status = status
                existing.device_type = dev_type
                existing.error_message = error_msg
                if instance_port is not None:
                    existing.instance_port = instance_port
                if instance_name is not None:
                    existing.instance_name = instance_name
                # Update name if it was previously just the serial
                if existing.name == existing.adb_id and device_name != serial:
                    existing.name = device_name
                existing.last_seen = now
                existing.updated_at = now
                updated += 1

        # Count remaining offline
        result = await self.db.execute(select(AndroidDevice).where(AndroidDevice.status == DeviceStatus.OFFLINE))
        offline = len(result.scalars().all())

        await self.db.commit()
        return {"scanned": scanned, "added": added, "updated": updated, "offline": offline}
