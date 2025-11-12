import asyncio
import redis.asyncio as redis

async def test():
    print("Connecting to redis://localhost:6380/0...")
    try:
        client = await asyncio.wait_for(
            redis.from_url("redis://localhost:6380/0", encoding="utf-8", decode_responses=True),
            timeout=3.0
        )
        print("Connected!")
        result = await client.ping()
        print(f"PING result: {result}")
        await client.close()
    except asyncio.TimeoutError:
        print("TIMEOUT connecting to Redis!")
    except Exception as e:
        print(f"ERROR: {e}")

asyncio.run(test())
