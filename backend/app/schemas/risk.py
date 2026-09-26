from pydantic import BaseModel
from typing import Dict


class EnvironmentalFactors(BaseModel):
    rainfall_mm: float
    elevation_m: float
    slope_degree: float
    river_distance_km: float
    ndvi: float
    ndwi: float


class RiskPrediction(BaseModel):
    mode: str
    risk_level: str
    risk_score: float
    environmental_factors: EnvironmentalFactors
    source: str
    message: str