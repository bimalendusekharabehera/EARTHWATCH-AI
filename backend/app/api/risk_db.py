from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/risk-predictions")
def get_risk_predictions():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                R.RiskPredictionID,
                R.LocationID,
                L.LocationName,
                L.District,
                R.PredictionDate,
                R.RiskScore,
                R.RiskLevel,
                R.RainfallMm,
                R.AccumulatedRainfallMm,
                R.TemperatureC,
                R.ElevationM,
                R.SlopeDegree,
                R.RiverDistanceKm,
                R.NDVI,
                R.NDWI,
                R.HistoricalFloodFrequency,
                R.PreviousFloodedAreaKm2,
                R.ModelName
            FROM Risk_Predictions R
            INNER JOIN Locations L
                ON R.LocationID = L.LocationID
            ORDER BY R.PredictionDate DESC
        """)

        rows = cursor.fetchall()

        predictions = []

        for row in rows:
            predictions.append({
                "risk_prediction_id": row.RiskPredictionID,
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "prediction_date": str(row.PredictionDate),
                "risk_score": (
                    float(row.RiskScore)
                    if row.RiskScore is not None
                    else None
                ),
                "risk_level": row.RiskLevel,
                "rainfall_mm": (
                    float(row.RainfallMm)
                    if row.RainfallMm is not None
                    else None
                ),
                "accumulated_rainfall_mm": (
                    float(row.AccumulatedRainfallMm)
                    if row.AccumulatedRainfallMm is not None
                    else None
                ),
                "temperature_c": (
                    float(row.TemperatureC)
                    if row.TemperatureC is not None
                    else None
                ),
                "elevation_m": (
                    float(row.ElevationM)
                    if row.ElevationM is not None
                    else None
                ),
                "slope_degree": (
                    float(row.SlopeDegree)
                    if row.SlopeDegree is not None
                    else None
                ),
                "river_distance_km": (
                    float(row.RiverDistanceKm)
                    if row.RiverDistanceKm is not None
                    else None
                ),
                "ndvi": (
                    float(row.NDVI)
                    if row.NDVI is not None
                    else None
                ),
                "ndwi": (
                    float(row.NDWI)
                    if row.NDWI is not None
                    else None
                ),
                "historical_flood_frequency": row.HistoricalFloodFrequency,
                "previous_flooded_area_km2": (
                    float(row.PreviousFloodedAreaKm2)
                    if row.PreviousFloodedAreaKm2 is not None
                    else None
                ),
                "model_name": row.ModelName
            })

        return {
            "status": "success",
            "count": len(predictions),
            "predictions": predictions
        }

    finally:
        connection.close()