from fastapi import APIRouter, Query, HTTPException, Depends

from app.services.sar_data_service import (
    get_sentinel1_vv_asset
)
from app.api.deps import get_current_user


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
    ),
    current_user: dict = Depends(get_current_user),
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