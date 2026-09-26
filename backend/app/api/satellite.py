from fastapi import APIRouter
from app.services.satellite_service import get_satellite_data
from app.schemas.satellite import SatelliteData
router = APIRouter()


@router.get("/satellite",response_model=SatelliteData)
def satellite_data():
    return get_satellite_data()