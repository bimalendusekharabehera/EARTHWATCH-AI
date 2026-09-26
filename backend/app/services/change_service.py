import requests
from io import BytesIO

import numpy as np
from PIL import Image


def calculate_image_change(
    before_image_url: str | None,
    after_image_url: str | None
):
    """
    Calculate visual pixel change between two satellite images.

    This is a visual-change measurement only.
    It is NOT a flood-area measurement and does not claim
    that every changed pixel represents flooding.
    """

    if not before_image_url or not after_image_url:
        return {
            "status": "INSUFFICIENT_DATA",
            "change_percentage": None,
            "message": (
                "Both before and after satellite images "
                "are required for visual change analysis."
            )
        }

    try:
        before_response = requests.get(
            before_image_url,
            timeout=30
        )
        before_response.raise_for_status()

        after_response = requests.get(
            after_image_url,
            timeout=30
        )
        after_response.raise_for_status()

        before_image = Image.open(
            BytesIO(before_response.content)
        ).convert("RGB")

        after_image = Image.open(
            BytesIO(after_response.content)
        ).convert("RGB")

        # Resize after image to match before image.
        after_image = after_image.resize(
            before_image.size
        )

        before_array = np.asarray(
            before_image,
            dtype=np.float32
        )

        after_array = np.asarray(
            after_image,
            dtype=np.float32
        )

        # Calculate absolute pixel difference.
        difference = np.abs(
            before_array - after_array
        )

        # Average RGB difference.
        pixel_difference = difference.mean(
            axis=2
        )

        # Pixels with meaningful visual change.
        changed_pixels = (
            pixel_difference > 30
        )

        total_pixels = changed_pixels.size

        changed_count = int(
            changed_pixels.sum()
        )

        change_percentage = (
            changed_count / total_pixels
        ) * 100

        if change_percentage >= 40:
            status = "HIGH_CHANGE"

        elif change_percentage >= 20:
            status = "MODERATE_CHANGE"

        elif change_percentage >= 5:
            status = "LOW_CHANGE"

        else:
            status = "STABLE"

        return {
            "status": status,
            "change_percentage": round(
                change_percentage,
                2
            ),
            "changed_pixels": changed_count,
            "total_pixels": int(
                total_pixels
            ),
            "message": (
                "Visual pixel-change analysis completed. "
                "This result is not a flood segmentation result."
            )
        }

    except requests.RequestException as error:

        return {
            "status": "DOWNLOAD_ERROR",
            "change_percentage": None,
            "message": (
                "Could not download satellite images."
            ),
            "error": str(error)
        }

    except Exception as error:

        return {
            "status": "ANALYSIS_ERROR",
            "change_percentage": None,
            "message": (
                "Satellite image change analysis failed."
            ),
            "error": str(error)
        }