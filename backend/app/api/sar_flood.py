import os
import tempfile

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.sar_flood_service import detect_flood_from_sar
from app.api.deps import get_current_user


router = APIRouter()


# =========================================================
# SENTINEL-1 SAR FLOOD DETECTION API
# =========================================================

@router.post("/flood/sar")
async def sar_flood_detection(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a Sentinel-1 SAR GeoTIFF and perform
    threshold-based flood detection.
    """

    # -----------------------------------------------------
    # Validate file type
    # -----------------------------------------------------

    filename = file.filename or ""

    allowed_extensions = (
        ".tif",
        ".tiff",
        ".geotiff"
    )

    if not filename.lower().endswith(allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please upload a GeoTIFF raster file "
                "(.tif, .tiff, .geotiff)."
            )
        )

    temporary_path = None

    try:

        # -------------------------------------------------
        # Save uploaded raster temporarily
        # -------------------------------------------------

        suffix = os.path.splitext(filename)[1]

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:

            temporary_path = temp_file.name

            content = await file.read()

            temp_file.write(content)

        # -------------------------------------------------
        # Run SAR flood detection
        # -------------------------------------------------

        result = detect_flood_from_sar(
            raster_path=temporary_path,
            threshold_db=-17.0
        )

        # -------------------------------------------------
        # Add source information
        # -------------------------------------------------

        result["source"] = "Sentinel-1 SAR GeoTIFF"

        result["filename"] = filename

        return result

    except FileNotFoundError as error:

        raise HTTPException(
            status_code=404,
            detail=str(error)
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "SAR flood processing failed: "
                f"{str(error)}"
            )
        )

    finally:

        # -------------------------------------------------
        # Remove temporary raster
        # -------------------------------------------------

        if (
            temporary_path
            and os.path.exists(temporary_path)
        ):
            os.remove(temporary_path)