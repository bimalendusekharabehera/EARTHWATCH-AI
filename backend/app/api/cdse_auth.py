"""
cdse_auth.py
============
FastAPI router for Copernicus Data Space (CDSE) authentication status.

Endpoints
---------
GET  /api/cdse/status
    Return the current CDSE authentication status.

POST /api/cdse/test
    Actively test the CDSE credentials configured in the backend .env
    and return the authentication result.

SECURITY
--------
- The frontend NEVER sends credentials to these endpoints.
- These endpoints NEVER return passwords, tokens, or secrets.
- Only safe status strings and human-readable messages are returned.
- All credential handling occurs exclusively inside cdse_auth_service.py.

RESPONSE CONTRACT
-----------------
All responses conform to one of three safe status values:

    {
        "status": "connected" | "not_configured" | "authentication_failed",
        "message": "<human-readable description>"
    }
"""

from fastapi import APIRouter, HTTPException

from app.services.cdse_auth_service import check_cdse_status


router = APIRouter()


@router.get("/cdse/status")
def get_cdse_status():
    """
    Return the current Copernicus Data Space authentication status.
    Possible responses:
    - not_configured: credentials missing from backend .env
    - connected: authentication successful
    - authentication_failed: credentials invalid or rejected
    """
    try:
        return check_cdse_status(force_refresh=False)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while checking Copernicus Data Space status.",
        )


@router.post("/cdse/test")
def test_cdse_connection():
    """
    Actively test the CDSE credentials configured in the backend .env
    by attempting authentication with Copernicus Data Space.

    The frontend does NOT send any credentials.
    The response does NOT include any credentials or tokens.
    """
    try:
        return check_cdse_status(force_refresh=True)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred while testing Copernicus Data Space authentication.",
        )
