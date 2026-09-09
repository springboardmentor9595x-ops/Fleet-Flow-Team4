import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.redis_cache import cache_set, cache_get, cache_delete, cache_flush, get_redis_client, is_redis_available


class TestRedisFallback(unittest.TestCase):

    def test_in_memory_fallback_when_redis_unavailable(self):
        """Tests in-memory cache fallback when Redis client is unavailable."""
        with patch("app.core.redis_cache.get_redis_client", return_value=None):
            self.assertFalse(is_redis_available())

            key = "test_fallback_key"
            val = {"status": "ok", "value": 123}

            cache_set(key, val, ttl_seconds=60)
            retrieved = cache_get(key)
            self.assertEqual(retrieved, val)

            cache_delete(key)
            self.assertIsNone(cache_get(key))

    def test_redis_available_usage(self):
        """Tests normal Redis usage when Redis client is available."""
        mock_client = MagicMock()
        mock_client.get.return_value = '{"status": "redis_ok"}'
        mock_client.setex.return_value = True

        with patch("app.core.redis_cache.get_redis_client", return_value=mock_client):
            self.assertTrue(is_redis_available())

            cache_set("redis_key", {"status": "redis_ok"}, ttl_seconds=60)
            self.assertTrue(mock_client.setex.called)

            res = cache_get("redis_key")
            self.assertEqual(res, {"status": "redis_ok"})
            self.assertTrue(mock_client.get.called)

    def test_redis_available_helper(self):
        """Tests is_redis_available helper logic."""
        with patch("app.core.redis_cache.get_redis_client", return_value=MagicMock()):
            self.assertTrue(is_redis_available())
        with patch("app.core.redis_cache.get_redis_client", return_value=None):
            self.assertFalse(is_redis_available())


if __name__ == "__main__":
    unittest.main()
