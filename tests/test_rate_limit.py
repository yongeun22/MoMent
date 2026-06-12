import unittest
from concurrent.futures import ThreadPoolExecutor

from app.rate_limit import WindowRateLimiter, admin_login_ip_rate_limit_key, admin_login_rate_limit_key


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class RateLimitTests(unittest.TestCase):
    def test_blocks_after_configured_failures_and_expires(self):
        clock = FakeClock()
        limiter = WindowRateLimiter(max_failures=2, window_seconds=60, clock=clock)
        key = "client"

        self.assertTrue(limiter.check(key).allowed)
        limiter.record_failure(key)
        self.assertTrue(limiter.check(key).allowed)
        limiter.record_failure(key)

        decision = limiter.check(key)
        self.assertFalse(decision.allowed)
        self.assertGreater(decision.retry_after_seconds, 0)

        clock.now += 61
        self.assertTrue(limiter.check(key).allowed)

    def test_reset_clears_failures_after_success(self):
        limiter = WindowRateLimiter(max_failures=1, window_seconds=60, clock=lambda: 10.0)
        key = "client"

        limiter.consume_failure(key)
        self.assertFalse(limiter.check(key).allowed)
        limiter.reset(key)

        self.assertTrue(limiter.check(key).allowed)

    def test_concurrent_failure_consumption_does_not_exceed_limit(self):
        limiter = WindowRateLimiter(max_failures=5, window_seconds=60, clock=lambda: 10.0)
        key = "client"

        with ThreadPoolExecutor(max_workers=20) as executor:
            decisions = list(executor.map(lambda _: limiter.consume_failure(key), range(20)))

        self.assertEqual(sum(decision.allowed for decision in decisions), 5)
        self.assertEqual(sum(not decision.allowed for decision in decisions), 15)

    def test_ip_bucket_blocks_username_rotation(self):
        limiter = WindowRateLimiter(max_failures=3, window_seconds=60, clock=lambda: 10.0)
        ip_key = admin_login_ip_rate_limit_key("127.0.0.1")

        for username in ("admin", "owner", "test"):
            self.assertTrue(limiter.consume_failure(ip_key).allowed, username)

        self.assertFalse(limiter.consume_failure(ip_key).allowed)

    def test_admin_login_key_is_normalized_and_hashed(self):
        left = admin_login_rate_limit_key(" 127.0.0.1 ", "Admin")
        right = admin_login_rate_limit_key("127.0.0.1", " admin ")

        self.assertEqual(left, right)
        self.assertNotIn("admin", left)

    def test_admin_login_keys_keep_ip_buckets_separate(self):
        left = admin_login_ip_rate_limit_key("127.0.0.1")
        right = admin_login_ip_rate_limit_key("127.0.0.2")

        self.assertNotEqual(left, right)
        self.assertNotIn("127.0.0.1", left)


if __name__ == "__main__":
    unittest.main()
