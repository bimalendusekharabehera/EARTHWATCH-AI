"""
flood_detection.py
==================
FastAPI router for Sentinel-1 SAR Prototype Flood Detection.

Endpoints
---------
POST /api/flood/detect
    Execute prototype low-backscatter flood detection for a preprocessed
    Sentinel-1 product and polarization ('VV' or 'VH').

GET  /api/flood/detection/status
    Retrieve existing flood detection status and metadata for a product.

CONSTRAINTS
-----------
- Operates ONLY on preprocessed Sentinel-1 rasters in backend/data/sentinel1/processed/.
- Does NOT download data.
- Does NOT modify database tables.
- Returns 404 if product is not found locally.
- Returns 400 if SAR preprocessing has not been completed.
- Returns 400 for invalid polarization or threshold.
- Returns ALREADY_EXISTS if the product/polarization was already processed (unless forced).
"""

from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.flood_detection_service import (
    detect_sentinel1_flood,
    get_flood_detection_status,
)
from app.api.deps import get_current_user

router = APIRouter()


class FloodDetectionRequest(BaseModel):
    product_id: str = Field(
        ...,
        description="Exact Sentinel-1 product ID of preprocessed product.",
        min_length=5,
        max_length=200,
    )
    polarization: str = Field(
        default="VV",
        description="Requested polarization ('VV' or 'VH').",
        min_length=2,
        max_length=2,
    )
    threshold: Optional[float] = Field(
        default=None,
        description="Optional backscatter Digital Number (DN) threshold for water candidates.",
    )
    dn_threshold: Optional[float] = Field(
        default=None,
        description="Alias for threshold parameter.",
    )
    force: Optional[bool] = Field(
        default=False,
        description="If True, re-runs flood detection even if already generated.",
    )

    class Config:
        extra = "forbid"


@router.post("/flood/detect")
def detect_flood(body: FloodDetectionRequest, current_user: dict = Depends(get_current_user)):
    """
    Execute Prototype SAR Flood Detection for a preprocessed Sentinel-1 raster.
    """
    chosen_threshold = body.threshold if body.threshold is not None else body.dn_threshold

    res = detect_sentinel1_flood(
        product_id=body.product_id,
        polarization=body.polarization,
        threshold=chosen_threshold,
        force=bool(body.force),
    )

    status = res.get("status")

    if status == "not_found":
        return JSONResponse(
            status_code=404,
            content={
                "status": "not_found",
                "message": res.get("message", "Downloaded Sentinel-1 product not found locally."),
            },
        )

    if status == "not_preprocessed":
        return JSONResponse(
            status_code=400,
            content={
                "status": "not_preprocessed",
                "message": res.get(
                    "message",
                    "SAR preprocessing has not been completed for this product.",
                ),
            },
        )

    if status == "invalid_polarization":
        return JSONResponse(
            status_code=400,
            content={
                "status": "invalid_polarization",
                "message": res.get(
                    "message",
                    "Requested polarization is invalid. Supported options: 'VV', 'VH'.",
                ),
            },
        )

    if status == "invalid_threshold":
        return JSONResponse(
            status_code=400,
            content={
                "status": "invalid_threshold",
                "message": res.get("message", "Threshold must be a positive numeric value."),
            },
        )

    if status == "error":
        return JSONResponse(
            status_code=500,
            content=res,
        )

    return res


@router.get("/flood/detection/status")
def get_detection_status(
    product_id: str,
    polarization: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve inspection and flood detection status for a Sentinel-1 product.
    """
    if not product_id or not product_id.strip():
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "product_id parameter is required.",
            },
        )

    res = get_flood_detection_status(product_id.strip(), polarization=polarization)
    if res.get("status") == "invalid_polarization":
        return JSONResponse(
            status_code=400,
            content=res,
        )
    return res

