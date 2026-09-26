"""
sar_pipeline_service.py
=======================
Sentinel-1 SAR Acquisition Pipeline — Foundation Layer

ARCHITECTURE OVERVIEW
---------------------
This module prepares the backend for a future real Sentinel-1 SAR
acquisition and processing workflow.  It does NOT download any
satellite rasters from S3 / CDSE.

The pipeline runs through four conceptual stages:

    STAGE 1 – SCENE_DISCOVERY
        Query the Copernicus STAC catalogue for Sentinel-1 GRD products
        covering a requested location and date window.
        Persist discovered scenes to the local SQLite registry.

    STAGE 2 – AWAITING_ACQUISITION
        Scenes have been discovered.  Actual S3 acquisition is blocked
        until CDSE credentials are provided by an operator.  The scene
        remains in the registry with status PENDING.

    STAGE 3 – (FUTURE) DOWNLOAD
        Not implemented in this foundation layer.
        Placeholder hook: acquire_scene(scene_id) → raises NotImplementedError.

    STAGE 4 – (FUTURE) PROCESSING
        Not implemented in this foundation layer.
        Placeholder hook: process_scene(scene_id) → raises NotImplementedError.

LOCAL REGISTRY
--------------
Discovered scenes are stored in a lightweight SQLite database at:

    backend/data/sar_scene_registry.db

Tables:
    sar_scenes (
        id              TEXT PRIMARY KEY,   -- Copernicus product ID
        location        TEXT NOT NULL,
        acquisition_dt  TEXT,               -- ISO-8601
        platform        TEXT,               -- e.g. SENTINEL-1A
        vv_href         TEXT,               -- STAC asset href (not downloaded)
        status          TEXT NOT NULL,      -- PENDING | ACQUIRED | PROCESSED | FAILED
        discovered_at   TEXT NOT NULL,      -- UTC ISO-8601
        updated_at      TEXT NOT NULL
    )

IMPORTANT CONSTRAINTS
---------------------
- No S3 / CDSE credentials are required at this stage.
- No large raster files are downloaded.
- No existing SQL Server schema is modified.
- This module is fully self-contained and does not touch other services.
"""

import sqlite3
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import requests


# ──────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# Path to the local SQLite registry (created automatically if absent)
_REGISTRY_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "data"
)
REGISTRY_PATH = os.path.abspath(
    os.path.join(_REGISTRY_DIR, "sar_scene_registry.db")
)

# Copernicus public STAC endpoint (no auth required for metadata search)
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"

# Supported monitored locations (mirrors sar_data_service.py)
LOCATIONS: dict[str, dict[str, float]] = {
    "bhubaneswar": {"latitude": 20.2961,  "longitude": 85.8245},
    "balasore":    {"latitude": 21.4942,  "longitude": 86.9317},
    "khordha":     {"latitude": 20.1827,  "longitude": 85.6168},
}

# Scene status constants
STATUS_PENDING   = "PENDING"
STATUS_ACQUIRED  = "ACQUIRED"    # future
STATUS_PROCESSED = "PROCESSED"   # future
STATUS_FAILED    = "FAILED"


# ──────────────────────────────────────────────────────────────
# Registry helpers
# ──────────────────────────────────────────────────────────────

