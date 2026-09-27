"""
sentinel1_download_service.py
==============================
Controlled Single Sentinel-1 Product Download Service

PURPOSE
-------
Acquire exactly ONE user-selected Sentinel-1 SAR product from Copernicus
Data Space (CDSE), download it to local storage, and return download status.

ARCHITECTURE & CONSTRAINTS
--------------------------
- Downloads happen ONLY after an explicit user request.
- Downloads exactly ONE product at a time — no automatic or bulk downloads.
- Validates that the requested product exists in Copernicus STAC, belongs to
  Sentinel-1, and intersects the selected location's geographic boundary.
- Reuses existing cdse_auth_service.py for authentication (no duplicate auth logic).
- Credentials and access tokens are NEVER logged, exposed, or returned.
- Stores downloaded products in: backend/data/sentinel1/<product_id>/
- If the product was already downloaded, it returns ALREADY_EXISTS immediately
  to prevent duplicate high-volume downloads.
- Does NOT perform any SAR preprocessing, calibration, filtering, or flood detection.
- Does NOT modify any SQL Server database tables.
- Completely isolated from sentinel1_service.py (discovery service remains unchanged).
"""

import logging
import os
import re
from typing import Any

import requests

from app.services.cdse_auth_service import get_cdse_access_token

logger = logging.getLogger(__name__)

# Copernicus Data Space STAC Item endpoint template
STAC_ITEM_URL = "https://stac.dataspace.copernicus.eu/v1/collections/sentinel-1-grd/items/{product_id}"

# Base local storage directory for Sentinel-1 products
_DATA_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "sentinel1")
)

# Allowed Sentinel-1 platform prefixes
_S1_PREFIXES = ("S1A_", "S1B_", "S1C_", "S1D_")


# ──────────────────────────────────────────────────────────────
# STORAGE DIRECTORY MANAGEMENT
# ──────────────────────────────────────────────────────────────

def get_product_storage_dir(product_id: str) -> str:
    """
    Return the safe local storage directory for a specific product.
    Ensures directory traversal attacks are prevented.
    """
    safe_product_id = re.sub(r"[^A-Za-z0-9_\-\.]", "_", product_id)
    return os.path.join(_DATA_DIR, safe_product_id)


def is_product_downloaded(product_id: str) -> tuple[bool, str | None, int | None]:
    """
    Check if a Sentinel-1 product has already been downloaded to local storage.

    Returns
    -------
    (exists, relative_file_path, file_size_bytes)
        exists is True if a non-empty, non-temporary file is found.
    """
    prod_dir = get_product_storage_dir(product_id)
    if not os.path.isdir(prod_dir):
        return False, None, None

    try:
        entries = os.listdir(prod_dir)
    except OSError:
        return False, None, None

    # Filter out in-progress downloads (.part) and hidden files
    valid_files = [
        f for f in entries
        if not f.endswith(".part") and not f.startswith(".")
    ]

    for fname in valid_files:
        full_path = os.path.join(prod_dir, fname)
        if os.path.isfile(full_path):
            try:
                sz = os.path.getsize(full_path)
                if sz > 0:
                    rel_path = f"sentinel1/{os.path.basename(prod_dir)}/{fname}".replace("\\", "/")
                    return True, rel_path, sz
            except OSError:
                continue

    return False, None, None


# ──────────────────────────────────────────────────────────────
# PRODUCT VALIDATION
# ──────────────────────────────────────────────────────────────

