def calculate_flooded_area(
    flooded_pixels: int,
    pixel_area_m2: float
) -> float:
    """
    Calculate flooded area from a binary flood mask.

    flooded_pixels:
        Number of pixels classified as flooded.

    pixel_area_m2:
        Ground area represented by one pixel in square meters.

    Returns:
        Flooded area in square kilometers.
    """

    area_m2 = flooded_pixels * pixel_area_m2

    area_km2 = area_m2 / 1_000_000

    return round(area_km2, 2)