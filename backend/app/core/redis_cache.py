import os
import json
import time
from typing import Optional, Any

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client = None
_in_memory_cache = {}  # key -> (value, expire_at)


def get_redis_client():
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=0.2)
            client.ping()
            _redis_client = client
            print("[Redis] Successfully connected to Redis server.")
        except Exception:
            _redis_client = False
            print("[Redis] Redis server not available. Using robust in-memory fallback cache.")
    return _redis_client if _redis_client is not False else None


def cache_get(key: str) -> Optional[Any]:
    client = get_redis_client()
    if client:
        try:
            val = client.get(key)
            if val:
                return json.loads(val)
        except Exception:
            pass

    # Fallback to in-memory cache
    if key in _in_memory_cache:
        val, expire_at = _in_memory_cache[key]
        if expire_at is None or time.time() < expire_at:
            return val
        else:
            del _in_memory_cache[key]
    return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300):
    client = get_redis_client()
    if client:
        try:
            client.setex(key, ttl_seconds, json.dumps(value))
            return
        except Exception:
            pass

    # Fallback to in-memory cache
    expire_at = time.time() + ttl_seconds if ttl_seconds else None
    _in_memory_cache[key] = (value, expire_at)
