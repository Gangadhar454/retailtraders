"""
Admin endpoints for NetPnL / RetailTraders.

Provides secure admin authentication, real vs simulated metric reporting,
and instant burst simulation controls.
"""
from __future__ import annotations

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import DbSession, TokenDep
from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.simulation.engine import (
    get_admin_metrics,
    purge_simulated_data,
    trigger_burst,
)

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class BurstRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=50, description="Number of traders to burst")


class ToggleSimulationRequest(BaseModel):
    enabled: bool


class PurgeRequest(BaseModel):
    confirm: bool = False


async def get_current_admin(credentials: TokenDep) -> str:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin credentials required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials, "access")
    if (
        not payload
        or payload.get("sub") != settings.admin_username
        or payload.get("role") != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return settings.admin_username


AdminDep = Annotated[str, Depends(get_current_admin)]


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest) -> AdminLoginResponse:
    """Authenticates admin directly from environment variables (.env). Zero DB interaction."""
    valid_user = secrets.compare_digest(
        payload.username.strip(), settings.admin_username.strip()
    )
    valid_pass = secrets.compare_digest(
        payload.password, settings.admin_password
    )

    if not (valid_user and valid_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin username or password",
        )

    token = create_access_token(
        subject=settings.admin_username,
        extra={"role": "admin"},
    )
    return AdminLoginResponse(
        access_token=token,
        token_type="bearer",
        username=settings.admin_username,
    )


@router.get("/me")
async def admin_me(admin: AdminDep) -> dict[str, str]:
    """Returns the authenticated admin identity."""
    return {"username": admin, "role": "admin"}


@router.get("/metrics")
async def admin_metrics(admin: AdminDep, db: DbSession) -> dict[str, Any]:
    """Fetches real-time daily and cumulative user and posting metrics."""
    return await get_admin_metrics(db)


@router.post("/burst")
async def admin_trigger_burst(
    admin: AdminDep, payload: BurstRequest, db: DbSession
) -> dict[str, Any]:
    """Instantly publishes realistic trades from the 130-cohort for today."""
    trades = await trigger_burst(db, count=payload.count)
    metrics = await get_admin_metrics(db)
    return {
        "success": True,
        "burst_count": len(trades),
        "trades": trades,
        "metrics": metrics,
    }


@router.post("/toggle-simulation")
async def toggle_simulation(
    admin: AdminDep, payload: ToggleSimulationRequest
) -> dict[str, Any]:
    """Enables or pauses the automated market-hours simulation."""
    settings.simulation_enabled = payload.enabled
    return {
        "success": True,
        "simulation_enabled": settings.simulation_enabled,
    }


@router.post("/purge-simulation")
async def admin_purge_simulation(
    admin: AdminDep, payload: PurgeRequest, db: DbSession
) -> dict[str, Any]:
    """Safely removes all simulated data, leaving all real user data intact."""
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please set confirm=true to proceed with purge",
        )
    result = await purge_simulated_data(db)
    metrics = await get_admin_metrics(db)
    return {
        "success": True,
        "result": result,
        "metrics": metrics,
    }

