from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from app.config.database import get_connection

router = APIRouter()


@router.get("/reports/summary")
def get_report_summary(location_id: int):
    """
    Generates a location-specific disaster assessment report from the SQL Server database.
    Requires a valid location_id. Returns HTTP 404 if the location does not exist.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # ── 1. Resolve location ──────────────────────────────────────────────
        cursor.execute(
            "SELECT LocationID, LocationName, District, State, Latitude, Longitude "
            "FROM Locations WHERE LocationID = ?",
            [location_id]
        )
        loc_row = cursor.fetchone()
        if not loc_row:
            raise HTTPException(
                status_code=404,
                detail=f"Location with location_id={location_id} not found in database."
            )

        location = {
            "location_id": loc_row.LocationID,
            "name": loc_row.LocationName,
            "district": loc_row.District,
            "state": loc_row.State,
            "latitude": float(loc_row.Latitude),
            "longitude": float(loc_row.Longitude),
        }

        # ── 2. Satellite Observations ────────────────────────────────────────
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
            [location_id]
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
            }
            for r in cursor.fetchall()
        ]

        # ── 3. Flood Detections ──────────────────────────────────────────────
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
            [location_id]
        )
        flood_detections = [
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

        # ── 4. Flood Regions ─────────────────────────────────────────────────
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
            [location_id]
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

        # ── 5. Risk Predictions ──────────────────────────────────────────────
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
            [location_id]
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

        # ── 6. Historical Floods ─────────────────────────────────────────────
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
            [location_id]
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

        # ── 7. Alerts ────────────────────────────────────────────────────────
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
            [location_id]
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

        # ── Build response ───────────────────────────────────────────────────
        generated_at = datetime.now(timezone.utc).isoformat()

        return {
            "status": "success",
            "report": {
                "title": "EarthWatch AI Disaster Assessment Report",
                "generated_at": generated_at,
                "location": location,
                "satellite_observations": satellite_observations,
                "flood_detections": flood_detections,
                "flood_regions": flood_regions,
                "risk_predictions": risk_predictions,
                "historical_floods": historical_floods,
                "alerts": alerts,
                "data_provenance": {
                    "database": "SQL Server / EarthWatchAI",
                    "satellite": "Copernicus STAC",
                    "risk_model": "Prototype"
                },
            }
        }

    finally:
        conn.close()
