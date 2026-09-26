import numpy as np


def create_demo_flood_mask(
    height: int = 100,
    width: int = 100
) -> np.ndarray:
    """
    Create a simple demo binary flood mask.

    1 = flooded pixel
    0 = non-flooded pixel

    This is DEMO data only.
    It is not a real satellite inference.
    """

    mask = np.zeros((height, width), dtype=np.uint8)

    # Demo flooded region
    mask[30:70, 30:70] = 1

    return mask


def count_flooded_pixels(mask: np.ndarray) -> int:
    """
    Count pixels classified as flooded.
    """

    return int(np.sum(mask == 1))