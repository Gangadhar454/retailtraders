from __future__ import annotations

import uuid
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models import LinkedBroker, UpiVerification, User
from app.schemas import UpiIntentResponse, UpiStatus, UpiVerifyRequest, UpiVerifyResponse
from app.services.upi import UpiVerificationError, UpiVerifier, names_match

router = APIRouter(prefix="/upi", tags=["upi"])


@router.post("/verify", response_model=UpiVerifyResponse)
async def verify_upi(
    payload: UpiVerifyRequest, user: CurrentUser, db: DbSession
) -> UpiVerifyResponse:
    """Run a ₹1 penny drop and confirm the UPI ID resolves to a name.

    Tipping stays locked until verification passes, so nobody can receive money
    under an unverified identity.
    """
    verifier = UpiVerifier()
    try:
        result = await verifier.verify(payload.upi_id)
    except UpiVerificationError as exc:
        db.add(
            UpiVerification(
                user_id=user.user_id,
                upi_id=payload.upi_id,
                provider=verifier.provider,
                status="FAILED",
                failure_reason=exc.message,
            )
        )
        user.upi_verification_status = "REJECTED"
        await db.flush()
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    db.add(
        UpiVerification(
            user_id=user.user_id,
            upi_id=payload.upi_id,
            provider=result.provider,
            status="SUCCESS",
            resolved_name=result.name,
            reference_id=result.reference_id,
        )
    )

    user.verified_upi_id = payload.upi_id
    user.upi_verified_name = result.name
    user.upi_verification_status = "VERIFIED"
    await db.flush()

    return UpiVerifyResponse(
        status="VERIFIED",
        upi_id=payload.upi_id,
        resolved_name=result.name,
        can_tip=True,
        message="UPI verified. You are live for tips.",
    )


@router.get("/status", response_model=UpiStatus)
async def upi_status(user: CurrentUser) -> UpiStatus:
    verified = user.upi_verification_status == "VERIFIED" and bool(user.verified_upi_id)
    return UpiStatus(
        status=user.upi_verification_status,
        upi_id=user.verified_upi_id,
        resolved_name=user.upi_verified_name,
        can_tip=verified,
    )


@router.get("/intent", response_model=UpiIntentResponse)
async def upi_intent(
    user: CurrentUser,
    amount: float = Query(default=0, ge=0, le=100_000),
) -> UpiIntentResponse:
    """Build a pure peer-to-peer UPI intent. No money ever touches this server."""
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
    ]
    if amount > 0:
        params.append(f"am={amount:.2f}")
    params.append("cu=INR")

    return UpiIntentResponse(
        upi_id=user.verified_upi_id,
        payee_name=payee,
        amount=amount,
        note=note,
        intent_url=f"upi://pay?{'&'.join(params)}",
    )