def _ensure_registry() -> sqlite3.Connection:
    """Open (or create) the SQLite registry and return a connection."""
    os.makedirs(_REGISTRY_DIR, exist_ok=True)
    conn = sqlite3.connect(REGISTRY_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sar_scenes (
            id              TEXT PRIMARY KEY,
            location        TEXT NOT NULL,
            acquisition_dt  TEXT,
            platform        TEXT,
            vv_href         TEXT,
            status          TEXT NOT NULL DEFAULT 'PENDING',
            discovered_at   TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────
# Stage 1 – Scene Discovery
# ──────────────────────────────────────────────────────────────

def discover_scenes(
    location: str,
    date: str,
    window_days: int = 3
) -> dict[str, Any]:
    """
    Query the Copernicus STAC catalogue for Sentinel-1 GRD products
    near *location* within ±*window_days* of *date*.

    Newly discovered scenes are inserted into the local registry with
    status PENDING.  Already-known scenes are updated if metadata changed.

    Parameters
    ----------
    location : str
        One of the monitored location names (case-insensitive).
    date : str
        Centre date in ``YYYY-MM-DD`` format.
    window_days : int
        Half-width of the temporal search window (default 3).

    Returns
    -------
    dict with keys:
        status, location, date, scenes_found, scenes_new, scenes (list)
    """
    location_key = location.strip().lower()
    if location_key not in LOCATIONS:
        raise ValueError(
            f"Unsupported location '{location}'. "
            f"Supported: {sorted(LOCATIONS)}"
        )

    coords = LOCATIONS[location_key]
    lat, lon = coords["latitude"], coords["longitude"]

    try:
        centre = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"Invalid date '{date}'. Expected YYYY-MM-DD.")

    delta = 0.25  # bounding box half-width in degrees
    start = (centre - timedelta(days=window_days)).strftime(
        "%Y-%m-%dT00:00:00Z"
    )
    end = (centre + timedelta(days=window_days)).strftime(
        "%Y-%m-%dT23:59:59Z"
    )

    payload = {
        "collections": ["sentinel-1-grd"],
        "bbox": [lon - delta, lat - delta, lon + delta, lat + delta],
        "datetime": f"{start}/{end}",
        "limit": 20,
    }

    try:
        response = requests.post(
            STAC_URL,
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        features = response.json().get("features", [])
    except requests.RequestException as exc:
        logger.warning("STAC query failed: %s", exc)
        features = []

    conn = _ensure_registry()
    now = _now_utc()
    scenes_new = 0
    scenes_list: list[dict[str, Any]] = []

    try:
        for feat in features:
            product_id: str = feat.get("id", "unknown")
            props = feat.get("properties", {})
            assets = feat.get("assets", {})

            acq_dt: str | None = props.get("datetime")
            platform: str | None = props.get("platform")
            vv_asset = assets.get("vv") or assets.get("VV")
            vv_href: str | None = (
                vv_asset.get("href") if vv_asset else None
            )

            existing = conn.execute(
                "SELECT id FROM sar_scenes WHERE id = ?",
                (product_id,)
            ).fetchone()

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO sar_scenes
                        (id, location, acquisition_dt, platform,
                         vv_href, status, discovered_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        product_id,
                        location_key,
                        acq_dt,
                        platform,
                        vv_href,
                        STATUS_PENDING,
                        now,
                        now,
                    ),
                )
                scenes_new += 1
            else:
                conn.execute(
                    """
                    UPDATE sar_scenes
                    SET acquisition_dt = ?,
                        platform      = ?,
                        vv_href       = ?,
                        updated_at    = ?
                    WHERE id = ?
                    """,
                    (acq_dt, platform, vv_href, now, product_id),
                )

            scenes_list.append({
                "id": product_id,
                "location": location_key,
                "acquisition_dt": acq_dt,
                "platform": platform,
                "vv_href": vv_href,
                "status": STATUS_PENDING if not existing else "EXISTING",
            })

        conn.commit()
    finally:
        conn.close()

    return {
        "status": "success",
        "location": location_key,
        "date": date,
        "window_days": window_days,
        "scenes_found": len(features),
        "scenes_new": scenes_new,
        "scenes": scenes_list,
        "stac_query": {
            "bbox": payload["bbox"],
            "datetime_range": f"{start} / {end}",
            "collection": "sentinel-1-grd",
        },
        "pipeline_stage": "SCENE_DISCOVERY",
        "next_stage": "AWAITING_ACQUISITION",
        "note": (
            "Scene metadata has been catalogued. "
            "Raster download requires CDSE credentials "
            "and is not implemented in this foundation layer."
        ),
    }


# ──────────────────────────────────────────────────────────────
# Registry query helpers
# ──────────────────────────────────────────────────────────────

def get_registry_scenes(
    location: str | None = None,
    status: str | None = None,
    limit: int = 50
) -> list[dict[str, Any]]:
    """
    Return scenes from the local registry, optionally filtered by
    location and/or status.
    """
    conn = _ensure_registry()
    try:
        clauses: list[str] = []
        params: list[Any] = []

        if location:
            clauses.append("location = ?")
            params.append(location.strip().lower())
        if status:
            clauses.append("status = ?")
            params.append(status.upper())

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)

        rows = conn.execute(
            f"""
            SELECT id, location, acquisition_dt, platform,
                   vv_href, status, discovered_at, updated_at
            FROM sar_scenes
            {where}
            ORDER BY discovered_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()

        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_pipeline_summary() -> dict[str, Any]:
    """
    Return a high-level summary of the SAR acquisition pipeline registry.
    """
    conn = _ensure_registry()
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM sar_scenes"
        ).fetchone()[0]

        pending = conn.execute(
            "SELECT COUNT(*) FROM sar_scenes WHERE status = ?",
            (STATUS_PENDING,)
        ).fetchone()[0]

        acquired = conn.execute(
            "SELECT COUNT(*) FROM sar_scenes WHERE status = ?",
            (STATUS_ACQUIRED,)
        ).fetchone()[0]

        processed = conn.execute(
            "SELECT COUNT(*) FROM sar_scenes WHERE status = ?",
            (STATUS_PROCESSED,)
        ).fetchone()[0]

        failed = conn.execute(
            "SELECT COUNT(*) FROM sar_scenes WHERE status = ?",
            (STATUS_FAILED,)
        ).fetchone()[0]

        last_discovery = conn.execute(
            "SELECT MAX(discovered_at) FROM sar_scenes"
        ).fetchone()[0]

    finally:
        conn.close()

    return {
        "registry_path": REGISTRY_PATH,
        "total_scenes": total,
        "by_status": {
            "pending":   pending,
            "acquired":  acquired,
            "processed": processed,
            "failed":    failed,
        },
        "last_discovery": last_discovery,
        "pipeline_stages": [
            {
                "stage": 1,
                "name":  "SCENE_DISCOVERY",
                "status": "IMPLEMENTED",
                "description": (
                    "Query Copernicus STAC for Sentinel-1 GRD products "
                    "and persist metadata to local SQLite registry."
                ),
            },
            {
                "stage": 2,
                "name":  "AWAITING_ACQUISITION",
                "status": "FOUNDATION_READY",
                "description": (
                    "Scene metadata catalogued. "
                    "Awaiting CDSE credentials for S3 download."
                ),
            },
            {
                "stage": 3,
                "name":  "DOWNLOAD",
                "status": "NOT_IMPLEMENTED",
                "description": (
                    "Requires CDSE S3 credentials. "
                    "Not implemented in this foundation layer."
                ),
            },
            {
                "stage": 4,
                "name":  "SAR_PROCESSING",
                "status": "NOT_IMPLEMENTED",
                "description": (
                    "Radiometric calibration, speckle filtering, "
                    "threshold-based flood masking. Future work."
                ),
            },
        ],
    }


# ──────────────────────────────────────────────────────────────
# Placeholder acquisition / processing hooks
# ──────────────────────────────────────────────────────────────

def acquire_scene(scene_id: str) -> None:  # noqa: ARG001
    """
    (FUTURE) Download the Sentinel-1 GRD raster from CDSE S3.

    Raises
    ------
    NotImplementedError
        Always — CDSE credentials and S3 download are not implemented
        in this foundation layer.
    """
    raise NotImplementedError(
        "acquire_scene() is not implemented in this foundation layer. "
        "Provide CDSE credentials and implement S3 download to enable."
    )


def process_scene(scene_id: str) -> None:  # noqa: ARG001
    """
    (FUTURE) Process a downloaded Sentinel-1 GRD raster.

    Raises
    ------
    NotImplementedError
        Always — processing pipeline is not implemented yet.
    """
    raise NotImplementedError(
        "process_scene() is not implemented in this foundation layer."
    )
