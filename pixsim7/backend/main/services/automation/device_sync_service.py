"""
Device discovery and sync service

Discovers ADB-connected devices and syncs to AndroidDevice table.
Also monitors devices for ad activity and updates status accordingly.
"""
from typing import Dict
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain.automation import AndroidDevice, DeviceStatus, DeviceType, ConnectionMethod
from .adb import ADB

logger = configure_logging("device_sync")


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

        # 2. Also try common emulator ports for first-time discovery
        # BlueStacks: 5555-5559 (odd ports usually)
        # MuMu12: 16384 + (instance * 32) = 16384, 16416, 16448, 16480...
        common_ports = [
            5555, 5557, 5559,  # BlueStacks
            16384, 16416, 16448, 16480, 16512, 16544,  # MuMu12 (first 6 instances)
        ]
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
        now = datetime.now(timezone.utc)

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
            android_id = None
            primary_device = None

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

                    # Get android_id for deduplication
                    android_id = await self.adb.get_android_id(serial)

                except Exception as e:
                    # If device info query fails, use generic ADB type (don't assume BlueStacks)
                    if serial.startswith("emulator-") or ":" in serial:
                        dev_type = DeviceType.ADB
                        device_name = f"Emulator:{instance_port}" if instance_port else serial

            # Check for duplicate connections (same android_id, different adb_id)
            # Skip duplicate detection for MuMu clones - they share android_id but are distinct instances
            # MuMu12 uses ports 16384, 16416, 16448, etc. (16384 + instance * 32)
            is_mumu_clone_port = instance_port and 16384 <= instance_port <= 16640

            if android_id and not existing and not (dev_type == DeviceType.MUMU and is_mumu_clone_port):
                result = await self.db.execute(
                    select(AndroidDevice).where(
                        AndroidDevice.device_serial == android_id,
                        AndroidDevice.primary_device_id.is_(None),  # Only match primary devices
                    )
                )
                primary_device = result.scalars().first()

            if not existing:
                # If this is a duplicate connection to an existing device, link it
                if primary_device:
                    # This is a secondary connection - link to primary and mark as such
                    dev = AndroidDevice(
                        name=f"{device_name} (alt)",
                        device_type=dev_type,
                        connection_method=ConnectionMethod.ADB,
                        adb_id=serial,
                        device_serial=android_id,
                        primary_device_id=primary_device.id,
                        instance_name=instance_name,
                        instance_port=instance_port,
                        status=status,
                        error_message=error_msg,
                        last_seen=now,
                        created_at=now,
                        updated_at=now,
                    )
                    logger.info(
                        "device_duplicate_detected",
                        adb_id=serial,
                        android_id=android_id,
                        primary_id=primary_device.id,
                        primary_adb_id=primary_device.adb_id,
                    )
                else:
                    # New primary device
                    dev = AndroidDevice(
                        name=device_name,
                        device_type=dev_type,
                        connection_method=ConnectionMethod.ADB,
                        adb_id=serial,
                        device_serial=android_id,
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
                existing.error_message = error_msg
                if instance_port is not None:
                    existing.instance_port = instance_port
                if instance_name is not None:
                    existing.instance_name = instance_name

                # Update android_id if we have one
                if android_id and not existing.device_serial:
                    existing.device_serial = android_id

                # Check if this existing device should be linked as duplicate
                # Skip for MuMu clones on distinct ports (they share android_id but are separate instances)
                existing_is_mumu_clone = existing.instance_port and 16384 <= existing.instance_port <= 16640

                # For MuMu12 clones, actively clear any incorrect duplicate linking
                if dev_type == DeviceType.MUMU and existing_is_mumu_clone and existing.primary_device_id:
                    existing.primary_device_id = None
                    # Also remove (alt) suffix if present
                    if "(alt)" in existing.name:
                        existing.name = existing.name.replace(" (alt)", "")

                if android_id and not existing.primary_device_id and not (dev_type == DeviceType.MUMU and existing_is_mumu_clone):
                    dup_result = await self.db.execute(
                        select(AndroidDevice).where(
                            AndroidDevice.device_serial == android_id,
                            AndroidDevice.id != existing.id,
                            AndroidDevice.primary_device_id.is_(None),
                        )
                    )
                    other_primary = dup_result.scalars().first()
                    if other_primary and other_primary.id < existing.id:
                        # The other device was created first, make it the primary
                        existing.primary_device_id = other_primary.id
                        if "(alt)" not in existing.name:
                            existing.name = f"{existing.name} (alt)"
                        logger.info(
                            "device_duplicate_linked",
                            adb_id=serial,
                            android_id=android_id,
                            primary_id=other_primary.id,
                        )

                # Smart rename: update name if device type changed or name needs refresh
                name_lower = existing.name.lower()
                emulator_types = {DeviceType.MUMU, DeviceType.BLUESTACKS, DeviceType.NOX, DeviceType.LDPLAYER, DeviceType.GENYMOTION}
                emulator_keywords = {"mumu", "bluestacks", "nox", "ldplayer", "genymotion", "emulator"}

                should_rename = (
                    # Device type changed (e.g., was BlueStacks, now detected as MuMu)
                    existing.device_type != dev_type or
                    # Name was just the serial
                    existing.name == existing.adb_id or
                    # Name contains old incorrect type (e.g., "BlueStacks" but type is now mumu)
                    (dev_type != DeviceType.BLUESTACKS and "bluestacks" in name_lower) or
                    (dev_type != DeviceType.MUMU and "mumu" in name_lower) or
                    (dev_type != DeviceType.NOX and "nox" in name_lower) or
                    (dev_type != DeviceType.LDPLAYER and "ldplayer" in name_lower) or
                    # Emulator type but name doesn't reflect it (e.g., spoofed Samsung model)
                    (dev_type in emulator_types and not any(kw in name_lower for kw in emulator_keywords))
                )
                if should_rename and device_name and device_name != serial:
                    # Add (alt) suffix for secondary devices
                    if existing.primary_device_id:
                        existing.name = f"{device_name} (alt)"
                    else:
                        existing.name = device_name

                existing.device_type = dev_type
                existing.last_seen = now
                existing.updated_at = now
                updated += 1

        # Count remaining offline
        result = await self.db.execute(select(AndroidDevice).where(AndroidDevice.status == DeviceStatus.OFFLINE))
        offline = len(result.scalars().all())

        await self.db.commit()
        return {"scanned": scanned, "added": added, "updated": updated, "offline": offline}

    # How long to consider a device "in ad session" after last ad detected
    AD_SESSION_TIMEOUT_SECONDS = 60

    async def check_device_ads(self) -> Dict[str, int]:
        """
        Check all online devices for ad activity and update their status.

        Uses session-based detection:
        - When ad detected: start session, mark device BUSY
        - When no ad but session active within timeout: keep device BUSY (user between ads)
        - When no ad and session expired: clear session, mark device ONLINE

        Returns dict with counts: checked, watching_ads, in_session, cleared
        """
        checked = 0
        watching_ads = 0
        in_session = 0
        cleared = 0
        now = datetime.now(timezone.utc)

        # Get all online/busy devices (include BUSY to track ongoing sessions)
        result = await self.db.execute(
            select(AndroidDevice).where(
                AndroidDevice.status.in_([DeviceStatus.ONLINE, DeviceStatus.BUSY]),
                AndroidDevice.connection_method == ConnectionMethod.ADB,
                AndroidDevice.primary_device_id.is_(None),  # Only check primary devices
            )
        )
        devices = result.scalars().all()

        for device in devices:
            checked += 1
            try:
                is_ad, activity = await self.adb.is_ad_playing(device.adb_id)
                device.current_activity = activity

                if is_ad:
                    # Ad detected - start or continue session
                    if not device.ad_session_started_at:
                        device.ad_session_started_at = now
                        logger.info("ad_session_started", device=device.name, adb_id=device.adb_id)
                    device.is_watching_ad = True
                    if device.status != DeviceStatus.BUSY:
                        device.status = DeviceStatus.BUSY
                    watching_ads += 1

                elif device.ad_session_started_at:
                    # No ad detected, but session was active
                    session_age = (now - device.ad_session_started_at).total_seconds()

                    if session_age < self.AD_SESSION_TIMEOUT_SECONDS:
                        # Session still active - user likely between ads
                        device.is_watching_ad = False  # Not actively watching
                        # Keep device BUSY
                        in_session += 1
                    else:
                        # Session expired - user done with ads
                        device.is_watching_ad = False
                        device.ad_session_started_at = None
                        if device.status == DeviceStatus.BUSY and device.assigned_account_id is None:
                            device.status = DeviceStatus.ONLINE
                        logger.info("ad_session_ended", device=device.name, adb_id=device.adb_id)
                        cleared += 1
                else:
                    # No ad and no session - ensure clean state
                    if device.is_watching_ad:
                        device.is_watching_ad = False
                        cleared += 1

            except Exception:
                # Device might have disconnected
                pass

        await self.db.commit()
        return {"checked": checked, "watching_ads": watching_ads, "in_session": in_session, "cleared": cleared}


async def poll_device_ads(ctx: dict) -> Dict[str, int]:
    """
    ARQ cron job to poll all devices for ad activity.

    This runs periodically to check if any device is watching ads
    and marks them as BUSY so automation doesn't try to use them.
    """
    from pixsim7.backend.main.infrastructure.database.session import get_db

    async for db in get_db():
        try:
            service = DeviceSyncService(db)
            result = await service.check_device_ads()

            if result["watching_ads"] > 0 or result["cleared"] > 0:
                logger.info(
                    "device_ad_poll",
                    checked=result["checked"],
                    watching_ads=result["watching_ads"],
                    cleared=result["cleared"],
                )

            return result

        except Exception as e:
            logger.error("device_ad_poll_error", error=str(e))
            return {"checked": 0, "watching_ads": 0, "cleared": 0, "error": str(e)}

        finally:
            await db.close()

    return {"checked": 0, "watching_ads": 0, "cleared": 0}
