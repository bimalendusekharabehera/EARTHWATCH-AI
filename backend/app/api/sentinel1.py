"""
sentinel1.py
============
FastAPI router for Sentinel-1 SAR Product Discovery.

Endpoint
--------
GET  /api/sentinel1/products
    Resolve location_id → SQL Server Locations table → lat/lon.
    Search Copernicus Data Space STAC for Sentinel-1 GRD products.
    Return structured product metadata.

    Does NOT download any satellite data (SAFE, ZIP, S3, etc.).
    Does NOT require CDSE credentials.
    Does NOT modify any database table.

    download_status is always "NOT_IMPLEMENTED" (intentional).

Parameters
----------
location_id : int
    Required. Must match a row in the SQL Server Locations table.
days : int
    Optional. Number of past days to search (default 7, max 30).
"""

from fastapi import APIRouter, HTTPException, Query

from app.config.database import get_connection
from app.services.sentinel1_service import discover_sentinel1_products


router = APIRouter()


# ──────────────────────────────────────────────────────────────
# HELPER — resolve location from SQL Server Locations table
# ──────────────────────────────────────────────────────────────

def _get_location(location_id: int) -> dict:
    """
    Look up a location by LocationID in the SQL Server Locations table.

    Returns a dict with keys: location_id, name, district, state,
    latitude, longitude.

    Raises
    ------
    HTTPException 404
        If no matching row is found in the Locations table.
    HTTPException 503
        If the SQL Server connection cannot be established.
    """
    try:
        conn = get_connection()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to connect to EarthWatch AI database: {exc}",
        )

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
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Location not found. "
                f"No Locations record exists for location_id={location_id}."
            ),
        )

    return {
        "location_id": row.LocationID,
        "name":        row.LocationName,
        "district":    row.District,
        "state":       row.State,
        "latitude":    float(row.Latitude),
        "longitude":   float(row.Longitude),
    }


# ──────────────────────────────────────────────────────────────
# GET /sentinel1/products
# ──────────────────────────────────────────────────────────────

@router.get("/sentinel1/products")
def get_sentinel1_products(
    location_id: int = Query(
        ...,
        description="Location ID from the SQL Server Locations table.",
    ),
    days: int = Query(
        default=7,
        ge=1,
        le=30,
        description=(
            "Number of past days to search for Sentinel-1 products "
            "(default 7, max 30)."
        ),
    ),
):
    """
    Discover available Sentinel-1 SAR GRD products from Copernicus Data Space
    for the specified monitored location and time window.

    Steps
    -----
    1. Validate location_id against the SQL Server Locations table.
    2. Return HTTP 404 if the location does not exist.
    3. Extract latitude and longitude from the Locations row.
    4. Search the Copernicus STAC catalogue for Sentinel-1 GRD products.
    5. Return structured product metadata only.

    This endpoint does NOT download any satellite files.
    download_status is always "NOT_IMPLEMENTED".
    """

    # -----------------------------------------------------------
    # 1. Resolve location from SQL Server
    # -----------------------------------------------------------
    location = _get_location(location_id)

    # -----------------------------------------------------------
    # 2. Query Copernicus STAC for Sentinel-1 products
    # -----------------------------------------------------------
    try:
        products = discover_sentinel1_products(
            latitude=location["latitude"],
            longitude=location["longitude"],
            days=days,
        )
    except Exception as exc:
        # Service-level failure — STAC is reachable but discovery failed
        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to retrieve Sentinel-1 products from "
                f"Copernicus Data Space: {exc}"
            ),
        )

    # -----------------------------------------------------------
    # 3. Build and return response
    # -----------------------------------------------------------
    return {
        "status":   "success",
        "location": location,
        "products": products,
        "count":    len(products),
        "query": {
            "location_id":   location_id,
            "days":          days,
            "collection":    "sentinel-1-grd",
            "data_source":   "Copernicus Data Space",
            "stac_endpoint": "https://stac.dataspace.copernicus.eu/v1/search",
        },
        "download_status": "NOT_IMPLEMENTED",
        "pipeline_note": (
            "This endpoint performs PRODUCT DISCOVERY ONLY. "
            "No satellite data has been downloaded. "
            "S3 acquisition requires CDSE credentials and "
            "will be implemented as a separate future pipeline stage."
        ),
    }
