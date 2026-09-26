from pydantic import BaseModel


class Location(BaseModel):
    name: str
    latitude: float
    longitude: float


class SatelliteData(BaseModel):
    mode: str
    source: str
    satellite: str
    sensor: str
    location: Location
    acquisition_date: str
    cloud_cover: float
    status: str