def validate_sentinel1_product(
    product_id: str,
    latitude: float,
    longitude: float,
) -> tuple[bool, dict[str, Any] | None, str | None]:
    """
    Validate that:
    1. product_id adheres to Sentinel-1 naming and belongs to Sentinel-1.
    2. product_id is discoverable through Copernicus Data Space STAC.
    3. The product's spatial footprint covers the monitored location.
    4. A valid downloadable product reference exists in the STAC metadata.

    Parameters
    ----------
    product_id : str
        Sentinel-1 product identifier.
    latitude : float
        Monitored location latitude.
    longitude : float
        Monitored location longitude.

    Returns
    -------
    (is_valid, product_info, error_message)
    """
    clean_id = (product_id or "").strip()
    if not clean_id:
        return False, None, "Product ID cannot be empty."

    # Sentinel-1 identifier check
    if not clean_id.upper().startswith(_S1_PREFIXES) and "SENTINEL-1" not in clean_id.upper():
        return False, None, "Product does not belong to Sentinel-1."

    # Query Copernicus STAC item endpoint
    stac_url = STAC_ITEM_URL.format(product_id=clean_id)
    try:
        resp = requests.get(
            stac_url,
            timeout=20,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            logger.info("STAC item lookup failed with HTTP %s for %s", resp.status_code, clean_id)
            return False, None, "The selected Sentinel-1 product was not found in Copernicus Data Space."
        item_data = resp.json()
    except requests.Timeout:
        logger.warning("Copernicus STAC item query timed out for %s", clean_id)
        return False, None, "Timeout querying Copernicus Data Space STAC catalogue."
    except requests.RequestException as exc:
        logger.warning("Copernicus STAC request error: %s", type(exc).__name__)
        return False, None, "Network error communicating with Copernicus Data Space."

    # Check collection
    collection = item_data.get("collection", "").lower()
    if "sentinel-1" not in collection and "sentinel1" not in collection:
        return False, None, "STAC item collection does not belong to Sentinel-1."

    # Check spatial coverage / association with the selected location
    # Bounding box in STAC is [west, south, east, north]
    bbox = item_data.get("bbox")
    if bbox and len(bbox) >= 4:
        west, south, east, north = bbox[0], bbox[1], bbox[2], bbox[3]
        margin = 0.15  # degrees tolerance around bounding box
        in_lon = (west - margin) <= longitude <= (east + margin)
        in_lat = (south - margin) <= latitude <= (north + margin)
        if not (in_lon and in_lat):
            logger.info(
                "Product %s bbox [%s, %s, %s, %s] does not cover location (%s, %s)",
                clean_id, west, south, east, north, latitude, longitude
            )
            return False, None, "The selected Sentinel-1 product does not cover the requested location."

    # Locate downloadable product reference
    assets: dict = item_data.get("assets", {})
    download_url: str | None = None
    filename: str | None = None
    expected_size: int | None = None

    # Priority 1: Direct 'Product' asset (standard zipped SAFE package)
    product_asset = assets.get("Product") or assets.get("product")
    if isinstance(product_asset, dict) and product_asset.get("href"):
        download_url = product_asset.get("href")
        filename = product_asset.get("file:local_path")
        expected_size = product_asset.get("file:size")

    # Priority 2: Alternative HTTPS download link in band assets
    if not download_url:
        for key in ("vv", "vh", "Product", "data"):
            asset = assets.get(key)
            if isinstance(asset, dict):
                alt_https = asset.get("alternate", {}).get("https", {}).get("href")
                if alt_https:
                    download_url = alt_https
                    filename = asset.get("file:local_path")
                    expected_size = asset.get("file:size")
                    break

    if not download_url:
        return False, None, "No downloadable product asset found in Copernicus STAC metadata."

    if not filename:
        filename = f"{clean_id}.zip"
    filename = os.path.basename(filename)

    prod_info = {
        "product_id": clean_id,
        "download_url": download_url,
        "filename": filename,
        "expected_size_bytes": expected_size,
        "bbox": bbox,
        "stac_url": stac_url,
    }
    return True, prod_info, None


# ──────────────────────────────────────────────────────────────
# SINGLE-PRODUCT DOWNLOAD EXECUTION
# ──────────────────────────────────────────────────────────────

def execute_product_download(
    product_id: str,
    location_id: int,
    latitude: float,
    longitude: float,
    product_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Perform controlled single-product download:
    1. Check if already downloaded.
    2. Validate product if info is not supplied.
    3. Authenticate with Copernicus Data Space.
    4. Stream download to temporary local file.
    5. Finalize file and return structured status.

    Returns
    -------
    dict
        Conforming to one of:
        - "downloaded"
        - "already_downloaded"
        - "invalid_product"
        - "authentication_failed"
        - "download_failed"
    """
    # 1. Check if already downloaded
    already_exists, existing_path, existing_sz = is_product_downloaded(product_id)
    if already_exists:
        return {
            "status": "already_downloaded",
            "product_id": product_id,
            "download_status": "ALREADY_EXISTS",
        }

    # 2. Validate product
    if product_info is None:
        valid, product_info, err = validate_sentinel1_product(
            product_id=product_id,
            latitude=latitude,
            longitude=longitude,
        )
        if not valid or not product_info:
            return {
                "status": "invalid_product",
                "message": "The selected Sentinel-1 product is not valid for this location.",
            }

    download_url = product_info["download_url"]
    filename = product_info["filename"]

    # 3. Authenticate with Copernicus Data Space
    try:
        token = get_cdse_access_token()
    except ValueError as exc:
        logger.warning(
            "CDSE authentication aborted (missing credentials): %s",
            type(exc).__name__,
        )
        return {
            "status": "authentication_failed",
            "message": "Unable to authenticate with Copernicus Data Space.",
        }
    except RuntimeError as exc:
        logger.warning(
            "CDSE authentication aborted (rejected credentials): %s",
            type(exc).__name__,
        )
        return {
            "status": "authentication_failed",
            "message": "Unable to authenticate with Copernicus Data Space.",
        }
    except Exception as exc:
        logger.warning(
            "CDSE authentication error: %s",
            type(exc).__name__,
        )
        return {
            "status": "authentication_failed",
            "message": "Unable to authenticate with Copernicus Data Space.",
        }

    # 4. Prepare local filesystem storage
    prod_dir = get_product_storage_dir(product_id)
    os.makedirs(prod_dir, exist_ok=True)

    target_file = os.path.join(prod_dir, filename)
    temp_file = target_file + ".part"

    # Clean up any abandoned partial download from an earlier attempt
    if os.path.exists(temp_file):
        try:
            os.remove(temp_file)
        except OSError:
            pass

    # 5. Stream download
    session = requests.Session()
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "EarthWatchAI/1.0",
    }

    try:
        # Stream download following redirects (e.g. CDSE OData -> zipper -> S3 presigned)
        current_url = download_url
        current_headers = dict(headers)
        resp = None

        for _ in range(5):
            resp = session.get(
                current_url,
                headers=current_headers,
                stream=True,
                timeout=30,
                allow_redirects=False,
            )
            if resp.status_code in (301, 302, 303, 307, 308):
                redirect_url = resp.headers.get("Location")
                if not redirect_url:
                    logger.warning("CDSE download returned redirect without Location header")
                    return {
                        "status": "download_failed",
                        "message": "Unable to download the selected Sentinel-1 product.",
                    }
                current_url = redirect_url
                # If redirected to AWS S3 presigned URL or query-authenticated URL,
                # the Authorization header MUST be stripped because AWS forbids both query auth and Bearer auth.
                is_s3_presigned = (
                    "AWSAccessKeyId" in redirect_url
                    or "X-Amz-" in redirect_url
                    or "s3." in redirect_url
                    or "Signature=" in redirect_url
                    or "cloudferro.com" in redirect_url
                    or "eodata" in redirect_url
                )
                if is_s3_presigned:
                    current_headers = {"User-Agent": "EarthWatchAI/1.0"}
                continue
            break

        if resp is None or resp.status_code != 200:
            logger.warning(
                "CDSE product download failed with HTTP status %s (no credentials logged)",
                resp.status_code if resp is not None else "None",
            )
            return {
                "status": "download_failed",
                "message": "Unable to download the selected Sentinel-1 product.",
            }

        # Stream chunks safely to .part file
        chunk_size = 1024 * 1024  # 1 MB chunk
        with open(temp_file, "wb") as f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)

        # Download complete — atomize file by renaming .part to target_file
        os.replace(temp_file, target_file)
        file_size_bytes = os.path.getsize(target_file)
        rel_path = f"sentinel1/{os.path.basename(prod_dir)}/{filename}".replace("\\", "/")

        logger.info(
            "Sentinel-1 product %s downloaded successfully (%d bytes) to %s",
            product_id, file_size_bytes, rel_path,
        )

        return {
            "status": "downloaded",
            "product_id": product_id,
            "location_id": location_id,
            "file_path": rel_path,
            "file_size_bytes": file_size_bytes,
            "download_status": "COMPLETED",
        }

    except requests.Timeout:
        logger.warning("Sentinel-1 product download timed out for %s", product_id)
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        return {
            "status": "download_failed",
            "message": "Sentinel-1 product download timed out or was interrupted.",
        }

    except requests.RequestException:
        logger.warning(
            "Sentinel-1 download network error for %s (no credentials logged)",
            product_id,
        )
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        return {
            "status": "download_failed",
            "message": "Unable to download the selected Sentinel-1 product.",
        }

    except Exception as exc:
        logger.warning(
            "Sentinel-1 product download unexpected error for %s: %s",
            product_id, type(exc).__name__,
        )
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass
        return {
            "status": "download_failed",
            "message": "Unable to download the selected Sentinel-1 product.",
        }
