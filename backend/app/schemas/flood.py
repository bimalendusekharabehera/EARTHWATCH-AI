from pydantic import BaseModel
from typing import List, Dict, Any


class FloodDetection(BaseModel):
    mode: str
    status: str
    confidence: float
    flooded_area_km2: float
    affected_regions: List[str]
    source: str
    message: str
    boundaries: Dict[str, Any]