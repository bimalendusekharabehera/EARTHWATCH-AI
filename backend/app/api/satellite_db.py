from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/satellite-observations")
def get_satellite_observations():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                S.ObservationID,
                S.LocationID,
                L.LocationName,
                L.District,
                S.Satellite,
                S.Sensor,
                S.AcquisitionDate,
                S.ProductID,
                S.ImageURL,
                S.CloudCover,
                S.DataSource
            FROM Satellite_Observations S
            INNER JOIN Locations L
                ON S.LocationID = L.LocationID
            ORDER BY S.AcquisitionDate DESC
        """)

        rows = cursor.fetchall()

        observations = []

        for row in rows:
            observations.append({
                "observation_id": row.ObservationID,
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "district": row.District,
                "satellite": row.Satellite,
                "sensor": row.Sensor,
                "acquisition_date": str(row.AcquisitionDate),
                "product_id": row.ProductID,
                "image_url": row.ImageURL,
                "cloud_cover": (
                    float(row.CloudCover)
                    if row.CloudCover is not None
                    else None
                ),
                "data_source": row.DataSource
            })

        return {
            "status": "success",
            "count": len(observations),
            "observations": observations
        }

    finally:
        connection.close()