"""
sar_preprocessing_service.py
==============================
Sentinel-1 SAR Preprocessing Service — Foundation Layer

PURPOSE
-------
Process locally downloaded Sentinel-1 SAR products (GRD) for a requested
polarization (VV or VH). Extracts measurement rasters, masks invalid/NoData
pixels, preserves geospatial reference metadata (CRS, transform, bounds),
exports clean GeoTIFFs, and computes real descriptive statistics.

ARCHITECTURE & CONSTRAINTS
--------------------------
- Fully isolated from:
  - sentinel1_service.py (discovery)
  - sentinel1_download_service.py (acquisition)
  - flood_service.py & sar_flood_service.py (detection)
  - risk_service.py (risk prediction)
- Operates ONLY on locally downloaded Sentinel-1 products in backend/data/sentinel1/<product_id>/.
- Does NOT download any satellite data during preprocessing.
- Does NOT claim scientific calibration, terrain correction, or speckle filtering.
- Does NOT perform flood detection, thresholding, or water classification.
- Does NOT modify any SQL Server database tables.
- Original downloaded product remains completely untouched.
- Processed outputs are saved to: backend/data/sentinel1/processed/<product_id>/
- Duplicate processing returns ALREADY_EXISTS without reprocessing.
"""

import json
import logging
import os
import re
import zipfile
from typing import Any

import numpy as np
import rasterio

logger = logging.getLogger(__name__)

# Base local storage directory for Sentinel-1 raw products
_SENTINEL1_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "sentinel1")
)

# Output directory for processed Sentinel-1 SAR rasters
_PROCESSED_DIR = os.path.join(_SENTINEL1_DIR, "processed")

# Supported Sentinel-1 platform prefixes
_S1_PREFIXES = ("S1A_", "S1B_", "S1C_", "S1D_")

# Allowed polarizations
ALLOWED_POLARIZATIONS = ("VV", "VH")

# Output NoData marker for processed float32 rasters
PROCESSED_NODATA = -9999.0


# ──────────────────────────────────────────────────────────────
# STORAGE & PATH RESOLUTION HELPERS
# ──────────────────────────────────────────────────────────────

def _get_safe_product_id(product_id: str) -> str:
    """Sanitize product ID to prevent directory traversal."""
    return re.sub(r"[^A-Za-z0-9_\-\.]", "_", (product_id or "").strip())


def get_raw_product_dir(product_id: str) -> str:
    """Return local directory for downloaded product."""
    safe_id = _get_safe_product_id(product_id)
    return os.path.join(_SENTINEL1_DIR, safe_id)


def get_processed_product_dir(product_id: str) -> str:
    """Return output directory for processed rasters."""
    safe_id = _get_safe_product_id(product_id)
    return os.path.join(_PROCESSED_DIR, safe_id)


# ──────────────────────────────────────────────────────────────
# PRODUCT INSPECTION & DISCOVERY OF MEASUREMENTS
# ──────────────────────────────────────────────────────────────

