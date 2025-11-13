"""
Device discovery and sync service

Discovers ADB-connected devices and syncs to AndroidDevice table.
Extensible: emulator detection can be added later.
"""
from typing import Dict
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.automation import AndroidDevice, DeviceStatus, DeviceType, ConnectionMethod
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

        # Mark all as offline initially (optional optimization: only for ADB connection_method)
        result = await self.db.execute(select(AndroidDevice))
        all_devices = result.scalars().all()
        for d in all_devices:
            d.status = DeviceStatus.OFFLINE
        await self.db.commit()

        # Scan
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

            status = DeviceStatus.ONLINE if state == "device" else DeviceStatus.ERROR

            # Heuristic: detect emulator-like ids and set fields
            dev_type = DeviceType.ADB
            instance_name = None
            instance_port = None
            if serial.startswith("emulator-"):
                dev_type = DeviceType.BLUESTACKS
                try:
                    instance_port = int(serial.split("-")[-1])
                except Exception:
                    instance_port = None
            elif ":" in serial:
                # 127.0.0.1:5555 etc.
                dev_type = DeviceType.BLUESTACKS
                try:
                    instance_port = int(serial.split(":")[-1])
                except Exception:
                    instance_port = None

            if not existing:
                # Create new
                dev = AndroidDevice(
                    name=serial,
                    device_type=dev_type,
                    connection_method=ConnectionMethod.ADB,
                    adb_id=serial,
                    instance_name=instance_name,
                    instance_port=instance_port,
                    status=status,
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
                if instance_port is not None:
                    existing.instance_port = instance_port
                existing.last_seen = now
                existing.updated_at = now
                updated += 1

        # Count remaining offline
        result = await self.db.execute(select(AndroidDevice).where(AndroidDevice.status == DeviceStatus.OFFLINE))
        offline = len(result.scalars().all())

        await self.db.commit()
        return {"scanned": scanned, "added": added, "updated": updated, "offline": offline}
