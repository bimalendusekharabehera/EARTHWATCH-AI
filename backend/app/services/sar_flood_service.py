import os
import numpy as np
import rasterio


# =========================================================
# SENTINEL-1 SAR FLOOD DETECTION
# =========================================================

def detect_flood_from_sar(
    raster_path: str,
    threshold_db: float = -17.0
):
    """
    Detect potential flooded pixels from a Sentinel-1
    SAR backscatter GeoTIFF.

    Lower SAR backscatter can indicate smooth water surfaces.

    Parameters
    ----------
    raster_path : str
        Path to Sentinel-1 SAR GeoTIFF.

    threshold_db : float
        Backscatter threshold in dB.
        Pixels below this value are classified as potential water/flood.

    Returns
    -------
    dict
        Flood detection result and flooded area.
    """

    if not os.path.exists(raster_path):
        raise FileNotFoundError(
            f"Raster file not found: {raster_path}"
        )

    with rasterio.open(raster_path) as src:

        # Read first band
        band = src.read(1).astype("float32")

        # Raster metadata
        transform = src.transform
        width = src.width
        height = src.height
        crs = src.crs

        # NoData handling
        nodata = src.nodata

        if nodata is not None:
            valid_mask = band != nodata
        else:
            valid_mask = np.isfinite(band)

        # Remove invalid values
        valid_mask &= np.isfinite(band)

        valid_pixels = band[valid_mask]

        if valid_pixels.size == 0:
            return {
                "status": "NO_VALID_DATA",
                "flooded_area_km2": 0.0,
                "flood_pixels": 0,
                "total_valid_pixels": 0,
                "threshold_db": threshold_db,
                "message": "No valid SAR pixels were found."
            }

        # -------------------------------------------------
        # FLOOD CLASSIFICATION
        # -------------------------------------------------

        flood_mask = (
            (band < threshold_db)
            & valid_mask
        )

        flood_pixels = int(
            np.count_nonzero(flood_mask)
        )

        total_valid_pixels = int(
            np.count_nonzero(valid_mask)
        )

        # -------------------------------------------------
        # PIXEL AREA
        # -------------------------------------------------

        pixel_width = abs(transform.a)
        pixel_height = abs(transform.e)

        pixel_area_m2 = (
            pixel_width * pixel_height
        )

        flooded_area_m2 = (
            flood_pixels * pixel_area_m2
        )

        flooded_area_km2 = (
            flooded_area_m2 / 1_000_000
        )

        # -------------------------------------------------
        # FLOOD PERCENTAGE
        # -------------------------------------------------

        flood_percentage = (
            (flood_pixels / total_valid_pixels) * 100
            if total_valid_pixels > 0
            else 0
        )

        # -------------------------------------------------
        # STATUS
        # -------------------------------------------------

        if flood_pixels == 0:
            status = "NO_FLOOD_DETECTED"

        elif flood_percentage < 5:
            status = "LOW_FLOOD_EXTENT"

        elif flood_percentage < 20:
            status = "MODERATE_FLOOD_EXTENT"

        else:
            status = "HIGH_FLOOD_EXTENT"

        return {
            "status": status,
            "flooded_area_km2": round(
                flooded_area_km2,
                4
            ),
            "flood_pixels": flood_pixels,
            "total_valid_pixels": total_valid_pixels,
            "flood_percentage": round(
                flood_percentage,
                2
            ),
            "threshold_db": threshold_db,
            "pixel_area_m2": round(
                pixel_area_m2,
                4
            ),
            "raster": {
                "width": width,
                "height": height,
                "crs": str(crs) if crs else None
            },
            "message": (
                "Sentinel-1 SAR threshold-based "
                "flood detection completed."
            )
        }