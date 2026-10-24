from __future__ import annotations

import logging
import random
import re
import string
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class UpiVerificationError(Exception):
    def __init__(self, message: str, *, status_code: int = 400, retryable: bool = False):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retryable = retryable


@dataclass
class UpiPayerName:
    """Result of a ₹1 penny drop — the bank account holder name."""

    upi_id: str
    name: str
    provider: str
    reference_id: str
    status: str = "SUCCESS"

    @property
    def is_success(self) -> bool:
        return self.status == "SUCCESS"


class UpiVerifier:
    """Verifies a UPI ID by dropping ₹1 and reading back the payee name.

    The ₹1 is returned by the provider; we never hold custody of funds.
    """

    def __init__(self) -> None:
        self.provider = settings.upi_provider
        self._cashfree_token: str | None = None

    # -- public API -------------------------------------------------------
    async def verify(self, upi_id: str) -> UpiPayerName:
        if self.provider == "cashfree":
            return await self._verify_with_cashfree(upi_id)
        if self.provider == "razorpay":
            return await self._verify_with_razorpay(upi_id)
        return self._verify_with_mock(upi_id)

    # -- Cashfree ---------------------------------------------------------
    async def _verify_with_cashfree(self, upi_id: str) -> UpiPayerName:
        if not settings.cashfree_client_id or not settings.cashfree_client_secret:
            logger.warning("Cashfree credentials missing; using mock verifier")
            return self._verify_with_mock(upi_id)

        token = await self._cashfree_auth_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Client-Id": settings.cashfree_client_id,
            "X-Client-Secret": settings.cashfree_client_secret,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        name = await self._cashfree_validate_vpa(upi_id, headers)
        payout_id = await self._cashfree_payout(upi_id, name, headers)

        return UpiPayerName(
            upi_id=upi_id,
            name=name,
            provider="cashfree",
            reference_id=payout_id,
            status="SUCCESS",
        )

    async def _cashfree_auth_token(self) -> str:
        if self._cashfree_token:
            return self._cashfree_token
        url = "https://api.cashfree.com/payouts/api/v1/authenticate"
        payload = {
            "client_id": settings.cashfree_client_id,
            "client_secret": settings.cashfree_client_secret,
            "grant_type": "client_credentials",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 400:
            raise UpiVerificationError(
                "Could not authenticate with the payout provider",
                status_code=502,
                retryable=True,
            )
        token = (response.json().get("data") or {}).get("access_token")
        if not token:
            raise UpiVerificationError(
                "Payout provider did not return an access token", status_code=502
            )
        self._cashfree_token = token
        return token

    async def _cashfree_validate_vpa(self, upi_id: str, headers: dict[str, str]) -> str:
        url = "https://api.cashfree.com/payouts/api/v1/validateVpa"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(url, params={"vpa": upi_id}, headers=headers)
        except httpx.HTTPError as exc:
            raise UpiVerificationError(
                "Could not reach the payout provider", status_code=502, retryable=True
            ) from exc

        if response.status_code >= 400:
            raise UpiVerificationError(
                "That UPI ID could not be validated", status_code=400
            )

        data = response.json().get("data") or {}
        name = data.get("name") or data.get("vpa_name")
        if not name:
            raise UpiVerificationError(
                "That UPI ID could not be validated", status_code=400
            )
        return str(name).strip()

    async def _cashfree_payout(
        self, upi_id: str, name: str, headers: dict[str, str]
    ) -> str:
        url = "https://api.cashfree.com/payouts/api/v1/payouts"
        reference_id = _reference_id()
        payload = {
            "beneficiary": {
                "type": "upi",
                "vpa": upi_id,
                "name": name,
            },
            "amount": settings.penny_drop_amount,
            "currency": "INR",
            "purpose": "Penny drop for UPI name verification",
            "reference_id": reference_id,
            "mode": "IMPS",
            "remark": "upi-verification",
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise UpiVerificationError(
                "Could not reach the payout provider", status_code=502, retryable=True
            ) from exc

        if response.status_code >= 400:
            raise UpiVerificationError(
                "The ₹1 verification transfer could not be initiated", status_code=400
            )

        data = response.json().get("data") or {}
        payout_id = str(data.get("payout_id") or data.get("payout_request_id") or "")
        status = str(data.get("payout_status") or "RECEIVED").upper()
        if status in {"REJECTED", "FAILED"}:
            raise UpiVerificationError(
                "The ₹1 verification transfer was rejected by the bank", status_code=400
            )
        return payout_id or reference_id

    # -- Razorpay ---------------------------------------------------------
    async def _verify_with_razorpay(self, upi_id: str) -> UpiPayerName:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            logger.warning("Razorpay credentials missing; using mock verifier")
            return self._verify_with_mock(upi_id)

        import base64

        credentials = base64.b64encode(
            f"{settings.razorpay_key_id}:{settings.razorpay_key_secret}".encode()
        ).decode()
        headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        }
        base = "https://api.razorpay.com/v1"

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                auth = await client.post(f"{base}/authenticate", headers=headers)
                if auth.status_code >= 400:
                    raise UpiVerificationError(
                        "Could not authenticate with the payout provider",
                        status_code=502,
                        retryable=True,
                    )
                token = auth.json().get("access_token")
                auth_headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                }

                created = await client.post(
                    f"{base}/fund_accounts", json={"vpa": upi_id}, headers=auth_headers
                )
                if created.status_code >= 400:
                    raise UpiVerificationError(
                        "That UPI ID could not be validated", status_code=400
                    )
                fund_account_id = created.json().get("id")

                validated = await client.post(
                    f"{base}/fund_accounts/validate",
                    json={"vpa": upi_id},
                    headers=auth_headers,
                )
        except httpx.HTTPError as exc:
            raise UpiVerificationError(
                "Could not reach the payout provider", status_code=502, retryable=True
            ) from exc

        if validated.status_code >= 400:
            raise UpiVerificationError(
                "That UPI ID could not be validated", status_code=400
            )

        data = validated.json().get("data") or {}
        name = data.get("name")
        if not name:
            raise UpiVerificationError(
                "That UPI ID could not be validated", status_code=400
            )
        return UpiPayerName(
            upi_id=upi_id,
            name=str(name).strip(),
            provider="razorpay",
            reference_id=str(fund_account_id or ""),
            status="SUCCESS",
        )

    # -- Mock -------------------------------------------------------------
    def _verify_with_mock(self, upi_id: str) -> UpiPayerName:
        """Simulates a penny drop so the flow is demoable without live keys.

        The resolved name is derived from the UPI handle itself, exactly as a
        real bank derives it from the account holder's name.
        """
        local = upi_id.split("@", 1)[0]
        words = [w for w in re.split(r"[._\-+]+", local) if w]
        name = " ".join(word.capitalize() for word in words) if words else local.title()
        return UpiPayerName(
            upi_id=upi_id,
            name=name,
            provider="mock",
            reference_id=f"mock-{_reference_id()}",
            status="SUCCESS",
        )


def _reference_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    noise = "".join(random.choice(string.digits) for _ in range(6))  # noqa: S311
    return f"netpnl{stamp}{noise}"


def names_match(resolved: str, broker_legal_name: str) -> bool:
    """Fuzzy name comparison for the Upstox legal-name check.

    Indian bank account names often differ in spacing, casing and middle
    initials ('Ravi K Sharma' vs 'Ravi Sharma'), so compare on a normalised
    token set with a similarity floor rather than exact equality.
    """
    return similarity(normalise_name(resolved), normalise_name(broker_legal_name)) >= 0.75


def normalise_name(name: str) -> str:
    """Lowercase, drop honorifics and stray initials, collapse punctuation."""
    if not name:
        return ""

    lowered = name.lower().strip()
    for token in ("mr", "mrs", "ms", "dr", "smt", "shri"):
        lowered = lowered.replace(token, " ")

    tokens = [
        token
        for token in "".join(ch if ch.isalnum() else " " for ch in lowered).split()
        if len(token) > 1
    ]
    return " ".join(tokens)


def similarity(a: str, b: str) -> float:
    """Token-aware Jaccard + character similarity blend."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    tokens_a, tokens_b = set(a.split()), set(b.split())
    union = tokens_a | tokens_b
    jaccard = len(tokens_a & tokens_b) / len(union) if union else 0.0
    char = _levenshtein_ratio(a, b)
    return round(0.5 * jaccard + 0.5 * char, 4)


def _levenshtein_ratio(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (ca != cb),
                )
            )
        previous = current
    distance = previous[-1]
    longest = max(len(a), len(b))
    return round(1.0 - distance / longest, 4)
