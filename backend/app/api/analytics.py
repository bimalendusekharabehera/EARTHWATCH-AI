from fastapi import APIRouter
from app.schemas.analytics import HistoricalAnalytics

router = APIRouter()


@router.get("/analytics", response_model=HistoricalAnalytics)
def historical_analytics():
    return {
        "mode": "DEMO",
        "source": "Demo Historical Flood Dataset",

        "summary": {
            "total_events": 5,
            "total_flooded_area_km2": 42.7,
            "highest_risk_year": 2025
        },

        "yearly_data": [
            {
                "year": 2021,
                "flooded_area_km2": 5.4,
                "risk_level": "MEDIUM"
            },
            {
                "year": 2022,
                "flooded_area_km2": 7.8,
                "risk_level": "HIGH"
            },
            {
                "year": 2023,
                "flooded_area_km2": 6.2,
                "risk_level": "MEDIUM"
            },
            {
                "year": 2024,
                "flooded_area_km2": 9.5,
                "risk_level": "HIGH"
            },
            {
                "year": 2025,
                "flooded_area_km2": 13.8,
                "risk_level": "VERY HIGH"
            }
        ]
    }