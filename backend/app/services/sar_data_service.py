import requests
from datetime import datetime, timedelta


STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"


LOCATIONS = {
    "bhubaneswar": {
        "latitude": 20.2961,
        "longitude": 85.8245,
    },
    "balasore": {
        "latitude": 21.4942,
        "longitude": 86.9317,
    },
    "khordha": {
        "latitude": 20.1827,
        "longitude": 85.6168,
    },
}


def get_sentinel1_vv_asset(
    location: str = "Bhubaneswar",
    date: str = "2026-09-19"
):
    """
    Find the nearest Sentinel-1 GRD VV asset
    using the public Copernicus STAC catalogue.

    This function only discovers the VV asset.
    It does not download or process the raster yet.
    """

    location_key = location.strip().lower()

    if location_key not in LOCATIONS:
        raise ValueError(
            f"Unsupported location: {location}. "
            f"Available locations: {list(LOCATIONS.keys())}"
        )

    latitude = LOCATIONS[location_key]["latitude"]
    longitude = LOCATIONS[location_key]["longitude"]

    requested_date = datetime.strptime(
        date,
        "%Y-%m-%d"
    )

    start_date = (
        requested_date - timedelta(days=3)
    ).strftime("%Y-%m-%dT00:00:00Z")

    end_date = (
        requested_date + timedelta(days=3)
    ).strftime("%Y-%m-%dT23:59:59Z")

    delta = 0.15

    bbox = [
        longitude - delta,
        latitude - delta,
        longitude + delta,
        latitude + delta,
    ]

    payload = {
        "collections": [
            "sentinel-1-grd"
        ],
        "bbox": bbox,
        "datetime": (
            f"{start_date}/{end_date}"
        ),
        "limit": 10,
    }

    response = requests.post(
        STAC_URL,
        json=payload,
        timeout=30
    )

    response.raise_for_status()

    data = response.json()

    features = data.get(
        "features",
        []
    )

    if not features:
        return {
            "available": False,
            "location": location,
            "requested_date": date,
            "message": (
                "No Sentinel-1 GRD products "
                "were found for this location/date."
            ),
        }

    # Find the product closest to requested date
    def date_difference(feature):

        feature_date = feature.get(
            "properties",
            {}
        ).get("datetime")

        if not feature_date:
            return 999999

        feature_datetime = datetime.fromisoformat(
            feature_date.replace(
                "Z",
                "+00:00"
            )
        )

        requested_datetime = requested_date.replace(
            tzinfo=feature_datetime.tzinfo
        )

        return abs(
            (
                feature_datetime
                - requested_datetime
            ).total_seconds()
        )

    features.sort(
        key=date_difference
    )

    selected = features[0]

    assets = selected.get(
        "assets",
        {}
    )

    vv_asset = assets.get("vv")

    if not vv_asset:

        return {
            "available": False,
            "location": location,
            "requested_date": date,
            "product_id": selected.get("id"),
            "message": (
                "Sentinel-1 product was found, "
                "but a VV asset was not available."
            ),
        }

    return {
        "available": True,
        "location": location,
        "requested_date": date,
        "product_id": selected.get("id"),
        "acquisition_date": selected.get(
            "properties",
            {}
        ).get("datetime"),
        "vv_asset": {
            "href": vv_asset.get("href"),
            "type": vv_asset.get("type"),
            "title": vv_asset.get("title"),
        },
        "message": (
            "Sentinel-1 VV asset found "
            "from Copernicus STAC."
        ),
    }