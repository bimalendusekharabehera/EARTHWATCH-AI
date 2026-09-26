from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/locations")
def get_locations():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                LocationID,
                LocationName,
                District,
                State,
                Latitude,
                Longitude
            FROM Locations
            ORDER BY LocationID
        """)

        rows = cursor.fetchall()

        locations = []

        for row in rows:
            locations.append({
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "state": row.State,
                "latitude": float(row.Latitude),
                "longitude": float(row.Longitude)
            })

        return {
            "status": "success",
            "count": len(locations),
            "locations": locations
        }

    finally:
        connection.close()