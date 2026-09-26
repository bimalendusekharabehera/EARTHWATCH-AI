from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/alerts")
def get_alerts():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                A.AlertID,
                A.LocationID,
                L.LocationName,
                L.District,
                A.RiskPredictionID,
                A.FloodDetectionID,
                A.AlertType,
                A.AlertLevel,
                A.AlertMessage,
                A.AlertDate,
                A.IsResolved
            FROM Alerts A

            INNER JOIN Locations L
                ON A.LocationID = L.LocationID

            ORDER BY A.AlertDate DESC
        """)

        rows = cursor.fetchall()

        alerts = []

        for row in rows:
            alerts.append({
                "alert_id": row.AlertID,
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "risk_prediction_id": row.RiskPredictionID,
                "flood_detection_id": row.FloodDetectionID,
                "alert_type": row.AlertType,
                "alert_level": row.AlertLevel,
                "alert_message": row.AlertMessage,
                "alert_date": str(row.AlertDate),
                "is_resolved": bool(row.IsResolved)
            })

        return {
            "status": "success",
            "count": len(alerts),
            "alerts": alerts
        }

    finally:
        connection.close()