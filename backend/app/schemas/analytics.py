from pydantic import BaseModel
from typing import List


class YearlyFloodData(BaseModel):
    year: int
    flooded_area_km2: float
    risk_level: str


class AnalyticsSummary(BaseModel):
    total_events: int
    total_flooded_area_km2: float
    highest_risk_year: int


class HistoricalAnalytics(BaseModel):
    mode: str
    source: str
    summary: AnalyticsSummary
    yearly_data: List[YearlyFloodData]