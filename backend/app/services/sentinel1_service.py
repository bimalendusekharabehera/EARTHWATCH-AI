"""
sentinel1_service.py
====================
Sentinel-1 SAR Product Discovery Service — Foundation Layer

PURPOSE
-------
Query the Copernicus Data Space STAC catalogue for Sentinel-1 GRD products
covering a requested location (resolved from the SQL Server Locations table)
and return structured product metadata.

ARCHITECTURE
------------
This service implements Stage 1 and Stage 3 of the future pipeline:

    Selected Location (SQL Server Locations table)
        ↓
    Sentinel-1 SAR Product Discovery (Copernicus STAC)
        ↓
    Structured Product Metadata (returned to caller)

IMPORTANT CONSTRAINTS
---------------------
- Does NOT download any satellite raster files (SAFE, ZIP, GeoTIFF, etc.)
- Does NOT require CDSE credentials or S3 access
- Does NOT modify Flood_Detections or Satellite_Observations tables
- Does NOT create any local satellite files
- Does NOT duplicate the existing compare_service.py STAC client
- Returns product metadata only
- download_status is always "NOT_IMPLEMENTED" (intentional)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)

# Copernicus public STAC endpoint (no authentication required for metadata search)
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"

# Sentinel-1 GRD collection identifier on Copernicus Data Space
SENTINEL1_COLLECTION = "sentinel-1-grd"

# Bounding box half-width in decimal degrees around location centre
_BBOX_HALF_DEGREE = 0.25


# ──────────────────────────────────────────────────────────────
# BOUNDING BOX HELPER
# ──────────────────────────────────────────────────────────────

def _make_bbox(latitude: float, longitude: float) -> list[float]:
    """
    Build a [west, south, east, north] bounding box centred on
    (latitude, longitude) with a fixed half-width of 0.25 degrees
    (~27 km at the equator — appropriate for Sentinel-1 swath coverage).
    """
    return [
        longitude - _BBOX_HALF_DEGREE,
        latitude  - _BBOX_HALF_DEGREE,
        longitude + _BBOX_HALF_DEGREE,
        latitude  + _BBOX_HALF_DEGREE,
    ]


# ──────────────────────────────────────────────────────────────
# METADATA EXTRACTION
# ──────────────────────────────────────────────────────────────

def _extract_product_metadata(feature: dict) -> dict[str, Any]:
    """
    Extract structured Sentinel-1 metadata from a single STAC feature.

    All optional fields use None if not present in the STAC response.
    The function never raises — missing fields are silently defaulted.
    """
    props: dict = feature.get("properties", {})
    assets: dict = feature.get("assets", {})
    geometry: dict = feature.get("geometry") or {}

    # -----------------------------------------------------------
    # Product ID
    # -----------------------------------------------------------
    product_id: str | None = feature.get("id") or props.get("title") or None

    # -----------------------------------------------------------
    # Collection / product type
    # -----------------------------------------------------------
    collection: str = feature.get("collection", "SENTINEL-1")

    # Product type — prefer explicit field, fall back to inferring GRD from id
    product_type: str | None = (
        props.get("product:type")
        or props.get("sar:product_type")
        or props.get("productType")
        or (
            "GRD"
            if product_id and "GRD" in str(product_id).upper()
            else None
        )
    )

    # -----------------------------------------------------------
    # Acquisition datetime
    # -----------------------------------------------------------
    raw_dt: str | None = props.get("datetime") or props.get("start_datetime")
    if raw_dt:
        # Normalise to ISO-8601 and slice to readable form
        acquisition_date: str | None = raw_dt.replace("Z", "+00:00")
    else:
        acquisition_date = None

    # -----------------------------------------------------------
    # Platform (Sentinel-1A / Sentinel-1B / Sentinel-1C)
    # -----------------------------------------------------------
    platform: str | None = (
        props.get("platform")
        or props.get("constellation")
        or None
    )
    if platform:
        platform = platform.upper()

    # -----------------------------------------------------------
    # SAR Instrument mode
    # -----------------------------------------------------------
    sensor: str | None = (
        props.get("sar:instrument_mode")
        or props.get("instrument")
        or "SAR"
    )

    # -----------------------------------------------------------
    # Polarisation
    # -----------------------------------------------------------
    polarization: str | None = None
    pol_raw = props.get("sar:polarizations")
    if isinstance(pol_raw, list) and pol_raw:
        polarization = "+".join(p.upper() for p in pol_raw)
    elif isinstance(pol_raw, str) and pol_raw:
        polarization = pol_raw.upper()

    # -----------------------------------------------------------
    # Orbit direction (ASCENDING / DESCENDING)
    # -----------------------------------------------------------
    orbit_direction: str | None = (
        props.get("sat:orbit_state")
        or props.get("orbitDirection")
        or None
    )
    if orbit_direction:
        orbit_direction = orbit_direction.upper()

    # -----------------------------------------------------------
    # Relative orbit number
    # -----------------------------------------------------------
    relative_orbit: int | None = (
        props.get("sat:relative_orbit")
        or props.get("relativeOrbitNumber")
        or None
    )
    if relative_orbit is not None:
        try:
            relative_orbit = int(relative_orbit)
        except (TypeError, ValueError):
            relative_orbit = None

    # -----------------------------------------------------------
    # Bounding Box
    # -----------------------------------------------------------
    bbox: list | None = feature.get("bbox") or None

    # -----------------------------------------------------------
    # STAC Item self-link URL
    # -----------------------------------------------------------
    stac_item_url: str | None = None
    for link in feature.get("links", []):
        if isinstance(link, dict) and link.get("rel") == "self":
            stac_item_url = link.get("href")
            break
    if not stac_item_url and product_id:
        stac_item_url = (
            f"https://catalogue.dataspace.copernicus.eu"
            f"/stac/collections/{SENTINEL1_COLLECTION}/items/{product_id}"
        )

    # -----------------------------------------------------------
    # Cloud cover — SAR is cloud-independent; always None
    # -----------------------------------------------------------
    cloud_cover: None = None

    return {
        "product_id":        product_id,
        "collection":        "Sentinel-1",
        "product_type":      product_type or "GRD",
        "sensor":            sensor,
        "acquisition_date":  acquisition_date,
        "platform":          platform,
        "orbit_direction":   orbit_direction,
        "polarization":      polarization,
        "relative_orbit":    relative_orbit,
        "cloud_cover":       cloud_cover,
        "bbox":              bbox,
        "stac_item_url":     stac_item_url,
        "data_source":       "Copernicus Data Space",
    }


# ──────────────────────────────────────────────────────────────
# MAIN DISCOVERY FUNCTION
# ──────────────────────────────────────────────────────────────

def discover_sentinel1_products(
    latitude: float,
    longitude: float,
    days: int = 7,
) -> list[dict[str, Any]]:
    """
    Query Copernicus Data Space STAC for Sentinel-1 GRD products that
    intersect the bounding box centred on (latitude, longitude) within
    the last *days* days up to now.

    Parameters
    ----------
    latitude : float
        Location centre latitude (from SQL Server Locations table).
    longitude : float
        Location centre longitude (from SQL Server Locations table).
    days : int
        Number of past days to search (default 7).

    Returns
    -------
    list[dict]
        List of extracted product metadata dicts.
        Empty list if no products are found or if the STAC query fails.

    Notes
    -----
    - This function does NOT download any raster data.
    - STAC metadata search is public and requires no credentials.
    - The function returns an empty list (not raises) on network failure
      so callers can still return a valid "no products" response.
    """
    now_utc = datetime.now(timezone.utc)
    start_dt = (now_utc - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    end_dt   = now_utc.strftime("%Y-%m-%dT23:59:59Z")

    bbox = _make_bbox(latitude, longitude)

    # POST body for the STAC search endpoint
    payload: dict[str, Any] = {
        "collections": [SENTINEL1_COLLECTION],
        "bbox":        bbox,
        "datetime":    f"{start_dt}/{end_dt}",
        "limit":       20,
        # Sort newest-first so the most recent acquisitions appear first
        "sortby":      [{"field": "datetime", "direction": "desc"}],
    }

    try:
        response = requests.post(
            STAC_URL,
            json=payload,
            timeout=30,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        features: list = response.json().get("features", [])
    except requests.Timeout:
        logger.warning(
            "Sentinel-1 STAC query timed out for bbox=%s datetime=%s/%s",
            bbox, start_dt, end_dt,
        )
        return []
    except requests.HTTPError as exc:
        logger.warning(
            "Sentinel-1 STAC HTTP error %s: %s",
            exc.response.status_code if exc.response else "?",
            exc,
        )
        return []
    except requests.RequestException as exc:
        logger.warning("Sentinel-1 STAC request failed: %s", exc)
        return []

    products: list[dict[str, Any]] = []
    for feat in features:
        try:
            metadata = _extract_product_metadata(feat)
            products.append(metadata)
        except Exception as exc:
            # Never let a single malformed feature break the whole response
            product_id = feat.get("id", "unknown")
            logger.warning(
                "Failed to extract metadata for product %s: %s",
                product_id, exc,
            )
            continue

    logger.info(
        "Sentinel-1 STAC query returned %d product(s) for bbox=%s",
        len(products), bbox,
    )
    return products
