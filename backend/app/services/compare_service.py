import requests
from datetime import datetime, timedelta
from app.services.change_service import calculate_image_change

STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search"


# ---------------------------------------------------------
# SUPPORTED LOCATIONS
# ---------------------------------------------------------

LOCATION_COORDINATES = {
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


# ---------------------------------------------------------
# GET COORDINATES
# ---------------------------------------------------------

def get_coordinates(location):
    """
    Convert location name into numeric latitude and longitude.
    """

    key = str(location).strip().lower()

    if key not in LOCATION_COORDINATES:
        raise ValueError(
            f"Location '{location}' is not currently supported. "
            f"Try: {', '.join(LOCATION_COORDINATES.keys())}"
        )

    coordinates = LOCATION_COORDINATES[key]

    latitude = float(coordinates["latitude"])
    longitude = float(coordinates["longitude"])

    return latitude, longitude


# ---------------------------------------------------------
# CREATE BOUNDING BOX
# ---------------------------------------------------------

def create_bbox(latitude, longitude, size=0.08):
    """
    Create a small bounding box around the selected location.

    Returns:
        [west, south, east, north]
    """

    latitude = float(latitude)
    longitude = float(longitude)
    size = float(size)

    return [
        longitude - size,
        latitude - size,
        longitude + size,
        latitude + size,
    ]


# ---------------------------------------------------------
# SEARCH SENTINEL DATA
# ---------------------------------------------------------

def search_sentinel(
    bbox,
    collection,
    target_date,
    date_window_days=3
):
    """
    Search Copernicus Data Space STAC catalogue
    for a satellite observation near the requested date.
    """

    target = datetime.strptime(
        target_date,
        "%Y-%m-%d"
    )

    start_date = target - timedelta(
        days=date_window_days
    )

    end_date = target + timedelta(
        days=date_window_days
    )

    params = {
        "bbox": ",".join(
            str(value)
            for value in bbox
        ),

        "datetime": (
            f"{start_date.strftime('%Y-%m-%d')}"
            f"T00:00:00Z/"
            f"{end_date.strftime('%Y-%m-%d')}"
            f"T23:59:59Z"
        ),

        "collections": collection,

        "limit": 10,
    }

    response = requests.get(
        STAC_SEARCH_URL,
        params=params,
        timeout=30
    )

    response.raise_for_status()

    data = response.json()

    features = data.get(
        "features",
        []
    )

    if not features:
        return None

    # -----------------------------------------------------
    # SORT BY CLOSEST DATE
    # -----------------------------------------------------

    def date_difference(feature):

        properties = feature.get(
            "properties",
            {}
        )

        datetime_value = properties.get(
            "datetime"
        )

        if not datetime_value:
            return float("inf")

        try:

            observation_date = datetime.fromisoformat(
                datetime_value.replace(
                    "Z",
                    "+00:00"
                )
            ).replace(
                tzinfo=None
            )

            return abs(
                (
                    observation_date - target
                ).total_seconds()
            )

        except Exception:

            return float("inf")

    features.sort(
        key=date_difference
    )

    return features[0]


# ---------------------------------------------------------
# GET OBSERVATION DATE
# ---------------------------------------------------------

def get_observation_date(feature):

    if not feature:
        return None

    properties = feature.get(
        "properties",
        {}
    )

    datetime_value = properties.get(
        "datetime"
    )

    if not datetime_value:
        return "Unknown"

    return datetime_value[:10]


# ---------------------------------------------------------
# GET PRODUCT NAME
# ---------------------------------------------------------

def get_product_name(feature):

    if not feature:
        return None

    properties = feature.get(
        "properties",
        {}
    )

    return (
        properties.get("title")
        or feature.get("id")
        or "Unknown satellite product"
    )


# ---------------------------------------------------------
# GET SATELLITE ASSETS
# ---------------------------------------------------------

def get_assets(feature):

    if not feature:
        return {}

    assets = feature.get(
        "assets",
        {}
    )

    result = {}

    for name, asset in assets.items():

        result[name] = {
            "title": asset.get(
                "title"
            ),

            "href": asset.get(
                "href"
            ),

            "type": asset.get(
                "type"
            ),
        }

    return result


# ---------------------------------------------------------
# FORMAT SATELLITE OBSERVATION
# ---------------------------------------------------------
def format_observation(feature, satellite_name):

    if not feature:
        return {
            "available": False,
            "date": None,
            "product": None,
            "image_url": None,
            "assets": {},
            "message": (
                f"No {satellite_name} observation "
                "found near this date."
            )
        }

    assets = feature.get(
        "assets",
        {}
    )

    image_url = None

    # -----------------------------------------------------
    # SENTINEL-2
    # -----------------------------------------------------

    if satellite_name == "Sentinel-2":

        # Prefer thumbnail because it is already JPEG.
        if "thumbnail" in assets:

            image_url = assets["thumbnail"].get(
                "href"
            )

        # Fallback to True Color Image.
        elif "TCI_10m" in assets:

            image_url = assets["TCI_10m"].get(
                "href"
            )

    # -----------------------------------------------------
    # SENTINEL-1
    # -----------------------------------------------------

    elif satellite_name == "Sentinel-1":

        # Prefer thumbnail.
        if "thumbnail" in assets:

            image_url = assets["thumbnail"].get(
                "href"
            )

    return {

        "available": True,

        "date": get_observation_date(
            feature
        ),

        "product": get_product_name(
            feature
        ),

        "image_url": image_url,

        "assets": {

            "thumbnail": (
                assets.get("thumbnail", {})
            ),

            "true_color": (
                assets.get("TCI_10m", {})
            )
        }
    }

# ---------------------------------------------------------
# MAIN COMPARISON FUNCTION
# ---------------------------------------------------------

def get_image_comparison(
    location="Bhubaneswar",
    before_date="2026-09-15",
    after_date="2026-09-19"
):

    try:

        # -------------------------------------------------
        # LOCATION
        # -------------------------------------------------

        latitude, longitude = get_coordinates(
            location
        )

        # -------------------------------------------------
        # BOUNDING BOX
        # -------------------------------------------------

        bbox = create_bbox(
            latitude,
            longitude
        )

        # -------------------------------------------------
        # SENTINEL-1 BEFORE
        # -------------------------------------------------

        sentinel1_before = search_sentinel(

            bbox=bbox,

            collection="sentinel-1-grd",

            target_date=before_date
        )

        # -------------------------------------------------
        # SENTINEL-1 AFTER
        # -------------------------------------------------

        sentinel1_after = search_sentinel(

            bbox=bbox,

            collection="sentinel-1-grd",

            target_date=after_date
        )

        # -------------------------------------------------
        # SENTINEL-2 BEFORE
        # -------------------------------------------------

        sentinel2_before = search_sentinel(

            bbox=bbox,

            collection="sentinel-2-l2a",

            target_date=before_date
        )

        # -------------------------------------------------
        # SENTINEL-2 AFTER
        # -------------------------------------------------

        sentinel2_after = search_sentinel(

            bbox=bbox,

            collection="sentinel-2-l2a",

            target_date=after_date
        )

        # -------------------------------------------------
        # CALCULATE SENTINEL-2 IMAGE CHANGE
        # -------------------------------------------------

        before_s2 = format_observation(
            sentinel2_before,
            "Sentinel-2"
        )

        after_s2 = format_observation(
            sentinel2_after,
            "Sentinel-2"
        )

        change = calculate_image_change(
            before_s2.get("image_url"),
            after_s2.get("image_url")
        )

        # -------------------------------------------------
        # RETURN RESULT
        # -------------------------------------------------

        return {

            "mode": "COPERNICUS_STAC",

            "status": "comparison_completed",

            "location": location,

            "coordinates": {

                "latitude": latitude,

                "longitude": longitude
            },

            "before": {

                "requested_date": before_date,

                "sentinel_1": format_observation(
                    sentinel1_before,
                    "Sentinel-1"
                ),

                "sentinel_2": before_s2
            },

            "after": {

                "requested_date": after_date,

                "sentinel_1": format_observation(
                    sentinel1_after,
                    "Sentinel-1"
                ),

                "sentinel_2": after_s2
            },

            "change": change,

            "message": (
                "Real satellite observations searched "
                "from Copernicus Data Space STAC catalogue."
            )
        }

    # -----------------------------------------------------
    # REQUEST ERROR
    # -----------------------------------------------------

    except requests.RequestException as error:

        return {

            "mode": "COPERNICUS_STAC",

            "status": "satellite_api_error",

            "location": location,

            "before": {},

            "after": {},

            "change": {
                "status": "ERROR",
                "message": (
                    "Copernicus Data Space request failed."
                )
            },

            "message": (
                "Could not connect to Copernicus "
                "Data Space STAC catalogue."
            ),

            "error": str(error)
        }

    # -----------------------------------------------------
    # INVALID LOCATION / DATE
    # -----------------------------------------------------

    except ValueError as error:

        return {

            "mode": "COPERNICUS_STAC",

            "status": "invalid_request",

            "location": location,

            "before": {},

            "after": {},

            "change": {
                "status": "ERROR",
                "message": str(error)
            },

            "message": str(error),

            "error": str(error)
        }

    # -----------------------------------------------------
    # OTHER ERROR
    # -----------------------------------------------------

    except Exception as error:

        return {

            "mode": "COPERNICUS_STAC",

            "status": "error",

            "location": location,

            "before": {},

            "after": {},

            "change": {
                "status": "ERROR",
                "message": str(error)
            },

            "message": (
                "Unexpected error while searching "
                "satellite observations."
            ),

            "error": str(error)
        }