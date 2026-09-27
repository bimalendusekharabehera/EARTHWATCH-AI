"""
sentinel1_download.py
======================
FastAPI router for Controlled Single Sentinel-1 Product Download.

Endpoints
---------
POST /api/sentinel1/download
    Download ONE user-selected Sentinel-1 SAR product from Copernicus Data Space.
    1. Validates location_id against SQL Server Locations table (404 on failure).
    2. Validates product_id against Copernicus Data Space STAC for that location (400 on failure).
    3. Checks if product has already been downloaded (returns ALREADY_EXISTS).
    4. Authenticates with Copernicus Data Space via cdse_auth_service.py.
    5. Streams product download to backend/data/sentinel1/<product_id>/.
    6. Returns safe download status metadata.

GET  /api/sentinel1/download/status
    Check if a specific Sentinel-1 product has already been downloaded locally.

GET  /api/sentinel1/download/info
    Retrieve pre-download metadata (including estimated size) for size protection.

SECURITY CONSTRAINTS
--------------------
- Frontend never provides URLs, auth tokens, or filesystem paths.
- Credentials and tokens are NEVER exposed or returned in API responses.
- No automatic downloads.
- No database tables modified.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config.database import get_connection
from app.services.sentinel1_download_service import (
    execute_product_download,
    is_product_downloaded,
    validate_sentinel1_product,
)

router = APIRouter()


class Sentinel1DownloadRequest(BaseModel):
    product_id: str = Field(
        ...,
        description="Exact Sentinel-1 product ID from discovery endpoint.",
        min_length=5,
        max_length=200,
    )
    location_id: int = Field(
        ...,
        description="Location ID from the SQL Server Locations table.",
        ge=1,
    )

    class Config:
        extra = "forbid"


# ──────────────────────────────────────────────────────────────
# HELPER — resolve location from SQL Server Locations table
# ──────────────────────────────────────────────────────────────

def _get_location_record(location_id: int) -> dict | None:
    """
    Look up a location by LocationID in the SQL Server Locations table.
    Returns dict if found, None if row does not exist.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                LocationID,
                LocationName,
                District,
                State,
                Latitude,
                Longitude
            FROM Locations
            WHERE LocationID = ?
            """,
            (location_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return {
            "location_id": row.LocationID,
            "name": row.LocationName,
            "district": row.District,
            "state": row.State,
            "latitude": float(row.Latitude),
            "longitude": float(row.Longitude),
        }
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────
# POST /sentinel1/download
# ──────────────────────────────────────────────────────────────

@router.post("/sentinel1/download")
def download_sentinel1_product(body: Sentinel1DownloadRequest):
    """
    Download exactly ONE user-selected Sentinel-1 SAR product.

    Flow
    ----
    1. Validate location_id against Locations table (HTTP 404 if not found).
    2. Check if product already exists locally (returns ALREADY_EXISTS).
    3. Validate product against Copernicus Data Space STAC for this location (HTTP 400 if invalid).
    4. Authenticate with Copernicus Data Space (cdse_auth_service).
    5. Download product to local storage.
    6. Return structured status.
    """
    # ── 1. Validate Location ─────────────────────────────────
    try:
        location = _get_location_record(body.location_id)
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "message": f"Unable to query Locations database: {exc}",
            },
        )

    if location is None:
        return JSONResponse(
            status_code=404,
            content={
                "status": "not_found",
                "message": "Location not found.",
            },
        )

    # ── 2. Validate Product against STAC ─────────────────────
    valid, prod_info, err_msg = validate_sentinel1_product(
        product_id=body.product_id,
        latitude=location["latitude"],
        longitude=location["longitude"],
    )
    if not valid or not prod_info:
        return JSONResponse(
            status_code=400,
            content={
                "status": "invalid_product",
                "message": "The selected Sentinel-1 product is not valid for this location.",
            },
        )

    # ── 3. Check if already downloaded ───────────────────────
    already_downloaded, rel_path, file_size = is_product_downloaded(body.product_id)
    if already_downloaded:
        return {
            "status": "already_downloaded",
            "product_id": body.product_id,
            "download_status": "ALREADY_EXISTS",
        }

    # ── 4. Authenticate & Download ───────────────────────────
    result = execute_product_download(
        product_id=body.product_id,
        location_id=body.location_id,
        latitude=location["latitude"],
        longitude=location["longitude"],
        product_info=prod_info,
    )

    return result


# ──────────────────────────────────────────────────────────────
# GET /sentinel1/download/status
# ──────────────────────────────────────────────────────────────

@router.get("/sentinel1/download/status")
def get_download_status(product_id: str):
    """
    Check if a Sentinel-1 product is already downloaded locally.
    """
    downloaded, rel_path, file_size = is_product_downloaded(product_id)
    return {
        "product_id": product_id,
        "is_downloaded": downloaded,
        "file_path": rel_path,
        "file_size_bytes": file_size,
    }


# ──────────────────────────────────────────────────────────────
# GET /sentinel1/download/info
# ──────────────────────────────────────────────────────────────

@router.get("/sentinel1/download/info")
def get_download_info(product_id: str, location_id: int):
    """
    Obtain pre-download metadata (including expected size) for confirmation UX.
    """
    location = _get_location_record(location_id)
    if not location:
        return JSONResponse(
            status_code=404,
            content={"status": "not_found", "message": "Location not found."},
        )

    valid, prod_info, err_msg = validate_sentinel1_product(
        product_id=product_id,
        latitude=location["latitude"],
        longitude=location["longitude"],
    )
    if not valid or not prod_info:
        return JSONResponse(
            status_code=400,
            content={
                "status": "invalid_product",
                "message": "The selected Sentinel-1 product is not valid for this location.",
            },
        )

    already_downloaded, rel_path, existing_sz = is_product_downloaded(product_id)

    return {
        "status": "valid",
        "product_id": product_id,
        "filename": prod_info.get("filename"),
        "expected_size_bytes": prod_info.get("expected_size_bytes"),
        "is_downloaded": already_downloaded,
        "existing_path": rel_path,
        "existing_size_bytes": existing_sz,
    }
