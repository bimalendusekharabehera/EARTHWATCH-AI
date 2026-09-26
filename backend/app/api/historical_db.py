from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/historical-floods")
def get_historical_floods():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                H.HistoricalFloodID,
                H.LocationID,
                L.LocationName,
                L.District,
                L.State,
                H.FloodYear,
                H.FloodDate,
                H.FloodedAreaKm2,
                H.Severity,
                H.RainfallMm,
                H.DurationDays,
                H.Source,
                H.Description
            FROM Historical_Floods H

            INNER JOIN Locations L
                ON H.LocationID = L.LocationID

            ORDER BY H.FloodYear DESC
        """)

        rows = cursor.fetchall()

        historical_floods = []

        for row in rows:
            historical_floods.append({
                "historical_flood_id": row.HistoricalFloodID,
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "state": row.State,
                "flood_year": row.FloodYear,
                "flood_date": str(row.FloodDate),
                "flooded_area_km2": (
                    float(row.FloodedAreaKm2)
                    if row.FloodedAreaKm2 is not None
                    else None
                ),
                "severity": row.Severity,
                "rainfall_mm": (
                    float(row.RainfallMm)
                    if row.RainfallMm is not None
                    else None
                ),
                "duration_days": row.DurationDays,
                "source": row.Source,
                "description": row.Description
            })

        return {
            "status": "success",
            "count": len(historical_floods),
            "historical_floods": historical_floods
        }

    finally:
        connection.close()