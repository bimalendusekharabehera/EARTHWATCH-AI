"""
sar_preprocessing.py
====================
FastAPI router for Sentinel-1 SAR Preprocessing.

Endpoints
---------
POST /api/sar/preprocess
    Execute preprocessing for a locally downloaded Sentinel-1 product
    and requested polarization ('VV' or 'VH').

GET  /api/sar/status
    Inspect a downloaded Sentinel-1 product to determine available
    polarizations and existing processed rasters.

CONSTRAINTS
-----------
- Operates ONLY on locally downloaded Sentinel-1 products in backend/data/sentinel1/.
- Does NOT trigger downloads.
- Does NOT modify database tables.
- Returns 404 if product is not found locally.
- Returns invalid_polarization if requested polarization is unavailable.
- Returns ALREADY_EXISTS if the product/polarization was already processed.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.sar_preprocessing_service import (
    preprocess_sentinel1_sar,
    get_sar_product_status,
)
from app.api.deps import get_current_user

router = APIRouter()


class SarPreprocessRequest(BaseModel):
    product_id: str = Field(
        ...,
        description="Exact Sentinel-1 product ID of locally downloaded product.",
        min_length=5,
        max_length=200,
    )
    polarization: str = Field(
        ...,
        description="Requested polarization ('VV' or 'VH').",
        min_length=2,
        max_length=2,
    )

    class Config:
        extra = "forbid"


@router.post("/sar/preprocess")
def preprocess_sar(body: SarPreprocessRequest, current_user: dict = Depends(get_current_user)):
    """
    Execute Prototype SAR Preprocessing for a single polarization of a
    locally downloaded Sentinel-1 product.
    """
    res = preprocess_sentinel1_sar(
        product_id=body.product_id,
        polarization=body.polarization,
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

    if status == "invalid_polarization":
        return JSONResponse(
            status_code=400,
            content={
                "status": "invalid_polarization",
                "message": res.get("message", "Requested polarization is not available in this Sentinel-1 product."),
            },
        )

    if status == "error":
        return JSONResponse(
            status_code=500,
            content=res,
        )

    return res


@router.get("/sar/status")
def get_sar_status(product_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieve inspection and preprocessing status for a downloaded Sentinel-1 product.
    """
    return get_sar_product_status(product_id)
