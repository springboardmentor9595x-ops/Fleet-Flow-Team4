import os
import json
import time
from typing import Optional, Any

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client = None
_in_memory_cache = {}  # key -> (value, expire_at)


def is_redis_available() -> bool:
    """Returns True if Redis is connected and responsive, False otherwise."""
    client = get_redis_client()
    return client is not None


def get_redis_client():
    """
    Returns an active Redis client connection if Redis is available.
    If Redis is unavailable or fails ping, returns None cleanly for graceful fallback.
    """
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=0.5)
            if client.ping():
                _redis_client = client
                print("[Redis] Successfully connected to Redis server.")
            else:
                _redis_client = False
                print("[Redis] Redis ping failed. Using in-memory fallback cache.")
        except Exception as exc:
            _redis_client = False
            print(f"[Redis] Redis server unavailable ({exc}). Using in-memory fallback cache.")

    if _redis_client is not False and _redis_client is not None:
        return _redis_client
    else:
        return None


def cache_get(key: str) -> Optional[Any]:
    """
    Retrieves a cached value by key.
    If Redis is available, fetches from Redis.
    If Redis is unavailable, falls back to in-memory dictionary cache.
    """
    client = get_redis_client()
    if client is not None:
        try:
            val = client.get(key)
            if val:
                return json.loads(val)
        except Exception as exc:
            print(f"[Redis Cache] Read error ({exc}). Falling back to in-memory cache.")

    # Fallback to in-memory cache if Redis is unavailable or failed
    if key in _in_memory_cache:
        val, expire_at = _in_memory_cache[key]
        if expire_at is None or time.time() < expire_at:
            return val
        else:
            del _in_memory_cache[key]
    return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300):
    """
    Stores a key-value pair in cache.
    If Redis is available, stores in Redis with TTL.
    If Redis is unavailable, falls back to in-memory dictionary cache.
    """
    client = get_redis_client()
    if client is not None:
        try:
            client.setex(key, ttl_seconds, json.dumps(value))
            return
        except Exception as exc:
            print(f"[Redis Cache] Write error ({exc}). Falling back to in-memory cache.")

    # Fallback to in-memory cache if Redis is unavailable or failed
    expire_at = time.time() + ttl_seconds if ttl_seconds else None
    _in_memory_cache[key] = (value, expire_at)


def cache_delete(key: str):
    """Deletes a cached key from both Redis (if available) and in-memory cache."""
    client = get_redis_client()
    if client is not None:
        try:
            client.delete(key)
        except Exception:
            pass

    if key in _in_memory_cache:
        del _in_memory_cache[key]


def cache_flush():
    """Flushes all keys from both Redis (if available) and in-memory cache."""
    client = get_redis_client()
    if client is not None:
        try:
            client.flushdb()
        except Exception:
            pass

    _in_memory_cache.clear()
