"""
cdse_auth_service.py
====================
Copernicus Data Space (CDSE) Authentication Service

PURPOSE
-------
Authenticate with the Copernicus Data Space identity provider using
credentials stored exclusively in the backend .env file.

SECURITY RULES
--------------
- Credentials are read ONLY from environment variables.
- Credentials are NEVER logged, returned to callers, or exposed.
- Access tokens are NEVER returned to callers.
- The token is used only internally for validation (not stored).
- Only safe status strings are returned to callers.

SAFE STATUS CONSTANTS
---------------------
    CONNECTED               — credentials present and authentication succeeded
    NOT_CONFIGURED          — CDSE_USERNAME or CDSE_PASSWORD not set in .env
    AUTHENTICATION_FAILED   — credentials present but CDSE rejected them

ISOLATION
---------
This service is fully isolated from the Sentinel-1 product discovery
service (sentinel1_service.py). It does NOT share state with it and
does NOT affect the existing STAC metadata queries.

IMPORTANT CONSTRAINTS
---------------------
- Does NOT download any satellite data.
- Does NOT modify any database table.
- Does NOT return passwords, tokens, or secrets to any caller.
"""

import logging
import os
import time
from typing import Literal

import requests
from dotenv import load_dotenv


_ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logger = logging.getLogger(__name__)

# Official Copernicus Data Space identity provider token endpoint
_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu"
    "/auth/realms/CDSE/protocol/openid-connect/token"
)

# Safe status type
CdseStatus = Literal["connected", "not_configured", "authentication_failed"]

# Human-readable messages returned to callers (no secrets included)
_MESSAGES: dict[CdseStatus, str] = {
    "connected": "Copernicus Data Space authentication successful.",
    "not_configured": "Copernicus Data Space credentials are not configured.",
    "authentication_failed": "Unable to authenticate with Copernicus Data Space.",
}

_cached_result: dict | None = None
_cached_timestamp: float = 0.0
_CACHE_TTL_SECONDS: float = 60.0


# ──────────────────────────────────────────────────────────────
# INTERNAL — Retrieve credentials safely
# ──────────────────────────────────────────────────────────────

from dotenv import dotenv_values, load_dotenv

# Path to backend/.env
_ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


def _read_credentials() -> tuple[str | None, str | None]:
    """
    Read CDSE_USERNAME and CDSE_PASSWORD from backend/.env or environment variables.

    Returns
    -------
    (username, password)
        Either value may be None if not set or empty.

    Security
    --------
    The returned values are intentionally not logged.
    Callers must treat them as secrets and never expose them.
    """
    username = None
    password = None

    if os.path.exists(_ENV_PATH):
        vals = dotenv_values(_ENV_PATH)
        username = (vals.get("CDSE_USERNAME") or "").strip() or None
        password = (vals.get("CDSE_PASSWORD") or "").strip() or None

    if not username:
        username = os.getenv("CDSE_USERNAME", "").strip() or None
    if not password:
        password = os.getenv("CDSE_PASSWORD", "").strip() or None

    return username, password


# ──────────────────────────────────────────────────────────────
# PUBLIC — Check authentication status
# ──────────────────────────────────────────────────────────────

def check_cdse_status(force_refresh: bool = False) -> dict:
    """
    Attempt to authenticate with Copernicus Data Space and return a
    safe status dict conforming to:
    {
        "status": "connected" | "not_configured" | "authentication_failed",
        "message": "<human-readable description>"
    }

    Security
    --------
    - Credentials are never included in the return value.
    - Access tokens are never included in the return value.
    - Connection errors are sanitised before returning.
    """
    global _cached_result, _cached_timestamp

    username, password = _read_credentials()

    # ── Stage 1: Missing credentials ──────────────────────────
    if not username or not password:
        _cached_result = {
            "status": "not_configured",
            "message": _MESSAGES["not_configured"],
        }
        _cached_timestamp = time.time()
        logger.info(
            "CDSE status: not_configured "
            "(CDSE_USERNAME or CDSE_PASSWORD not set in .env)"
        )
        return _cached_result

    # ── Cache check ───────────────────────────────────────────
    now = time.time()
    if not force_refresh and _cached_result and (now - _cached_timestamp < _CACHE_TTL_SECONDS):
        return _cached_result

    # ── Stage 2: Attempt authentication ───────────────────────
    payload = {
        "client_id": "cdse-public",
        "grant_type": "password",
        "username": username,
        "password": password,
    }

    try:
        response = requests.post(
            _TOKEN_URL,
            data=payload,
            timeout=20,
        )
    except requests.Timeout:
        logger.warning(
            "CDSE authentication timed out (no credentials logged)"
        )
        res = {
            "status": "authentication_failed",
            "message": _MESSAGES["authentication_failed"],
        }
        _cached_result = res
        _cached_timestamp = now
        return res
    except requests.RequestException:
        # Do NOT log exc — it might contain credentials in the URL/body repr
        logger.warning(
            "CDSE authentication request failed (network error, no credentials logged)"
        )
        res = {
            "status": "authentication_failed",
            "message": _MESSAGES["authentication_failed"],
        }
        _cached_result = res
        _cached_timestamp = now
        return res

    # ── Stage 3: Evaluate response ────────────────────────────
    if response.status_code == 200:
        data = response.json()
        if data.get("access_token"):
            # Authentication succeeded — discard token immediately
            logger.info("CDSE status: connected (authentication succeeded)")
            res = {
                "status": "connected",
                "message": _MESSAGES["connected"],
            }
            _cached_result = res
            _cached_timestamp = now
            return res

    # Non-200 or no token — credentials rejected
    logger.warning(
        "CDSE status: authentication_failed (HTTP %s, no credentials logged)",
        response.status_code,
    )
    res = {
        "status": "authentication_failed",
        "message": _MESSAGES["authentication_failed"],
    }
    _cached_result = res
    _cached_timestamp = now
    return res


# ──────────────────────────────────────────────────────────────
# INTERNAL — Future hook for authenticated requests
# ──────────────────────────────────────────────────────────────

def get_cdse_access_token() -> str:
    """
    (INTERNAL USE ONLY — never expose the token to any API response)

    Acquire an access token for authenticated Copernicus Data Space
    requests (e.g. future S3 download).

    Raises
    ------
    ValueError
        If CDSE_USERNAME or CDSE_PASSWORD are not configured.
    RuntimeError
        If authentication fails or no token is returned.

    Security
    --------
    The returned token must NEVER be forwarded to any API response,
    logged, or stored persistently.
    """
    username, password = _read_credentials()

    if not username:
        raise ValueError("CDSE_USERNAME is missing from .env")
    if not password:
        raise ValueError("CDSE_PASSWORD is missing from .env")

    payload = {
        "client_id": "cdse-public",
        "grant_type": "password",
        "username": username,
        "password": password,
    }

    try:
        response = requests.post(_TOKEN_URL, data=payload, timeout=20)
    except requests.RequestException as exc:
        raise RuntimeError(
            "Copernicus Data Space authentication request failed."
        ) from exc

    if response.status_code != 200:
        raise RuntimeError(
            f"Copernicus Data Space authentication failed "
            f"(HTTP {response.status_code})."
        )

    token = response.json().get("access_token")
    if not token:
        raise RuntimeError(
            "Copernicus Data Space did not return an access token."
        )

    return token