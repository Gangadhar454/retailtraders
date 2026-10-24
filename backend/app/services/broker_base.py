from __future__ import annotations

from typing import Any


class BrokerError(Exception):
    """A broker rejected a request or returned an unexpected payload.

    ``status_code`` is the HTTP status the API should return, so routes can
    translate broker failures without knowing which client raised them.
    """

    def __init__(self, message: str, *, status_code: int = 502, detail: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail
