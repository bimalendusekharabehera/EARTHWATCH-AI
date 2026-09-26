from fastapi import APIRouter
from app.services.flood_service import get_flood_detection
from app.schemas.flood import FloodDetection

router = APIRouter()


@router.get("/flood", response_model=FloodDetection)
def flood_detection():
    return get_flood_detection()