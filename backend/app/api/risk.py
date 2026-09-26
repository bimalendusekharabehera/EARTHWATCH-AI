from fastapi import APIRouter
from app.services.risk_service import get_risk_prediction
from app.schemas.risk import RiskPrediction

router = APIRouter()


@router.get("/risk", response_model=RiskPrediction)
def risk_prediction():
    return get_risk_prediction()