from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/flood-detections")
def get_flood_detections():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                F.FloodDetectionID,
                F.ObservationID,
                L.LocationID,
                L.LocationName,
                L.District,
                S.Satellite,
                S.Sensor,
                S.AcquisitionDate,
                F.DetectionDate,
                F.Status,
                F.FloodedAreaKm2,
                F.FloodPercentage,
                F.Confidence,
                F.DetectionMethod,
                F.Source
            FROM Flood_Detections F
            INNER JOIN Satellite_Observations S
                ON F.ObservationID = S.ObservationID
            INNER JOIN Locations L
                ON S.LocationID = L.LocationID
            ORDER BY F.DetectionDate DESC
        """)

        rows = cursor.fetchall()

        detections = []

        for row in rows:
            detections.append({
                "flood_detection_id": row.FloodDetectionID,
                "observation_id": row.ObservationID,
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "satellite": row.Satellite,
                "sensor": row.Sensor,
                "acquisition_date": str(row.AcquisitionDate),
                "detection_date": str(row.DetectionDate),
                "status": row.Status,
                "flooded_area_km2": (
                    float(row.FloodedAreaKm2)
                    if row.FloodedAreaKm2 is not None
                    else None
                ),
                "flood_percentage": (
                    float(row.FloodPercentage)
                    if row.FloodPercentage is not None
                    else None
                ),
                "confidence": (
                    float(row.Confidence)
                    if row.Confidence is not None
                    else None
                ),
                "detection_method": row.DetectionMethod,
                "source": row.Source
            })

        return {
            "status": "success",
            "count": len(detections),
            "detections": detections
        }

    finally:
        connection.close()