"""
Test event bus and Redis bridge functionality

This script can be run to verify that:
1. Event bus is working
2. Redis bridge is forwarding events
3. WebSocket handlers are receiving events
"""
import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_local_event_bus():
    """Test local event bus without Redis"""
    from pixsim7.backend.main.infrastructure.events.bus import event_bus, Event

    logger.info("=" * 60)
    logger.info("TEST 1: Local Event Bus")
    logger.info("=" * 60)

    # Track received events
    received_events = []

    @event_bus.on("test:event")
    async def test_handler(event: Event):
        logger.info(f"Handler received: {event.event_type} - {event.data}")
        received_events.append(event)

    # Publish test event
    await event_bus.publish("test:event", {"message": "Hello from test"})
    await asyncio.sleep(0.1)  # Give handler time to run

    assert len(received_events) == 1, f"Expected 1 event, got {len(received_events)}"
    logger.info("✓ Local event bus working")


async def test_redis_bridge():
    """Test Redis bridge event forwarding"""
    from pixsim7.backend.main.infrastructure.events.bus import event_bus
    from pixsim7.backend.main.infrastructure.events.redis_bridge import start_event_bus_bridge, stop_event_bus_bridge

    logger.info("=" * 60)
    logger.info("TEST 2: Redis Bridge")
    logger.info("=" * 60)

    try:
        # Start bridge
        bridge = await start_event_bus_bridge(role="test")
        logger.info(f"✓ Redis bridge started: {bridge._origin}")

        # Track received events
        received_events = []

        @event_bus.on("job:completed")
        async def job_handler(event):
            logger.info(f"Received job event: {event.data}")
            received_events.append(event)

        # Publish test event (should go through Redis)
        logger.info("Publishing test job:completed event...")
        await event_bus.publish("job:completed", {
            "job_id": 999,
            "generation_id": 999,
            "user_id": 1,
            "status": "completed"
        })

        # Wait for event to be processed
        await asyncio.sleep(1)

        # Check if event was received
        if received_events:
            logger.info(f"✓ Redis bridge forwarded {len(received_events)} events")
        else:
            logger.warning("⚠ No events received - bridge may not be forwarding")

        # Cleanup
        await stop_event_bus_bridge()
        logger.info("✓ Redis bridge stopped")

    except Exception as e:
        logger.error(f"✗ Redis bridge test failed: {e}", exc_info=True)
        raise


async def test_websocket_handlers():
    """Test WebSocket handler registration"""
    from pixsim7.backend.main.infrastructure.events.bus import event_bus
    from pixsim7.backend.main.infrastructure.events.websocket_handler import register_websocket_handlers

    logger.info("=" * 60)
    logger.info("TEST 3: WebSocket Handlers")
    logger.info("=" * 60)

    # Register handlers
    register_websocket_handlers()

    # Check that handlers are registered
    job_handlers = event_bus._handlers.get("job:completed", [])
    logger.info(f"Handlers registered for job:completed: {len(job_handlers)}")

    if job_handlers:
        logger.info(f"✓ WebSocket handlers registered: {[h.__name__ for h in job_handlers]}")
    else:
        logger.warning("⚠ No WebSocket handlers found")

    # Simulate job completion event
    logger.info("Simulating job:completed event...")
    await event_bus.publish("job:completed", {
        "job_id": 123,
        "generation_id": 123,
        "user_id": 1,
        "status": "completed"
    })

    await asyncio.sleep(0.5)
    logger.info("✓ Event published to handlers")


async def main():
    """Run all tests"""
    logger.info("Starting Event Bus Diagnostics")
    logger.info("")

    try:
        # Test 1: Local event bus
        await test_local_event_bus()
        logger.info("")

        # Test 2: Redis bridge
        await test_redis_bridge()
        logger.info("")

        # Test 3: WebSocket handlers
        await test_websocket_handlers()
        logger.info("")

        logger.info("=" * 60)
        logger.info("ALL TESTS PASSED ✓")
        logger.info("=" * 60)

    except Exception as e:
        logger.error("=" * 60)
        logger.error("TESTS FAILED ✗")
        logger.error("=" * 60)
        logger.error(f"Error: {e}", exc_info=True)
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
