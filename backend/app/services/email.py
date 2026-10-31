from __future__ import annotations

import logging
import httpx
from app.core.config import settings

logger = logging.getLogger("netpnl.email")


async def send_otp_email(to_email: str, otp_code: str, display_name: str | None = None) -> bool:
    """Sends a 6-digit password reset OTP email using the Resend API."""
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY is not configured; skipping email to %s", to_email)
        return False

    name_greeting = f"Hello {display_name}," if display_name else "Hello,"

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="margin-bottom: 20px;">
            <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">RetailTraders.in</span>
        </div>
        <h2 style="color: #0f172a; margin-top: 0; font-size: 18px; font-weight: 600;">Reset Your Password</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">{name_greeting}</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">Use the verification code below to reset your RetailTraders account password. This code will expire in <strong>10 minutes</strong>.</p>
        
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 18px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 6px; font-weight: 600;">Your 6-Digit OTP</div>
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0284c7; font-family: monospace;">{otp_code}</span>
        </div>
        
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">If you did not request this password reset, please ignore this email or contact support. Your password will remain unchanged.</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">&copy; 2026 RetailTraders.in &middot; Automated authentication security notification</p>
    </div>
    """

    payload = {
        "from": settings.email_from,
        "to": [to_email],
        "reply_to": settings.email_reply_to,
        "subject": "Your RetailTraders Password Reset OTP",
        "html": html_content,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "RetailTraders/1.0",
                },
                json=payload,
            )
            if resp.status_code in (200, 201):
                logger.info("Sent password reset OTP email to %s (id=%s)", to_email, resp.json().get("id"))
                return True
            else:
                logger.error("Failed to send OTP to %s: HTTP %s - %s", to_email, resp.status_code, resp.text)
                return False
    except Exception as exc:
        logger.exception("Error sending OTP email to %s: %s", to_email, exc)
        return False

