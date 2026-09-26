from app.geospatial.area import calculate_flooded_area
from app.geospatial.raster import (
    create_demo_flood_mask,
    count_flooded_pixels
)
from app.geospatial.boundaries import get_demo_boundaries


def get_flood_detection():

    # Create demo flood mask
    flood_mask = create_demo_flood_mask(
        height=100,
        width=100
    )

    # Count flooded pixels
    flooded_pixels = count_flooded_pixels(flood_mask)

    # Demo ground area represented by one pixel
    pixel_area_m2 = 1000

    # Calculate flooded area
    flooded_area = calculate_flooded_area(
        flooded_pixels,
        pixel_area_m2
    )

    # Get demo administrative boundaries
    boundaries = get_demo_boundaries()

    return {
        "mode": "DEMO",
        "status": "flood_detected",
        "confidence": 0.87,
        "flooded_area_km2": flooded_area,

        "affected_regions": [
            "Bhubaneswar",
            "Khordha"
        ],

        "source": "Demo Flood Detection Dataset",

        "message": (
            "Demo flood detection result. "
            "Not a real satellite inference."
        ),

        "boundaries": boundaries
    }