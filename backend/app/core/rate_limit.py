from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_real_client_ip(request: Request) -> str:
    """Extract real client IP behind reverse proxies (Nginx / Cloudflare / OCI Load Balancer)."""
    # 1. Check X-Forwarded-For header (client, proxy1, proxy2)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return client_ip

    # 2. Check X-Real-IP
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()

    # 3. Direct socket client host
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


class InMemoryRateLimiter:
    """Sliding-window in-memory rate limiter with automatic memory cleanup."""

    def __init__(
        self,
        general_limit_per_minute: int = 120,
        auth_limit_per_minute: int = 15,
        window_seconds: int = 60,
    ) -> None:
        self.general_limit = general_limit_per_minute
        self.auth_limit = auth_limit_per_minute
        self.window = float(window_seconds)
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_cleanup = time.time()
        self._cleanup_interval = 300.0  # clean up every 5 minutes

    def _is_exempt(self, request: Request) -> bool:
        path = request.url.path
        # Allow CORS preflight requests
        if request.method == "OPTIONS":
            return True
        # Allow health checks and OpenAPI docs
        if path == "/health" or path in ("/docs", "/redoc", "/openapi.json"):
            return True
        return False

    def _is_auth_route(self, path: str) -> bool:
        """Stricter limits on brute-forceable and spam-prone authentication routes."""
        sensitive_prefixes = (
            f"{settings.api_prefix}/auth/login",
            f"{settings.api_prefix}/auth/register",
            f"{settings.api_prefix}/auth/forgot-password",
        )
        return any(path.startswith(prefix) for prefix in sensitive_prefixes)

    def _maybe_cleanup(self, now: float) -> None:
        """Periodic cleanup to remove dead IP entries and keep memory bounded."""
        if now - self._last_cleanup < self._cleanup_interval:
            return
        self._last_cleanup = now
        cutoff = now - self.window
        stale_keys = [
            k
            for k, q in self.hits.items()
            if not q or q[-1] <= cutoff
        ]
        for k in stale_keys:
            del self.hits[k]

    def check_rate_limit(
        self, request: Request
    ) -> tuple[bool, int | None, int, int]:
        """Check if request passes rate limit.

        Returns: (is_allowed, retry_after_seconds, max_limit, remaining_requests)
        """
        if self._is_exempt(request):
            return True, None, 0, 0

        path = request.url.path
        client_ip = get_real_client_ip(request)
        is_auth = self._is_auth_route(path)

        limit = self.auth_limit if is_auth else self.general_limit
        tier = "auth" if is_auth else "gen"
        key = f"{tier}:{client_ip}"

        now = time.time()
        cutoff = now - self.window
        q = self.hits[key]

        # Purge entries outside sliding window
        while q and q[0] <= cutoff:
            q.popleft()

        # Check limit
        if len(q) >= limit:
            oldest = q[0]
            retry_after = max(1, int(oldest + self.window - now))
            return False, retry_after, limit, 0

        q.append(now)
        remaining = max(0, limit - len(q))

        # Opportunistic cleanup
        self._maybe_cleanup(now)

        return True, None, limit, remaining


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI / Starlette middleware enforcing IP-based sliding window rate limits."""

    def __init__(self, app, limiter: InMemoryRateLimiter | None = None) -> None:
        super().__init__(app)
        self.limiter = limiter or InMemoryRateLimiter(
            general_limit_per_minute=getattr(settings, "rate_limit_general_per_minute", 120),
            auth_limit_per_minute=getattr(settings, "rate_limit_auth_per_minute", 15),
        )

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # If rate limiting is globally disabled via settings, bypass
        if not getattr(settings, "rate_limit_enabled", True):
            return await call_next(request)

        allowed, retry_after, limit, remaining = self.limiter.check_rate_limit(request)

        if not allowed:
            logger.warning(
                "Rate limit exceeded for IP %s on %s %s (retry_after=%ss)",
                get_real_client_ip(request),
                request.method,
                request.url.path,
                retry_after,
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Too many requests. Please wait a moment before trying again.",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)

        # Attach rate limit metadata headers if applicable
        if limit > 0:
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response

