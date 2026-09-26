from fastapi import APIRouter, Query, HTTPException

from app.services.sar_data_service import (
    get_sentinel1_vv_asset
)


router = APIRouter()


@router.get("/sar/data")
def get_sar_data(
    location: str = Query(
        default="Bhubaneswar",
        description="Location for Sentinel-1 search"
    ),
    date: str = Query(
        default="2026-09-19",
        description="Requested satellite date"
    )
):

    try:

        result = get_sentinel1_vv_asset(
            location=location,
            date=date
        )

        return result

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Sentinel-1 SAR data search failed: "
                f"{str(error)}"
            )
        )