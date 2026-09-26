from fastapi import APIRouter, Query

from app.services.compare_service import get_image_comparison

router = APIRouter()


@router.get("/compare")
def compare_images(
    location: str = Query(
        default="Bhubaneswar",
        description="Location for satellite comparison"
    ),
    before_date: str = Query(
        default="2026-09-15",
        description="Before-event date"
    ),
    after_date: str = Query(
        default="2026-09-19",
        description="After-event date"
    )
):
    return get_image_comparison(
        location=location,
        before_date=before_date,
        after_date=after_date
    )