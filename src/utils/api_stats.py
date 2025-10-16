"""
API call statistics tracking.
Thread-safe tracking of API calls and performance metrics.
"""
import time
import threading
from typing import Dict, Any


class APIStats:
    """Thread-safe API call statistics tracker."""

    def __init__(self):
        self.call_count = 0
        self.start_time = time.time()
        self.lock = threading.Lock()

    def increment(self) -> None:
        """Increment the API call counter (thread-safe)."""
        with self.lock:
            self.call_count += 1

    def get_stats(self) -> Dict[str, Any]:
        """
        Get API call statistics (thread-safe).

        Returns:
            Dictionary with total_calls and calls_per_minute
        """
        with self.lock:
            uptime_seconds = time.time() - self.start_time
            calls_per_minute = (self.call_count / uptime_seconds) * 60 if uptime_seconds > 0 else 0
            return {
                'total_calls': self.call_count,
                'calls_per_minute': round(calls_per_minute, 1)
            }


# Global instance
_api_stats = APIStats()


def increment_api_call() -> None:
    """Increment the API call counter."""
    _api_stats.increment()


def get_api_stats() -> Dict[str, Any]:
    """Get API call statistics."""
    return _api_stats.get_stats()