def find_product_measurements(product_id: str) -> dict[str, Any]:
    """
    Inspect the local product directory and locate SAR measurement files
    for each polarization (VV, VH), supporting:
    1. Direct GeoTIFFs in the product folder.
    2. Unzipped .SAFE package directory with measurement/ folder.
    3. Zipped .SAFE.zip or .zip archive containing measurement/*.tiff.

    Returns
    -------
    dict with:
      - exists: bool
      - product_dir: str
      - zip_file: str | None
      - safe_dir: str | None
      - measurements: dict[str, dict] (pol -> {"source_type": "file"|"zip", "path": str, "zip_inner_path": str|None})
      - available_polarizations: list[str]
    """
    clean_id = _get_safe_product_id(product_id)
    prod_dir = get_raw_product_dir(clean_id)

    result: dict[str, Any] = {
        "exists": False,
        "product_dir": prod_dir,
        "zip_file": None,
        "safe_dir": None,
        "measurements": {},
        "available_polarizations": [],
    }

    if not os.path.isdir(prod_dir):
        return result

    # Check for direct files or archives in the product directory
    try:
        entries = os.listdir(prod_dir)
    except OSError:
        return result

    valid_entries = [e for e in entries if not e.endswith(".part") and not e.startswith(".")]
    if not valid_entries:
        return result

    result["exists"] = True

    # 1. Search inside ZIP archives (*.zip)
    for entry in valid_entries:
        full_path = os.path.join(prod_dir, entry)
        if os.path.isfile(full_path) and entry.lower().endswith(".zip"):
            result["zip_file"] = full_path
            try:
                with zipfile.ZipFile(full_path, "r") as zf:
                    for name in zf.namelist():
                        lower = name.lower()
                        if "measurement" in lower and (lower.endswith(".tiff") or lower.endswith(".tif")):
                            for pol in ALLOWED_POLARIZATIONS:
                                pol_token = f"-{pol.lower()}-"
                                if pol_token in lower or f"_{pol.lower()}_" in lower or lower.endswith(f"-{pol.lower()}.tiff"):
                                    result["measurements"][pol] = {
                                        "source_type": "zip",
                                        "path": full_path,
                                        "zip_inner_path": name,
                                        "vsi_path": f"/vsizip/{full_path.replace(os.sep, '/')}/{name}",
                                    }
            except Exception as exc:
                logger.warning("Error reading ZIP archive %s: %s", full_path, exc)

    # 2. Search inside unzipped .SAFE directories
    for entry in valid_entries:
        full_path = os.path.join(prod_dir, entry)
        if os.path.isdir(full_path):
            result["safe_dir"] = full_path
            for root, _, files in os.walk(full_path):
                for f in files:
                    lower = f.lower()
                    if lower.endswith(".tiff") or lower.endswith(".tif"):
                        for pol in ALLOWED_POLARIZATIONS:
                            pol_token = f"-{pol.lower()}-"
                            if pol_token in lower or f"_{pol.lower()}_" in lower:
                                fpath = os.path.join(root, f)
                                result["measurements"][pol] = {
                                    "source_type": "file",
                                    "path": fpath,
                                    "zip_inner_path": None,
                                    "vsi_path": fpath,
                                }

    # 3. Direct TIFFs in prod_dir
    for entry in valid_entries:
        full_path = os.path.join(prod_dir, entry)
        if os.path.isfile(full_path):
            lower = entry.lower()
            if lower.endswith(".tiff") or lower.endswith(".tif"):
                for pol in ALLOWED_POLARIZATIONS:
                    pol_token = f"-{pol.lower()}-"
                    if pol_token in lower or f"_{pol.lower()}_" in lower or lower.startswith(pol.lower()):
                        result["measurements"][pol] = {
                            "source_type": "file",
                            "path": full_path,
                            "zip_inner_path": None,
                            "vsi_path": full_path,
                        }

    result["available_polarizations"] = sorted(list(result["measurements"].keys()))
    return result


def is_product_processed(product_id: str, polarization: str) -> tuple[bool, str | None, dict | None]:
    """
    Check if a specific Sentinel-1 product and polarization have already been processed.

    Returns
    -------
    (already_processed, relative_output_path, metadata)
    """
    safe_id = _get_safe_product_id(product_id)
    pol_lower = polarization.strip().lower()
    proc_dir = get_processed_product_dir(safe_id)
    out_file = os.path.join(proc_dir, f"{pol_lower}_processed.tif")
    meta_file = os.path.join(proc_dir, "metadata.json")

    if os.path.isfile(out_file) and os.path.getsize(out_file) > 0:
        rel_path = f"sentinel1/processed/{safe_id}/{pol_lower}_processed.tif"
        meta = None
        if os.path.isfile(meta_file):
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    all_meta = json.load(f)
                    meta = all_meta.get(polarization.upper()) or all_meta
            except Exception:
                pass
        return True, rel_path, meta

    return False, None, None


# ──────────────────────────────────────────────────────────────
# PREPROCESSING EXECUTION
# ──────────────────────────────────────────────────────────────

