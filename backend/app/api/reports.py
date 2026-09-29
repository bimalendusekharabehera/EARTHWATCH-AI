"""
reports.py
==========
FastAPI router for EarthWatch AI Disaster Assessment Reports.

Endpoint
--------
GET /api/reports/summary?location_id=<id>&product_id=<optional>
    Compiles a comprehensive location-specific disaster assessment dossier.
    Aggregates:
    - Location telemetry (SQL Server Locations)
    - Satellite observations (SQL Server Satellite_Observations)
    - Sentinel-1 SAR product metadata (CDSE STAC / Local Product Registry)
    - SAR Preprocessing metrics (Local Float32 GeoTIFF metadata)
    - Prototype Flood Detection (Local Low-Backscatter Candidate Mask metadata)
    - Prototype Risk Predictions (SQL Server Risk_Predictions)
    - Historical Flood Inundation Context (SQL Server Historical_Floods)
    - Active Warning Alerts (SQL Server Alerts)
    - Rule-based evidence synthesis, methodology, limitations, and provenance
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends

from app.services.report_service import compile_disaster_assessment_report
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/reports/summary")
def get_report_summary(
    location_id: int,
    product_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Generates a comprehensive disaster assessment report for the specified location.
    Requires a valid location_id. Returns HTTP 404 if the location does not exist.
    """
    result = compile_disaster_assessment_report(location_id=location_id, product_id=product_id)

    if result.get("status") == "error":
        raise HTTPException(
            status_code=result.get("code", 500),
            detail=result.get("detail", "Error compiling disaster assessment report."),
        )

    return result
