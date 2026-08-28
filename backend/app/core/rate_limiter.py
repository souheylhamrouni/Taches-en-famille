"""In-memory rate limiter for brute-force sensitive endpoints (e.g. PIN & Login)."""
import time
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import HTTPException


class InMemoryRateLimiter:
    def __init__(self):
        # Map: key -> list of timestamps
        self._requests: Dict[str, List[float]] = defaultdict(list)
        # Map: key -> lockout timestamp
        self._lockouts: Dict[str, float] = {}

    def check(self, key: str, max_attempts: int = 5, window_seconds: int = 60, lockout_seconds: int = 300):
        """
        Check if key has exceeded max attempts. Raises HTTPException(429) if exceeded.
        """
        now = time.time()
        
        # Check if currently locked out
        if key in self._lockouts:
            if now < self._lockouts[key]:
                remaining = int(self._lockouts[key] - now)
                raise HTTPException(
                    status_code=429,
                    detail=f"Trop de tentatives. Veuillez réessayer dans {remaining} secondes."
                )
            else:
                del self._lockouts[key]
                self._requests[key] = []

        # Filter out timestamps outside current window
        cutoff = now - window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

        if len(self._requests[key]) >= max_attempts:
            self._lockouts[key] = now + lockout_seconds
            raise HTTPException(
                status_code=429,
                detail=f"Trop de tentatives erronées. Compte temporairement bloqué pendant {lockout_seconds // 60} minutes."
            )

    def record_failure(self, key: str):
        """Record an attempt failure."""
        self._requests[key].append(time.time())

    def reset(self, key: str):
        """Reset attempts on success."""
        if key in self._requests:
            del self._requests[key]
        if key in self._lockouts:
            del self._lockouts[key]


pin_limiter = InMemoryRateLimiter()
auth_limiter = InMemoryRateLimiter()
