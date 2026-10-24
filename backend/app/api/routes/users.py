from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models import LinkedBroker, PnLRecord, User
from app.schemas import (
    DonateEligibility,
    LinkedBrokerOut,
    PerformancePoint,
    ProfileStats,
    PublicUser,
    UpiIntentResponse,
    UpiStatus,
    UserProfileResponse,
)
from app.services.performance import PnLPoint, compute_stats

router = APIRouter(prefix="/users", tags=["users"])


def _public(user: User) -> PublicUser:
    has_verified_publish = any(b.is_active for b in user.linked_brokers)
    return PublicUser(
        user_id=user.user_id,
        display_name=user.display_name,
        username=user.username,
        bio=user.bio,
        avatar_seed=user.avatar_seed,
        created_at=user.created_at,
        is_verified_publisher=has_verified_publish,
    )


def _broker_out(link: LinkedBroker | None) -> LinkedBrokerOut | None:
    if link is None:
        return None
    return LinkedBrokerOut(
        link_id=link.link_id,
        broker_name=str(link.broker_name.value),
        broker_legal_name=link.broker_legal_name,
        is_active=link.is_active,
        last_synced_at=link.last_synced_at,
        created_at=link.created_at,
    )


@router.get("/{username}", response_model=UserProfileResponse)
async def get_profile(
    username: str,
    db: DbSession,
    limit: int = Query(default=180, ge=1, le=1000),
) -> UserProfileResponse:
    user = await db.scalar(
        select(User)
        .options(selectinload(User.linked_brokers))
        .where(User.username == username.lower())
    )
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Trader not found")

    records = (
        await db.scalars(
            select(PnLRecord)
            .where(PnLRecord.user_id == user.user_id)
            .order_by(PnLRecord.date.asc())
            .limit(limit)
        )
    ).all()

    points = [
        PnLPoint(day=r.date, pnl=r.net_pnl, is_verified=r.is_verified) for r in records
    ]
    stats = compute_stats(points)

    running = 0.0
    timeline: list[PerformancePoint] = []
    for record in records:
        running += record.net_pnl
        timeline.append(
            PerformancePoint(
                date=record.date,
                net_pnl=record.net_pnl,
                is_verified=record.is_verified,
                cumulative=round(running, 2),
            )
        )

    today = next((r for r in reversed(records) if r.date == records[-1].date), None) if records else None

    link = next(
        (b for b in user.linked_brokers if b.is_active),
        None,
    )

    can_tip = user.upi_verification_status == "VERIFIED" and bool(user.verified_upi_id)

    return UserProfileResponse(
        user=_public(user),
        stats=ProfileStats(
            total_records=stats.total_records,
            total_pnl=stats.total_pnl,
            best_day=stats.best_day,
            worst_day=stats.worst_day,
            win_rate=stats.win_rate,
            avg_trade_size=stats.avg_trade_size,
            max_drawdown=stats.max_drawdown,
            volatility=stats.volatility,
            best_streak=stats.best_streak,
            worst_streak=stats.worst_streak,
            consistency_score=stats.consistency_score,
            sharpe_like=stats.sharpe_like,
        ),
        timeline=timeline,
        today=today,
        upi=UpiStatus(
            status=user.upi_verification_status,
            upi_id=user.verified_upi_id,
            resolved_name=user.upi_verified_name,
            can_tip=can_tip,
        ),
        linked_broker=_broker_out(link),
        can_tip=can_tip,
    )


@router.get("/{username}/qr", response_model=UpiStatus)
async def profile_upi(username: str, db: DbSession) -> UpiStatus:
    """Public UPI details for the profile QR code."""
    user = await db.scalar(select(User).where(User.username == username.lower()))
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Trader not found")

    verified = user.upi_verification_status == "VERIFIED" and bool(user.verified_upi_id)
    return UpiStatus(
        status=user.upi_verification_status,
        upi_id=user.verified_upi_id,
        resolved_name=user.upi_verified_name,
        can_tip=verified,
    )


@router.get("/{username}/intent", response_model=UpiIntentResponse)
async def profile_tip_intent(
    username: str,
    db: DbSession,
    amount: float = Query(default=0, ge=0, le=100_000),
) -> UpiIntentResponse:
    """Build the peer-to-peer UPI intent a supporter should open.

    The intent is handed to the supporter's own UPI app. No money is routed
    through this platform.
    """
    user = await db.scalar(select(User).where(User.username == username.lower()))
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Trader not found")
    if user.upi_verification_status != "VERIFIED" or not user.verified_upi_id:
        raise HTTPException(
            status_code=403, detail="This trader has not completed UPI verification"
        )

    payee = user.upi_verified_name or user.display_name
    note = f"Tip for {user.display_name} on NetPnL"

    params = [
        f"pa={quote(user.verified_upi_id, safe='')}",
        f"pn={quote(payee[:48], safe='')}",
        f"tn={quote(note, safe='')}",
        "cu=INR",
    ]
    if amount > 0:
        params.append(f"am={amount:.2f}")

    return UpiIntentResponse(
        upi_id=user.verified_upi_id,
        payee_name=payee,
        amount=amount,
        note=note,
        intent_url=f"upi://pay?{'&'.join(params)}",
    )


@router.get("/{username}/donate-eligible", response_model=DonateEligibility)
async def donate_eligible(username: str, db: DbSession) -> DonateEligibility:
    """Whether this trader can receive a donation and where to send it.

    Eligible when:
      * the trader has completed UPI verification (so there is a UPI ID to pay),
      * at least 90% of their postings are broker-verified, and
      * broker-verified amounts make up at least 75% of the total posted amount
        (by absolute value, so losses and profits both count).
    """
    user = await db.scalar(select(User).where(User.username == username.lower()))
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Trader not found")

    upi_verified = (
        user.upi_verification_status == "VERIFIED" and bool(user.verified_upi_id)
    )
    if not upi_verified:
        return DonateEligibility(
            eligible=False,
            reason="UPI verification is required before receiving donations",
        )

    records = (
        await db.scalars(
            select(PnLRecord).where(PnLRecord.user_id == user.user_id)
        )
    ).all()

    total = len(records)
    if total == 0:
        return DonateEligibility(
            eligible=False, reason="No P&L postings found for this trader"
        )

    verified = [r for r in records if r.is_verified]
    verified_ratio = len(verified) / total

    total_abs = sum(abs(float(r.net_pnl)) for r in records)
    verified_abs = sum(abs(float(r.net_pnl)) for r in verified)
    verified_amount_ratio = (
        verified_abs / total_abs if total_abs > 0 else 0.0
    )

    if verified_ratio < 0.9:
        return DonateEligibility(
            eligible=False,
            upi_id=user.verified_upi_id,
            resolved_name=user.upi_verified_name,
            reason=(
                f"Only {verified_ratio:.0%} of postings are verified (need 90%)"
            ),
        )

    if verified_amount_ratio < 0.75:
        return DonateEligibility(
            eligible=False,
            upi_id=user.verified_upi_id,
            resolved_name=user.upi_verified_name,
            reason=(
                f"Verified amount is {verified_amount_ratio:.0%} of total "
                "(need 75%)"
            ),
        )

    return DonateEligibility(
        eligible=True,
        upi_id=user.verified_upi_id,
        resolved_name=user.upi_verified_name,
    )
