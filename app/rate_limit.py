from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import threading
import time
from typing import Callable


LOGIN_RATE_LIMIT_MAX_FAILURES = 5
LOGIN_IP_RATE_LIMIT_MAX_FAILURES = 20
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int = 0


class WindowRateLimiter:
    def __init__(
        self,
        *,
        max_failures: int,
        window_seconds: int,
        clock: Callable[[], float] | None = None,
    ):
        self.max_failures = max(1, int(max_failures))
        self.window_seconds = max(1, int(window_seconds))
        self.clock = clock or time.monotonic
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.RLock()

    def check(self, key: str) -> RateLimitDecision:
        with self._lock:
            now = self.clock()
            failures = self._pruned_failures(key, now)
            return self._decision_from_failures(failures, now)

    def consume_failure(self, key: str) -> RateLimitDecision:
        with self._lock:
            now = self.clock()
            failures = self._pruned_failures(key, now)
            decision = self._decision_from_failures(failures, now)
            if not decision.allowed:
                return decision

            failures.append(now)
            self._failures[key] = failures
            return RateLimitDecision(allowed=True)

    def record_failure(self, key: str) -> None:
        self.consume_failure(key)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def _decision_from_failures(self, failures: list[float], now: float) -> RateLimitDecision:
        if len(failures) < self.max_failures:
            return RateLimitDecision(allowed=True)

        oldest = min(failures)
        retry_after = max(1, int((oldest + self.window_seconds) - now))
        return RateLimitDecision(allowed=False, retry_after_seconds=retry_after)

    def _pruned_failures(self, key: str, now: float) -> list[float]:
        cutoff = now - self.window_seconds
        failures = [failure for failure in self._failures.get(key, []) if failure >= cutoff]
        if failures:
            self._failures[key] = failures
        else:
            self._failures.pop(key, None)
        return failures


def admin_login_ip_rate_limit_key(client_ip: str) -> str:
    return sha256(client_ip.strip().encode("utf-8")).hexdigest()


def admin_login_rate_limit_key(client_ip: str, username: str) -> str:
    identity = f"{client_ip.strip()}|{username.strip().casefold()}"
    return sha256(identity.encode("utf-8")).hexdigest()
