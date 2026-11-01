from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Literal

import bcrypt
import jwt
from cryptography.fernet import Fernet

from app.core.config import settings

TokenType = Literal["access", "refresh"]


def _prepare_password(password: str) -> bytes:
    """bcrypt truncates at 72 bytes, so pre-hash to a fixed length."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare_password(password), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare_password(password), password_hash.encode())
    except (ValueError, TypeError):
        return False


def _create_token(
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    return _create_token(
        subject,
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
        extra,
    )


def create_refresh_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    return _create_token(
        subject,
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
        extra,
    )


def decode_token(token: str, expected_type: TokenType = "access") -> dict[str, Any] | None:
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def new_state_token() -> str:
    """Anti-CSRF nonce for OAuth authorisation redirects."""
    return secrets.token_urlsafe(32)


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def hash_otp(otp: str) -> str:
    """Hash a numeric OTP with server secret key for tamper-proof storage."""
    return hmac.new(settings.secret_key.encode(), otp.encode(), hashlib.sha256).hexdigest()


def verify_otp(otp: str, otp_hash: str) -> bool:
    """Verify numeric OTP using constant-time comparison."""
    expected = hash_otp(otp)
    return hmac.compare_digest(expected, otp_hash)


def generate_otp() -> str:
    """Generate a secure 6-digit numeric OTP."""
    return f"{secrets.randbelow(900000) + 100000}"


# --- Token Encryption at Rest (Fernet AES-128-CBC + HMAC-SHA256) ----------


@lru_cache
def _get_fernet() -> Fernet:
    """Derive a 32-byte Fernet key deterministically from the configured encryption/secret key."""
    raw_key = (getattr(settings, "token_encryption_key", "") or settings.secret_key).strip()
    try:
        if len(raw_key) == 44:
            decoded = base64.urlsafe_b64decode(raw_key.encode("utf-8"))
            if len(decoded) == 32:
                return Fernet(raw_key.encode("utf-8"))
    except Exception:
        pass

    derived_bytes = hashlib.sha256(raw_key.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(derived_bytes)
    return Fernet(fernet_key)


def is_encrypted_token(value: str | None) -> bool:
    """Check if the string is already encrypted with our Fernet key."""
    if not value or not isinstance(value, str) or not value.startswith("gAAAAA"):
        return False
    try:
        _get_fernet().decrypt(value.encode("utf-8"))
        return True
    except Exception:
        return False


def encrypt_token(raw_token: str | None) -> str | None:
    """Encrypt a broker OAuth access or refresh token using Fernet (AES-128-CBC + HMAC-SHA256).

    Idempotent: if the token is already encrypted, returns it unchanged.
    """
    if not raw_token:
        return raw_token
    if is_encrypted_token(raw_token):
        return raw_token
    return _get_fernet().encrypt(raw_token.encode("utf-8")).decode("utf-8")


def decrypt_token(cipher_token: str | None) -> str | None:
    """Decrypt a broker OAuth access or refresh token using Fernet.

    Graceful fallback: if token is legacy plaintext or decryption fails, returns raw token.
    """
    if not cipher_token:
        return cipher_token
    try:
        return _get_fernet().decrypt(cipher_token.encode("utf-8")).decode("utf-8")
    except Exception:
        return cipher_token

