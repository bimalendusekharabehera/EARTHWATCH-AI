from fastapi import APIRouter
from app.config.database import get_connection

router = APIRouter()


@router.get("/database/flood-regions")
def get_flood_regions():
    connection = get_connection()

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                FR.FloodRegionID,
                FR.FloodDetectionID,
                FD.DetectionDate,
                L.LocationID,
                L.LocationName,
                FR.RegionName,
                FR.District,
                FR.AffectedAreaKm2,
                FR.Severity,
                FR.PopulationAffected
            FROM Flood_Regions FR

            INNER JOIN Flood_Detections FD
                ON FR.FloodDetectionID = FD.FloodDetectionID

            INNER JOIN Satellite_Observations SO
                ON FD.ObservationID = SO.ObservationID

            INNER JOIN Locations L
                ON SO.LocationID = L.LocationID

            ORDER BY FD.DetectionDate DESC
        """)

        rows = cursor.fetchall()

        regions = []

        for row in rows:
            regions.append({
                "flood_region_id": row.FloodRegionID,
                "flood_detection_id": row.FloodDetectionID,
                "detection_date": str(row.DetectionDate),
                "location_id": row.LocationID,
                "location_name": row.LocationName,
                "region_name": row.RegionName,
                "district": row.District,
                "affected_area_km2": (
                    float(row.AffectedAreaKm2)
                    if row.AffectedAreaKm2 is not None
                    else None
                ),
                "severity": row.Severity,
                "population_affected": row.PopulationAffected
            })

        return {
            "status": "success",
            "count": len(regions),
            "regions": regions
        }

    finally:
        connection.close()