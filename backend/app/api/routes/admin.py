"""
Admin endpoints for NetPnL / RetailTraders.

Provides secure admin authentication, real vs simulated metric reporting,
and instant burst simulation controls.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, TokenDep
from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.models import BrokerPnLDaily, PnLRecord, User
from app.schemas import AdminUserOut, AdminUserPostingOut, UserBlockManualRequest
from app.services.pnl_sync import calendar_day_for
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


@router.get("/real-postings", response_model=list[AdminUserPostingOut])
async def get_real_postings(
    admin: AdminDep,
    db: DbSession,
    target_date: date | None = None,
    all_time: bool = Query(default=False),
) -> list[AdminUserPostingOut]:
    """Fetch real user postings for a given date (defaults to today in IST) or all-time."""
    query = (
        select(PnLRecord)
        .join(PnLRecord.user)
        .options(selectinload(PnLRecord.user))
        .where(
            PnLRecord.is_simulated.is_(False),
            User.is_simulated.is_(False),
        )
    )
    if not all_time:
        target = target_date or calendar_day_for()
        query = query.where(PnLRecord.date == target).order_by(PnLRecord.created_at.desc())
    else:
        query = query.order_by(PnLRecord.date.desc(), PnLRecord.created_at.desc()).limit(100)

    records = (await db.scalars(query)).all()

    return [
        AdminUserPostingOut(
            record_id=r.record_id,
            user_id=r.user_id,
            username=r.user.username,
            display_name=r.user.display_name,
            email=r.user.email,
            net_pnl=r.net_pnl,
            is_verified=r.is_verified,
            source=r.source,
            broker_source=r.broker_source,
            has_manual_entry=r.has_manual_entry,
            manual_net_pnl=r.manual_net_pnl,
            trade_count=r.trade_count,
            win_rate=r.win_rate,
            notes=r.notes,
            date=r.date,
            created_at=r.created_at,
            updated_at=r.updated_at,
            is_manual_blocked=bool(getattr(r.user, "is_manual_blocked", False)),
        )
        for r in records
    ]


@router.delete("/postings/{record_id}")
async def admin_delete_posting(
    record_id: uuid.UUID,
    admin: AdminDep,
    db: DbSession,
) -> dict[str, Any]:
    """Deletes a suspicious posting record and associated daily broker records for that day."""
    record = await db.scalar(
        select(PnLRecord).where(PnLRecord.record_id == record_id)
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Posting record not found",
        )

    # Prune any broker daily rows for this user on that date
    await db.execute(
        delete(BrokerPnLDaily).where(
            BrokerPnLDaily.user_id == record.user_id,
            BrokerPnLDaily.date == record.date,
        )
    )
    await db.delete(record)
    await db.commit()

    metrics = await get_admin_metrics(db)
    return {
        "success": True,
        "deleted_record_id": str(record_id),
        "metrics": metrics,
    }



@router.get("/real-users", response_model=list[AdminUserOut])
async def get_real_users(
    admin: AdminDep,
    db: DbSession,
) -> list[AdminUserOut]:
    """Fetch all real registered users with posting statistics and manual block status."""
    users = (
        await db.scalars(
            select(User)
            .options(
                selectinload(User.linked_brokers),
                selectinload(User.pnl_records),
            )
            .where(User.is_simulated.is_(False))
            .order_by(User.created_at.desc())
        )
    ).all()

    out: list[AdminUserOut] = []
    for u in users:
        records = [r for r in u.pnl_records if not r.is_simulated]
        manual_cnt = sum(1 for r in records if r.has_manual_entry or not r.is_verified)
        verified_cnt = sum(1 for r in records if r.is_verified)
        last_date = max((r.date for r in records), default=None)
        has_broker = any(b.is_active for b in u.linked_brokers)

        out.append(
            AdminUserOut(
                user_id=u.user_id,
                username=u.username,
                display_name=u.display_name,
                email=u.email,
                created_at=u.created_at,
                is_active=u.is_active,
                is_manual_blocked=bool(getattr(u, "is_manual_blocked", False)),
                is_verified_publisher=has_broker,
                total_posts=len(records),
                manual_posts=manual_cnt,
                verified_posts=verified_cnt,
                last_post_date=last_date,
            )
        )
    return out


@router.post("/users/{user_id}/block-manual")
async def admin_toggle_manual_block(
    user_id: uuid.UUID,
    payload: UserBlockManualRequest,
    admin: AdminDep,
    db: DbSession,
) -> dict[str, Any]:
    """Blocks or unblocks a real user from submitting manual P&L entries."""
    user = await db.scalar(
        select(User).where(User.user_id == user_id, User.is_simulated.is_(False))
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Real user not found",
        )
    user.is_manual_blocked = payload.blocked
    await db.commit()
    return {
        "success": True,
        "user_id": str(user.user_id),
        "username": user.username,
        "is_manual_blocked": user.is_manual_blocked,
    }
