from fastapi import APIRouter, Depends
from app.services.flood_service import get_flood_detection
from app.schemas.flood import FloodDetection
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/flood", response_model=FloodDetection)
def flood_detection(
    current_user: dict = Depends(get_current_user)
):
    return get_flood_detection()