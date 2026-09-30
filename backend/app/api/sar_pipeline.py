"""
sar_pipeline.py
===============
FastAPI routes for the Sentinel-1 SAR Acquisition Pipeline (Foundation).

Endpoints
---------
GET  /sar/pipeline/summary
    High-level overview of the local scene registry and pipeline stages.

GET  /sar/pipeline/scenes
    List scenes in the local registry, filtered by location / status.

POST /sar/pipeline/discover
    Trigger a STAC scene-discovery run for a given location + date.
    Persists metadata to the local SQLite registry.
    Does NOT download any raster data.
"""

from fastapi import APIRouter, HTTPException, Query, Depends

from app.services.sar_pipeline_service import (
    discover_scenes,
    get_registry_scenes,
    get_pipeline_summary,
)
from app.api.deps import get_current_user


router = APIRouter()


# ──────────────────────────────────────────────────────────────
# GET /sar/pipeline/summary
# ──────────────────────────────────────────────────────────────

@router.get("/sar/pipeline/summary")
def sar_pipeline_summary(
    current_user: dict = Depends(get_current_user)
):
    """
    Return a high-level summary of the SAR acquisition pipeline:
    total scenes in the registry, counts by status, and the four
    pipeline stages with their implementation status.
    """
    try:
        return get_pipeline_summary()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read SAR pipeline summary: {exc}"
        )


# ──────────────────────────────────────────────────────────────
# GET /sar/pipeline/scenes
# ──────────────────────────────────────────────────────────────

@router.get("/sar/pipeline/scenes")
def sar_pipeline_scenes(
    location: str | None = Query(
        default=None,
        description="Filter by location name (e.g. bhubaneswar)"
    ),
    status: str | None = Query(
        default=None,
        description="Filter by scene status: PENDING | ACQUIRED | PROCESSED | FAILED"
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Maximum number of scenes to return"
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    List Sentinel-1 scenes stored in the local registry.
    All query parameters are optional.
    """
    try:
        scenes = get_registry_scenes(
            location=location,
            status=status,
            limit=limit,
        )
        return {
            "status": "success",
            "count": len(scenes),
            "scenes": scenes,
            "filters": {
                "location": location,
                "status": status,
                "limit": limit,
            },
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query SAR scene registry: {exc}"
        )


# ──────────────────────────────────────────────────────────────
# POST /sar/pipeline/discover
# ──────────────────────────────────────────────────────────────

@router.post("/sar/pipeline/discover")
def sar_pipeline_discover(
    location: str = Query(
        default="bhubaneswar",
        description="Monitored location name"
    ),
    date: str = Query(
        default="2026-09-19",
        description="Centre date for STAC search (YYYY-MM-DD)"
    ),
    window_days: int = Query(
        default=3,
        ge=1,
        le=14,
        description="Half-width of temporal search window in days"
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Trigger a Sentinel-1 scene discovery run against the
    Copernicus STAC catalogue.

    Discovered scenes are persisted to the local SQLite registry
    with status **PENDING**.

    This endpoint does **not** download any raster data from S3 / CDSE.
    """
    try:
        result = discover_scenes(
            location=location,
            date=date,
            window_days=window_days,
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"SAR scene discovery failed: {exc}"
        )
