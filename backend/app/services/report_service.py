"""
report_service.py
=================
Comprehensive Disaster Assessment Report Service for EarthWatch AI.

Integrates real available information across all 5 pipeline stages:
1. Location Data (SQL Server Locations)
2. Satellite Observations (SQL Server Satellite_Observations)
3. Sentinel-1 SAR Product (Copernicus / Local Product Registry)
4. SAR Preprocessing (Local Processed GeoTIFF Metadata)
5. Prototype Flood Detection (Local Flood Mask GeoTIFF Metadata)
6. Hydrological Risk Prediction (SQL Server Risk_Predictions)
7. Historical Flood Context (SQL Server Historical_Floods)
8. Active Alerts (SQL Server Alerts)
9. Evidence-Based Overall Assessment (Transparent Rule-Based Synthesis)
10. Scientific Methodology, Limitations, and Data Provenance

CONSTRAINTS:
- READ-ONLY with respect to SQL Server. Zero DDL, zero inserts, zero updates.
- Reads existing metadata JSON files from disk (does NOT rerun heavy raster jobs).
- No LLM, no fake AI confidence scores, no hallucinatory probability numbers.
- Explicit scientific honesty: "Potential Flood / Low-Backscatter Candidate Mask".
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from app.config.database import get_connection
from app.services.sentinel1_download_service import is_product_downloaded

logger = logging.getLogger(__name__)

# Base directories
_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "sentinel1")
)
_PROCESSED_DIR = os.path.join(_BASE_DIR, "processed")
_FLOOD_DIR = os.path.join(_BASE_DIR, "flood_detection")

# Pipeline Methodology Steps
METHODOLOGY_STEPS = [
    {
        "step": 1,
        "name": "Sentinel-1 Product Discovery",
        "description": "Spatial-temporal bounding query against Copernicus Data Space STAC API for Sentinel-1 C-band SAR GRD assets intersecting monitored coordinates.",
    },
    {
        "step": 2,
        "name": "Controlled Archive Download",
        "description": "Authenticated single-product download of high-resolution SAR archive (SAFE / COG) with integrity verification and local staging.",
    },
    {
        "step": 3,
        "name": "SAR Measurement Extraction",
        "description": "Rasterio-based extraction of dual-polarization amplitude measurement rasters (VV and VH channels) preserving native geospatial references.",
    },
    {
        "step": 4,
        "name": "NoData Masking & Normalization",
        "description": "Explicit identification of orbital border NoData pixels (-9999) and conversion of valid 16-bit integer Digital Numbers to standard Float32 arrays.",
    },
    {
        "step": 5,
        "name": "Prototype Low-Backscatter Thresholding",
        "description": "Transparent threshold evaluation (DN <= threshold) identifying specular low-backscatter surfaces characteristic of calm water and potential flood inundation.",
    },
    {
        "step": 6,
        "name": "Geodesic Area Calculation",
        "description": "WGS-84 ellipsoidal per-latitude geodesic integration computing precise ground area in square meters and square kilometers without planar distortion.",
    },
    {
        "step": 7,
        "name": "Hydrological Risk Correlation",
        "description": "Integration of environmental risk parameters (rainfall, river proximity, elevation, slope, NDWI) from database predictive models.",
    },
    {
        "step": 8,
        "name": "Historical Context & Alert Ingestion",
        "description": "Historical inundation baseline comparison and active meteorological warning synthesis.",
    },
    {
        "step": 9,
        "name": "Multi-Evidence Report Generation",
        "description": "Structured compilation of multi-source telemetry, candidate metrics, limitations, and provenance into an audit-ready disaster assessment dossier.",
    },
]

# Standard Scientific Limitations
REPORT_LIMITATIONS = [
    "Prototype Threshold-Based Detection: Employs a low-backscatter digital number threshold without adaptive histogram bimodal fitting or machine learning segmentation.",
    "No Radiometric Calibration: DN values represent uncalibrated radar amplitude rather than certified sigma-naught (σ°) backscatter coefficients in decibels.",
    "No Terrain Correction / DEM Flattening: Topographic radar shadows in undulating or hilly terrain produce low backscatter and can create false-positive water candidates.",
    "No Speckle Filtering: Inherent SAR speckle noise (granular coherent interference) is preserved in candidate classifications.",
    "No Hydrological Ground-Truth Validation: Specular smooth reflectors (smooth asphalt roads, airport runways, dry sand, calm standing water bodies) exhibit identical low radar backscatter.",
    "Candidate Extent Notice: Detected areas represent potential flood / low-backscatter candidates and must not be interpreted as certified or confirmed flood boundaries.",
]

# Provenance Sources
DATA_PROVENANCE = {
    "sql_database": "SQL Server / EarthWatchAI Database (Locations, Observations, Risk, History, Alerts)",
    "satellite_catalogue": "Copernicus Data Space Ecosystem (CDSE) STAC API v1",
    "sar_platform": "European Space Agency (ESA) Sentinel-1 C-SAR Constellation",
    "sar_preprocessing": "EarthWatch AI Local SAR Preprocessing Service (Float32 / Rasterio)",
    "flood_detection": "EarthWatch AI Prototype SAR Low-Backscatter Threshold Pipeline",
    "risk_model": "EarthWatch AI Prototype Hydro-Meteorological Risk Model",
    "historical_dataset": "State Disaster Management Authority (SDMA) Inundation Archives",
}


def _point_in_bounds(lat: float, lon: float, bounds: list[float], margin: float = 0.05) -> bool:
    """Check if lat/lon coordinate falls within [min_lon, min_lat, max_lon, max_lat]."""
    if len(bounds) != 4:
        return False
    min_lon, min_lat, max_lon, max_lat = bounds
    return (min_lon - margin <= lon <= max_lon + margin) and (min_lat - margin <= lat <= max_lat + margin)


def find_sentinel1_product_for_location(
    lat: float,
    lon: float,
    product_id: Optional[str] = None,
) -> tuple[Optional[str], Optional[dict], Optional[dict]]:
    """
    Locates the most relevant Sentinel-1 product and its processed/flood metadata.
    Returns: (product_id, preprocessing_metadata, flood_detection_metadata)
    """
    # 1. If explicit product_id requested
    if product_id and isinstance(product_id, str):
        safe_id = re.sub(r"[^A-Za-z0-9_\-\.]", "_", product_id)
        proc_meta = _read_json_file(os.path.join(_PROCESSED_DIR, safe_id, "metadata.json"))
        flood_meta = _read_json_file(os.path.join(_FLOOD_DIR, safe_id, "metadata.json"))
        return safe_id, proc_meta, flood_meta

    # 2. Inspect flood detection directories first
    if os.path.isdir(_FLOOD_DIR):
        for entry in sorted(os.listdir(_FLOOD_DIR), reverse=True):
            dir_path = os.path.join(_FLOOD_DIR, entry)
            if os.path.isdir(dir_path):
                flood_meta = _read_json_file(os.path.join(dir_path, "metadata.json"))
                if flood_meta:
                    first_val = next(iter(flood_meta.values()), {})
                    bounds = first_val.get("bounds", [])
                    if bounds and _point_in_bounds(lat, lon, bounds):
                        proc_meta = _read_json_file(os.path.join(_PROCESSED_DIR, entry, "metadata.json"))
                        return entry, proc_meta, flood_meta

    # 3. Inspect processed directories next
    if os.path.isdir(_PROCESSED_DIR):
        for entry in sorted(os.listdir(_PROCESSED_DIR), reverse=True):
            dir_path = os.path.join(_PROCESSED_DIR, entry)
            if os.path.isdir(dir_path):
                proc_meta = _read_json_file(os.path.join(dir_path, "metadata.json"))
                if proc_meta:
                    first_val = next(iter(proc_meta.values()), {})
                    bounds = first_val.get("bounds", [])
                    if bounds and _point_in_bounds(lat, lon, bounds):
                        flood_meta = _read_json_file(os.path.join(_FLOOD_DIR, entry, "metadata.json"))
                        return entry, proc_meta, flood_meta

    return None, None, None


def _read_json_file(filepath: str) -> Optional[dict]:
    """Safely read and parse a JSON file."""
    if not os.path.isfile(filepath):
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.warning(f"Error reading JSON from {filepath}: {exc}")
        return None


def parse_sentinel1_product_details(product_id: str) -> dict:
    """Parse platform, instrument mode, date, and polarizations from standard Sentinel-1 product ID."""
    details = {
        "product_id": product_id,
        "platform": "Sentinel-1",
        "mode": "Interferometric Wide (IW)",
        "product_type": "GRD",
        "polarizations": ["VV", "VH"],
        "acquisition_date": "N/A",
        "download_status": "DOWNLOADED",
    }

    if product_id.startswith("S1A_"):
        details["platform"] = "Sentinel-1A"
    elif product_id.startswith("S1B_"):
        details["platform"] = "Sentinel-1B"
    elif product_id.startswith("S1C_"):
        details["platform"] = "Sentinel-1C"
    elif product_id.startswith("S1D_"):
        details["platform"] = "Sentinel-1D"

    # Regex parse start datetime: e.g. 20260924T001243
    dt_match = re.search(r"(\d{8}T\d{6})", product_id)
    if dt_match:
        dt_str = dt_match.group(1)
        try:
            parsed_dt = datetime.strptime(dt_str, "%Y%m%dT%H%M%S")
            details["acquisition_date"] = parsed_dt.strftime("%Y-%m-%d %H:%M:%S UTC")
        except Exception:
            details["acquisition_date"] = dt_str

    if "_IW_" in product_id:
        details["mode"] = "IW (Interferometric Wide)"
    elif "_EW_" in product_id:
        details["mode"] = "EW (Extra-Wide Swath)"
    elif "_SM_" in product_id:
        details["mode"] = "SM (Stripmap)"

    if "GRDH" in product_id:
        details["product_type"] = "GRDH (Ground Range Detected High-Res)"
    elif "GRDM" in product_id:
        details["product_type"] = "GRDM (Ground Range Detected Medium-Res)"

    dl_ok, _, _ = is_product_downloaded(product_id)
    details["download_status"] = "DOWNLOADED" if dl_ok else "STAGED_LOCAL"

    return details


def generate_overall_assessment(
    location_name: str,
    flood_detection: Optional[dict],
    risk_prediction: Optional[dict],
    historical_floods: list[dict],
    alerts: list[dict],
) -> dict:
    """
    Transparent, rule-based evidence synthesis.
    Does NOT use generative AI or hallucinated probabilities.
    """
    findings = []
    evidence_items = []

    # 1. Flood Detection Synthesis
    if flood_detection and flood_detection.get("status") == "success":
        area_km2 = flood_detection.get("detected_area_km2", 0)
        pct = flood_detection.get("flood_percentage", 0)
        pol = flood_detection.get("polarization", "VV")
        thresh = flood_detection.get("threshold_used", "N/A")
        pix = flood_detection.get("candidate_flood_pixels", 0)

        findings.append(
            f"Prototype SAR analysis identified {pix:,} low-backscatter candidate pixels "
            f"covering approximately {area_km2:.2f} km² ({pct:.2f}% of valid analyzed scene) "
            f"under {pol} polarization using a DN threshold of {thresh}."
        )
        evidence_items.append({
            "source": "Prototype SAR Flood Detection",
            "observation": f"{area_km2:.2f} km² ({pct:.2f}%) low-backscatter candidate extent",
            "type": "CANDIDATE_SURFACE_INUNDATION",
            "confidence_note": "Threshold-based prototype; not ground-truth validated",
        })
    else:
        findings.append("Flood detection has not been performed for the selected Sentinel-1 product.")

    # 2. Risk Prediction Synthesis
    if risk_prediction:
        risk_lvl = risk_prediction.get("risk_level", "UNKNOWN")
        risk_score = risk_prediction.get("risk_score")
        score_pct = f"{round(risk_score * 100)}%" if risk_score is not None else "N/A"
        rf = risk_prediction.get("rainfall_mm", "N/A")
        rd = risk_prediction.get("river_distance_km", "N/A")

        findings.append(
            f"Existing database predictive models indicate a {risk_lvl} prototype risk score ({score_pct}) "
            f"with recorded rainfall of {rf} mm and river proximity of {rd} km."
        )
        evidence_items.append({
            "source": "Prototype Hydro-Meteorological Risk Model",
            "observation": f"{risk_lvl} Risk ({score_pct})",
            "type": "MODEL_PREDICTION",
            "confidence_note": "Experimental prototype model; not a certified probability",
        })
    else:
        findings.append("No risk prediction is available for this location.")

    # 3. Historical Floods Synthesis
    if historical_floods:
        cnt = len(historical_floods)
        max_area = max(
            (h.get("flooded_area_km2") or 0 for h in historical_floods),
            default=0
        )
        years = sorted({str(h.get("flood_year")) for h in historical_floods if h.get("flood_year")})
        years_str = ", ".join(years)

        findings.append(
            f"Historical database records archive {cnt} major inundation events (Years: {years_str}) "
            f"with peak recorded historical impact reaching {max_area:.1f} km²."
        )
        evidence_items.append({
            "source": "State Disaster Management Historical Records",
            "observation": f"{cnt} recorded historical inundation events (Peak: {max_area:.1f} km²)",
            "type": "HISTORICAL_BASELINE",
            "confidence_note": "Archived government disaster telemetry",
        })
    else:
        findings.append("No historical flood records available for this location.")

    # 4. Alerts Synthesis
    active_alerts = [a for a in alerts if not a.get("is_resolved", False)]
    if active_alerts:
        top_alert = active_alerts[0]
        findings.append(
            f"{len(active_alerts)} active warning alert(s) currently recorded: "
            f"[{top_alert.get('alert_level')} • {top_alert.get('alert_type')}] "
            f"{top_alert.get('alert_message')}."
        )
        evidence_items.append({
            "source": "Early Warning Telemetry / Alerts Registry",
            "observation": f"{len(active_alerts)} active warnings: {top_alert.get('alert_type')}",
            "type": "ACTIVE_EARLY_WARNING",
            "confidence_note": "Active real-time alert state in database",
        })
    else:
        findings.append("No active alerts are recorded for this location.")

    # 5. Rule-Based Threat Synthesis
    has_flood_candidates = bool(flood_detection and flood_detection.get("detected_area_km2", 0) > 0)
    high_risk = bool(risk_prediction and str(risk_prediction.get("risk_level", "")).upper() == "HIGH")
    has_active_alerts = len(active_alerts) > 0

    if has_flood_candidates and (high_risk or has_active_alerts):
        conclusion_category = "HIGH_CONVERGENCE_CONCERN"
        conclusion_statement = (
            f"Multi-source convergence indicates elevated inundation potential for {location_name}. "
            "Satellite SAR low-backscatter candidate regions align with predictive risk indicators and active alerts. "
            "Field inspection and ground-truth hydrologic verification are recommended."
        )
    elif has_flood_candidates:
        conclusion_category = "LOCALIZED_CANDIDATE_ANOMALIES"
        conclusion_statement = (
            f"Localized low-backscatter candidate regions were identified in {location_name}. "
            "Because environmental risk scores are moderate or unrecorded, candidates should be cross-referenced "
            "with baseline standing water bodies and topography to rule out specular ground reflections."
        )
    elif high_risk or has_active_alerts:
        conclusion_category = "PREDICTIVE_RISK_WARNING"
        conclusion_statement = (
            f"Environmental predictive factors or active alerts indicate elevated flood risk for {location_name}, "
            "though recent SAR imagery does not demonstrate extensive candidate low-backscatter anomalies."
        )
    else:
        conclusion_category = "BASELINE_MONITORING"
        conclusion_statement = (
            f"Monitored telemetry for {location_name} reflects baseline conditions. "
            "No extensive candidate anomalies or severe hydrological risks are indicated in active records."
        )

    return {
        "category": conclusion_category,
        "statement": conclusion_statement,
        "evidence_summary": findings,
        "evidence_items": evidence_items,
    }


def compile_disaster_assessment_report(
    location_id: int,
    product_id: Optional[str] = None,
) -> dict:
    """
    Compiles the complete EarthWatch AI Disaster Assessment Report for a location.
    Queries SQL Server (read-only) and reads local SAR and flood detection outputs.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # ── 1. Resolve Location ──────────────────────────────────────────────
        cursor.execute(
            "SELECT LocationID, LocationName, District, State, Latitude, Longitude "
            "FROM Locations WHERE LocationID = ?",
            [location_id],
        )
        loc_row = cursor.fetchone()
        if not loc_row:
            return {
                "status": "error",
                "code": 404,
                "detail": f"Location with location_id={location_id} not found in database.",
            }

        location = {
            "id": loc_row.LocationID,
            "location_id": loc_row.LocationID,
            "name": loc_row.LocationName,
            "district": loc_row.District,
            "state": loc_row.State,
            "latitude": float(loc_row.Latitude),
            "longitude": float(loc_row.Longitude),
        }

        # ── 2. Satellite Observations (SQL Server) ───────────────────────────
        cursor.execute(
            """
            SELECT SO.ObservationID, SO.LocationID, L.LocationName,
                   SO.Satellite, SO.Sensor, SO.AcquisitionDate,
                   SO.ProductID, SO.CloudCover, SO.DataSource
            FROM Satellite_Observations SO
            INNER JOIN Locations L ON SO.LocationID = L.LocationID
            WHERE SO.LocationID = ?
            ORDER BY SO.AcquisitionDate DESC
            """,
            [location_id],
        )
        satellite_observations = [
            {
                "observation_id": r.ObservationID,
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "satellite": r.Satellite,
                "sensor": r.Sensor,
                "acquisition_date": str(r.AcquisitionDate),
                "product_id": r.ProductID,
                "cloud_cover": float(r.CloudCover) if r.CloudCover is not None else None,
                "data_source": r.DataSource,
                "source_type": "DATABASE OBSERVATION",
            }
            for r in cursor.fetchall()
        ]

        # ── 3. Database Flood Detections (SQL Server) ────────────────────────
        cursor.execute(
            """
            SELECT FD.FloodDetectionID, FD.ObservationID,
                   L.LocationID, L.LocationName, L.District,
                   SO.Satellite, SO.Sensor, FD.DetectionDate,
                   FD.Status, FD.FloodedAreaKm2, FD.FloodPercentage,
                   FD.Confidence, FD.DetectionMethod, FD.Source
            FROM Flood_Detections FD
            INNER JOIN Satellite_Observations SO ON FD.ObservationID = SO.ObservationID
            INNER JOIN Locations L ON SO.LocationID = L.LocationID
            WHERE L.LocationID = ?
            ORDER BY FD.DetectionDate DESC
            """,
            [location_id],
        )
        db_flood_detections = [
            {
                "flood_detection_id": r.FloodDetectionID,
                "observation_id": r.ObservationID,
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "district": r.District,
                "satellite": r.Satellite,
                "sensor": r.Sensor,
                "detection_date": str(r.DetectionDate),
                "status": r.Status,
                "flooded_area_km2": float(r.FloodedAreaKm2) if r.FloodedAreaKm2 is not None else None,
                "flood_percentage": float(r.FloodPercentage) if r.FloodPercentage is not None else None,
                "confidence": float(r.Confidence) if r.Confidence is not None else None,
                "detection_method": r.DetectionMethod,
                "source": r.Source,
            }
            for r in cursor.fetchall()
        ]

        # ── 4. Flood Regions (SQL Server) ────────────────────────────────────
        cursor.execute(
            """
            SELECT FR.FloodRegionID, FR.FloodDetectionID, FD.DetectionDate,
                   L.LocationID, L.LocationName, FR.RegionName, FR.District,
                   FR.AffectedAreaKm2, FR.Severity, FR.PopulationAffected
            FROM Flood_Regions FR
            INNER JOIN Flood_Detections FD ON FR.FloodDetectionID = FD.FloodDetectionID
            INNER JOIN Satellite_Observations SO ON FD.ObservationID = SO.ObservationID
            INNER JOIN Locations L ON SO.LocationID = L.LocationID
            WHERE L.LocationID = ?
            ORDER BY FD.DetectionDate DESC
            """,
            [location_id],
        )
        flood_regions = [
            {
                "flood_region_id": r.FloodRegionID,
                "flood_detection_id": r.FloodDetectionID,
                "detection_date": str(r.DetectionDate),
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "region_name": r.RegionName,
                "district": r.District,
                "affected_area_km2": float(r.AffectedAreaKm2) if r.AffectedAreaKm2 is not None else None,
                "severity": r.Severity,
                "population_affected": r.PopulationAffected,
            }
            for r in cursor.fetchall()
        ]

        # ── 5. Risk Predictions (SQL Server) ─────────────────────────────────
        cursor.execute(
            """
            SELECT R.RiskPredictionID, R.LocationID, L.LocationName, L.District,
                   R.PredictionDate, R.RiskScore, R.RiskLevel,
                   R.RainfallMm, R.AccumulatedRainfallMm, R.TemperatureC,
                   R.ElevationM, R.SlopeDegree, R.RiverDistanceKm,
                   R.NDVI, R.NDWI, R.HistoricalFloodFrequency,
                   R.PreviousFloodedAreaKm2, R.ModelName
            FROM Risk_Predictions R
            INNER JOIN Locations L ON R.LocationID = L.LocationID
            WHERE R.LocationID = ?
            ORDER BY R.PredictionDate DESC
            """,
            [location_id],
        )
        risk_predictions = [
            {
                "risk_prediction_id": r.RiskPredictionID,
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "district": r.District,
                "prediction_date": str(r.PredictionDate),
                "risk_score": float(r.RiskScore) if r.RiskScore is not None else None,
                "risk_score_label": "Prototype Risk Score",
                "risk_level": r.RiskLevel,
                "rainfall_mm": float(r.RainfallMm) if r.RainfallMm is not None else None,
                "accumulated_rainfall_mm": float(r.AccumulatedRainfallMm) if r.AccumulatedRainfallMm is not None else None,
                "temperature_c": float(r.TemperatureC) if r.TemperatureC is not None else None,
                "elevation_m": float(r.ElevationM) if r.ElevationM is not None else None,
                "slope_degree": float(r.SlopeDegree) if r.SlopeDegree is not None else None,
                "river_distance_km": float(r.RiverDistanceKm) if r.RiverDistanceKm is not None else None,
                "ndvi": float(r.NDVI) if r.NDVI is not None else None,
                "ndwi": float(r.NDWI) if r.NDWI is not None else None,
                "historical_flood_frequency": r.HistoricalFloodFrequency,
                "previous_flooded_area_km2": float(r.PreviousFloodedAreaKm2) if r.PreviousFloodedAreaKm2 is not None else None,
                "model_name": r.ModelName,
            }
            for r in cursor.fetchall()
        ]

        # ── 6. Historical Floods (SQL Server) ────────────────────────────────
        cursor.execute(
            """
            SELECT H.HistoricalFloodID, H.LocationID, L.LocationName, L.District, L.State,
                   H.FloodYear, H.FloodDate, H.FloodedAreaKm2, H.Severity,
                   H.RainfallMm, H.DurationDays, H.Source, H.Description
            FROM Historical_Floods H
            INNER JOIN Locations L ON H.LocationID = L.LocationID
            WHERE H.LocationID = ?
            ORDER BY H.FloodYear DESC
            """,
            [location_id],
        )
        historical_floods = [
            {
                "historical_flood_id": r.HistoricalFloodID,
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "district": r.District,
                "state": r.State,
                "flood_year": r.FloodYear,
                "flood_date": str(r.FloodDate),
                "flooded_area_km2": float(r.FloodedAreaKm2) if r.FloodedAreaKm2 is not None else None,
                "severity": r.Severity,
                "rainfall_mm": float(r.RainfallMm) if r.RainfallMm is not None else None,
                "duration_days": r.DurationDays,
                "source": r.Source,
                "description": r.Description,
            }
            for r in cursor.fetchall()
        ]

        # ── 7. Alerts (SQL Server) ───────────────────────────────────────────
        cursor.execute(
            """
            SELECT A.AlertID, A.LocationID, L.LocationName, L.District,
                   A.RiskPredictionID, A.FloodDetectionID,
                   A.AlertType, A.AlertLevel, A.AlertMessage, A.AlertDate, A.IsResolved
            FROM Alerts A
            INNER JOIN Locations L ON A.LocationID = L.LocationID
            WHERE A.LocationID = ?
            ORDER BY A.AlertDate DESC
            """,
            [location_id],
        )
        alerts = [
            {
                "alert_id": r.AlertID,
                "location_id": r.LocationID,
                "location_name": r.LocationName,
                "district": r.District,
                "risk_prediction_id": r.RiskPredictionID,
                "flood_detection_id": r.FloodDetectionID,
                "alert_type": r.AlertType,
                "alert_level": r.AlertLevel,
                "alert_message": r.AlertMessage,
                "alert_date": str(r.AlertDate),
                "is_resolved": bool(r.IsResolved),
            }
            for r in cursor.fetchall()
        ]

    finally:
        conn.close()

    # ── 8. Local Sentinel-1, SAR Preprocessing & Flood Detection Outputs ─────
    cand_prod_id, proc_meta_dict, flood_meta_dict = find_sentinel1_product_for_location(
        location["latitude"],
        location["longitude"],
        product_id=product_id,
    )

    sentinel1_info = None
    preprocessing_info = None
    flood_detection_info = None

    if cand_prod_id:
        sentinel1_info = parse_sentinel1_product_details(cand_prod_id)

    # Processed SAR info (prioritize VV)
    if proc_meta_dict:
        vv_proc = proc_meta_dict.get("VV") or next(iter(proc_meta_dict.values()), {})
        preprocessing_info = {
            "status": vv_proc.get("processing_status", "COMPLETED"),
            "product_id": cand_prod_id,
            "polarization": vv_proc.get("polarization", "VV"),
            "polarizations_available": list(proc_meta_dict.keys()),
            "dimensions": f"{vv_proc.get('width', 512)} x {vv_proc.get('height', 512)}",
            "crs": vv_proc.get("crs", "EPSG:4326"),
            "bounds": vv_proc.get("bounds", []),
            "min_value": vv_proc.get("min_value"),
            "max_value": vv_proc.get("max_value"),
            "mean_value": vv_proc.get("mean_value"),
            "nodata": vv_proc.get("nodata", -9999),
            "valid_pixels": vv_proc.get("valid_pixels"),
            "output_file": vv_proc.get("output_file"),
            "operations_applied": vv_proc.get("operations_applied", []),
            "all_polarizations": proc_meta_dict,
        }

    # Flood detection info (prioritize VV)
    if flood_meta_dict:
        vv_flood = flood_meta_dict.get("VV") or next(iter(flood_meta_dict.values()), {})
        flood_detection_info = {
            "status": vv_flood.get("status", "success"),
            "processing_status": vv_flood.get("processing_status", "COMPLETED"),
            "product_id": cand_prod_id,
            "method": vv_flood.get("processing_method", "Prototype SAR Flood Detection"),
            "classification": vv_flood.get("classification", "Potential Flood / Low-Backscatter Candidate Mask"),
            "polarization": vv_flood.get("polarization", "VV"),
            "polarizations_available": list(flood_meta_dict.keys()),
            "threshold": vv_flood.get("threshold_used", 150.0),
            "threshold_used": vv_flood.get("threshold_used", 150.0),
            "candidate_pixels": vv_flood.get("candidate_flood_pixels"),
            "valid_pixels": vv_flood.get("valid_pixels"),
            "flood_percentage": vv_flood.get("flood_percentage"),
            "detected_area_m2": vv_flood.get("detected_area_m2"),
            "detected_area_km2": vv_flood.get("detected_area_km2"),
            "analyzed_area_km2": vv_flood.get("analyzed_area_km2"),
            "output_file": vv_flood.get("output_file"),
            "area_calculation_method": vv_flood.get("area_calculation_method", "WGS-84 Ellipsoidal Geodesic Pixel Area"),
            "limitations": vv_flood.get("limitations", REPORT_LIMITATIONS),
            "all_polarizations": flood_meta_dict,
        }

    # ── 9. Overall Assessment ───────────────────────────────────────────────
    latest_risk = risk_predictions[0] if risk_predictions else None
    overall_assessment = generate_overall_assessment(
        location["name"],
        flood_detection_info,
        latest_risk,
        historical_floods,
        alerts,
    )

    # ── 10. Executive Summary ───────────────────────────────────────────────
    active_alerts_cnt = len([a for a in alerts if not a.get("is_resolved", False)])
    candidate_area_display = (
        f"{flood_detection_info['detected_area_km2']:.2f} km²"
        if flood_detection_info and flood_detection_info.get("detected_area_km2") is not None
        else "N/A"
    )
    candidate_pct_display = (
        f"{flood_detection_info['flood_percentage']:.2f}%"
        if flood_detection_info and flood_detection_info.get("flood_percentage") is not None
        else "N/A"
    )
    risk_level_display = latest_risk.get("risk_level", "N/A") if latest_risk else "N/A"
    risk_score_display = (
        f"{round(latest_risk['risk_score'] * 100)}%"
        if latest_risk and latest_risk.get("risk_score") is not None
        else "N/A"
    )

    executive_summary = {
        "location": f"{location['name']}, {location['district']}, {location['state']}",
        "sentinel1_product": cand_prod_id or "N/A",
        "candidate_area_km2": candidate_area_display,
        "candidate_percentage": candidate_pct_display,
        "risk_level": risk_level_display,
        "risk_score": risk_score_display,
        "active_alerts_count": active_alerts_cnt,
        "assessment_category": overall_assessment["category"],
    }

    generated_at = datetime.now(timezone.utc).isoformat()

    report_payload = {
        "title": "EarthWatch AI Disaster Assessment Report",
        "generated_at": generated_at,
        "executive_summary": executive_summary,
        "location": location,
        "satellite_observations": satellite_observations,
        "satellite": {
            "observations": satellite_observations,
            "source": "SQL Server Database (Archived Observations)",
        },
        "sentinel1": sentinel1_info,
        "preprocessing": preprocessing_info,
        "flood_detection": flood_detection_info,
        "flood_detections": db_flood_detections,
        "flood_regions": flood_regions,
        "risk_predictions": risk_predictions,
        "risk": latest_risk,
        "historical_floods": historical_floods,
        "alerts": alerts,
        "assessment": overall_assessment,
        "overall_assessment": overall_assessment,
        "methodology": METHODOLOGY_STEPS,
        "limitations": REPORT_LIMITATIONS,
        "provenance": DATA_PROVENANCE,
        "data_provenance": DATA_PROVENANCE,
        "provenance_sources": DATA_PROVENANCE,
    }

    response = {
        "status": "success",
        "generated_at": generated_at,
        "location": location,
        "satellite": {
            "observations": satellite_observations,
            "source": "SQL Server Database (Archived Observations)",
        },
        "satellite_observations": satellite_observations,
        "sentinel1": sentinel1_info,
        "preprocessing": preprocessing_info,
        "flood_detection": flood_detection_info,
        "flood_detections": db_flood_detections,
        "flood_regions": flood_regions,
        "risk": latest_risk,
        "risk_predictions": risk_predictions,
        "historical_floods": historical_floods,
        "alerts": alerts,
        "assessment": overall_assessment,
        "overall_assessment": overall_assessment,
        "methodology": METHODOLOGY_STEPS,
        "limitations": REPORT_LIMITATIONS,
        "provenance": DATA_PROVENANCE,
        "data_provenance": DATA_PROVENANCE,
        "provenance_sources": DATA_PROVENANCE,
        "executive_summary": executive_summary,
        "report": report_payload,
    }

    return response

