from __future__ import annotations

import logging
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger(__name__)

_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(_GOOGLE_JWKS_URL, cache_keys=True, max_cached_keys=16)
    return _jwks_client


async def verify_google_credential(credential: str) -> dict[str, Any]:
    """Verify and decode a Google ID token JWT.

    Tries local JWKS signature verification first; falls back to Google's
    tokeninfo API endpoint if local verification fails.
    """
    if not credential:
        raise ValueError("Google credential is required")

    # 1. Attempt fast JWKS cryptographic verification
    try:
        jwks = _get_jwks_client()
        signing_key = jwks.get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            options={"verify_exp": True},
        )
        iss = claims.get("iss")
        if iss not in _GOOGLE_ISSUERS:
            raise ValueError(f"Invalid Google token issuer: {iss}")
        return claims
    except Exception as jwks_err:
        logger.warning("Google JWKS decode failed (%s), falling back to tokeninfo endpoint", jwks_err)

    # 2. Fallback to Google tokeninfo HTTP endpoint
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_GOOGLE_TOKENINFO_URL, params={"id_token": credential})
        if resp.status_code != 200:
            logger.error("Google tokeninfo returned status %s: %s", resp.status_code, resp.text)
            raise ValueError("Invalid Google credential")
        claims = resp.json()

        # Validate audience
        aud = claims.get("aud")
        if aud != settings.google_client_id:
            raise ValueError(f"Google token audience mismatch: expected {settings.google_client_id}, got {aud}")

        # Validate issuer
        iss = claims.get("iss")
        if iss not in _GOOGLE_ISSUERS:
            raise ValueError(f"Invalid Google token issuer: {iss}")

        return claims

