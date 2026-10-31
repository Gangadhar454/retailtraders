from __future__ import annotations

import asyncio
import contextlib
import logging
import random
from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlencode

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes import admin, auth, brokers, leaderboard, pnl, upi, users
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine, init_models
from app.services.pnl_sync import sync_all_linked_brokers

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s :: %(message)s",
)
logger = logging.getLogger("netpnl")

DESCRIPTION = """
Verified P&L and peer-to-peer tipping for Indian retail traders.

* P&L can be entered manually (unverified) or fetched straight from a linked
    Upstox, Zerodha, or Angel One account (verified).
* Tips are pure peer-to-peer UPI intents. The platform never holds funds.
"""


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_models()
    logger.info("%s API ready (env=%s)", settings.app_name, settings.environment)

    sync_task: asyncio.Task[None] | None = None
    if settings.sync_enabled:
        sync_task = asyncio.create_task(_sync_loop())

    sim_task: asyncio.Task[None] | None = None
    if settings.simulation_enabled:
        sim_task = asyncio.create_task(_simulation_loop())

    try:
        yield
    finally:
        for t in (sync_task, sim_task):
            if t:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t
        await engine.dispose()


async def _sync_loop() -> None:
    """Periodically refresh verified P&L for every linked broker account."""
    interval = max(60, settings.sync_interval_minutes * 60)
    await asyncio.sleep(30)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                count = await sync_all_linked_brokers(db)
                await db.commit()
            if count:
                logger.info("Synced verified P&L for %s linked accounts", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Broker sync sweep failed")
        await asyncio.sleep(interval)


async def _simulation_loop() -> None:
    """Staggers realistic community publishes during market hours on weekdays (and continuously in local dev)."""
    from app.simulation.engine import is_market_open_ist, trigger_burst

    # Initial delay on boot
    await asyncio.sleep(15)
    while True:
        try:
            # Follow market hours unless testing locally or SIMULATION_ALL_HOURS is set in .env
            market_active = (
                is_market_open_ist()
                or settings.environment == "local"
                or settings.simulation_all_hours
            )
            if settings.simulation_enabled and market_active:
                async with AsyncSessionLocal() as db:
                    burst = await trigger_burst(db, count=1)
                    if burst:
                        logger.info(
                            "Simulated community publish: %s (%s, P&L: %s)",
                            burst[0]["username"],
                            burst[0]["display_name"],
                            burst[0]["net_pnl"],
                        )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Market simulation tick failed")
        # Sleep for a randomized 30 to 60 seconds for an active, dynamic live tape
        interval = random.randint(
            settings.simulation_interval_min_seconds,
            settings.simulation_interval_max_seconds,
        )
        await asyncio.sleep(interval)


app = FastAPI(
    title=f"{settings.app_name} API",
    description=DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.middleware("http")
async def redact_angel_one_callback_tokens(request: Request, call_next):
    if request.url.path == f"{settings.api_prefix}/brokers/angel_one/callback":
        query = parse_qs(request.scope["query_string"].decode())
        request.scope["angel_one_auth_token"] = query.pop("auth_token", [None])[0]
        query.pop("feed_token", None)
        query.pop("refresh_token", None)
        request.scope["query_string"] = urlencode(query, doseq=True).encode()
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong on our side"},
    )


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        database = "up"
    except Exception:
        database = "down"
    return {"status": "ok", "database": database, "environment": settings.environment}


for router_module in (auth, brokers, pnl, upi, leaderboard, users, admin):
    app.include_router(router_module.router, prefix=settings.api_prefix)