def preprocess_sentinel1_sar(
    product_id: str,
    polarization: str,
) -> dict[str, Any]:
    """
    Execute Prototype SAR Preprocessing for a single polarization of a
    downloaded Sentinel-1 product.

    Pipeline Stages
    ---------------
    1. Validate product existence and naming.
    2. Check duplicate processing -> return ALREADY_EXISTS if found.
    3. Validate polarization availability in the downloaded product.
    4. Open source SAR measurement via rasterio (file or /vsizip/).
    5. Mask invalid / zero / NoData values.
    6. Convert DN to float32 raster.
    7. Retain exact geospatial metadata (CRS, transform, bounds, dimensions).
    8. Write processed GeoTIFF to backend/data/sentinel1/processed/<product_id>/.
    9. Compute actual descriptive statistics on valid non-nodata pixels.
    10. Persist processing metadata JSON.

    Parameters
    ----------
    product_id : str
        Sentinel-1 product identifier.
    polarization : str
        Requested polarization ('VV' or 'VH').

    Returns
    -------
    dict conforming to:
      - "success"
      - "already_processed"
      - "not_found"
      - "invalid_polarization"
      - "error"
    """
    clean_id = _get_safe_product_id(product_id)
    pol_upper = (polarization or "").strip().upper()

    # ── 1. Sentinel-1 Name & Request Validation ──────────────
    if not clean_id:
        return {
            "status": "not_found",
            "message": "Product ID cannot be empty.",
        }

    is_s1 = clean_id.startswith(_S1_PREFIXES) or "SENTINEL-1" in clean_id.upper()
    if not is_s1:
        return {
            "status": "not_found",
            "message": "Product does not belong to Sentinel-1.",
        }

    if pol_upper not in ALLOWED_POLARIZATIONS:
        return {
            "status": "invalid_polarization",
            "message": f"Requested polarization '{pol_upper}' is invalid. Allowed: {list(ALLOWED_POLARIZATIONS)}.",
        }

    # ── 2. Duplicate Processing Check ────────────────────────
    already_done, existing_path, existing_meta = is_product_processed(clean_id, pol_upper)
    if already_done:
        response: dict[str, Any] = {
            "status": "already_processed",
            "product_id": clean_id,
            "polarization": pol_upper,
            "processing_status": "ALREADY_EXISTS",
            "output_file": existing_path,
        }
        if existing_meta and isinstance(existing_meta, dict):
            for k in ("width", "height", "crs", "bounds", "min_value", "max_value", "mean_value", "nodata"):
                if k in existing_meta:
                    response[k] = existing_meta[k]
        return response

    # ── 3. Inspect Local Downloaded Product ──────────────────
    inspection = find_product_measurements(clean_id)
    if not inspection["exists"]:
        return {
            "status": "not_found",
            "message": "Downloaded Sentinel-1 product not found locally.",
        }

    if pol_upper not in inspection["measurements"]:
        return {
            "status": "invalid_polarization",
            "message": f"Requested polarization '{pol_upper}' is not available in this Sentinel-1 product.",
            "available_polarizations": inspection["available_polarizations"],
        }

    meas_info = inspection["measurements"][pol_upper]
    vsi_path = meas_info["vsi_path"]

    # ── 4. Open and Read SAR Measurement ─────────────────────
    try:
        with rasterio.open(vsi_path) as src:
            src_crs = src.crs
            src_transform = src.transform
            src_width = src.width
            src_height = src.height
            src_bounds = src.bounds
            src_nodata = src.nodata

            # Read first band
            data = src.read(1)
    except Exception as exc:
        logger.error("Failed to read SAR raster at %s: %s", vsi_path, exc)
        return {
            "status": "error",
            "message": f"Unable to read SAR measurement raster: {exc}",
        }

    # ── 5. Handle Invalid / NoData Values & Convert DN ────────
    # In Sentinel-1 GRD, 0 is typically used for borders / missing samples
    if src_nodata is not None:
        valid_mask = (data != src_nodata) & (data > 0)
    else:
        valid_mask = data > 0

    valid_count = int(np.count_nonzero(valid_mask))
    total_pixels = int(src_width * src_height)

    # Convert to float32 with standard NoData sentinel
    processed_raster = np.full((src_height, src_width), PROCESSED_NODATA, dtype=np.float32)

    if valid_count > 0:
        valid_values = data[valid_mask].astype(np.float32)
        processed_raster[valid_mask] = valid_values

        min_val = float(np.min(valid_values))
        max_val = float(np.max(valid_values))
        mean_val = float(np.mean(valid_values))
    else:
        min_val = 0.0
        max_val = 0.0
        mean_val = 0.0

    # ── 6. Geospatial Retention & Output Storage ─────────────
    proc_dir = get_processed_product_dir(clean_id)
    os.makedirs(proc_dir, exist_ok=True)

    pol_lower = pol_upper.lower()
    out_filename = f"{pol_lower}_processed.tif"
    out_filepath = os.path.join(proc_dir, out_filename)
    rel_output_path = f"sentinel1/processed/{clean_id}/{out_filename}".replace("\\", "/")

    crs_repr = str(src_crs) if src_crs is not None else "EPSG:4326"
    bounds_list = [
        float(src_bounds.left),
        float(src_bounds.bottom),
        float(src_bounds.right),
        float(src_bounds.top),
    ]

    out_profile = {
        "driver": "GTiff",
        "height": src_height,
        "width": src_width,
        "count": 1,
        "dtype": "float32",
        "crs": src_crs,
        "transform": src_transform,
        "nodata": PROCESSED_NODATA,
        "compress": "deflate",
    }

    try:
        with rasterio.open(out_filepath, "w", **out_profile) as dst:
            dst.write(processed_raster, 1)
    except Exception as exc:
        logger.error("Failed to write processed GeoTIFF to %s: %s", out_filepath, exc)
        return {
            "status": "error",
            "message": f"Unable to save processed GeoTIFF: {exc}",
        }

    # ── 7. Generate Processing Metadata ──────────────────────
    result_meta: dict[str, Any] = {
        "status": "success",
        "product_id": clean_id,
        "polarization": pol_upper,
        "source": "Sentinel-1",
        "processing_status": "COMPLETED",
        "output_file": rel_output_path,
        "width": int(src_width),
        "height": int(src_height),
        "crs": crs_repr,
        "bounds": bounds_list,
        "min_value": round(min_val, 4),
        "max_value": round(max_val, 4),
        "mean_value": round(mean_val, 4),
        "nodata": PROCESSED_NODATA,
        "valid_pixels": valid_count,
        "total_pixels": total_pixels,
        "processing_pipeline": "Prototype SAR Preprocessing",
        "operations_applied": [
            "SAR measurement raster extraction",
            "NoData border masking",
            "Float32 digital number conversion",
            "Geospatial transform & CRS preservation",
            "Descriptive statistics calculation",
        ],
        "calibration_note": (
            "Prototype SAR Preprocessing. Absolute radiometric calibration (sigma0 lookup), "
            "terrain correction (DEM orthorectification), and speckle filtering are not applied."
        ),
    }

    # Write / update metadata.json in processed/<product_id>/
    meta_json_path = os.path.join(proc_dir, "metadata.json")
    existing_all_meta: dict[str, Any] = {}
    if os.path.isfile(meta_json_path):
        try:
            with open(meta_json_path, "r", encoding="utf-8") as f:
                existing_all_meta = json.load(f)
        except Exception:
            existing_all_meta = {}

    existing_all_meta[pol_upper] = result_meta
    try:
        with open(meta_json_path, "w", encoding="utf-8") as f:
            json.dump(existing_all_meta, f, indent=2)
    except Exception as exc:
        logger.warning("Failed to save metadata.json in %s: %s", proc_dir, exc)

    logger.info(
        "Sentinel-1 SAR preprocessing complete for %s (%s) -> %s",
        clean_id, pol_upper, rel_output_path
    )

    return result_meta


def get_sar_product_status(product_id: str) -> dict[str, Any]:
    """
    Query the preprocessing and download status for a Sentinel-1 product.
    Returns available polarizations and which ones have been processed.
    """
    clean_id = _get_safe_product_id(product_id)
    inspection = find_product_measurements(clean_id)

    proc_dir = get_processed_product_dir(clean_id)
    processed_pols = []
    meta_by_pol = {}

    if os.path.isdir(proc_dir):
        for pol in ALLOWED_POLARIZATIONS:
            done, path, meta = is_product_processed(clean_id, pol)
            if done:
                processed_pols.append(pol)
                if meta:
                    meta_by_pol[pol] = meta

    return {
        "product_id": clean_id,
        "is_downloaded": inspection["exists"],
        "available_polarizations": inspection["available_polarizations"],
        "processed_polarizations": processed_pols,
        "processed_metadata": meta_by_pol,
    }
