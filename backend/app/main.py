from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.satellite_db import router as satellite_db_router
from app.api.health import router as health_router
from app.api.satellite import router as satellite_router
from app.api.flood import router as flood_router
from app.api.risk import router as risk_router
from app.api.analytics import router as analytics_router
from app.api.compare import router as compare_router
from app.api.sar_flood import router as sar_flood_router
from app.api.sar_data import router as sar_data_router
from app.api.database import router as database_router
from app.api.flood_db import router as flood_db_router
from app.api.risk_db import router as risk_db_router
from app.api.flood_regions_db import router as flood_regions_db_router
from app.api.historical_db import router as historical_db_router
from app.api.alerts_db import router as alerts_db_router
from app.api.reports import router as reports_router
from app.api.sar_pipeline import router as sar_pipeline_router
from app.api.sentinel1 import router as sentinel1_router
from app.api.sentinel1_download import router as sentinel1_download_router
from app.api.cdse_auth import router as cdse_auth_router



app = FastAPI(
    title="EarthWatch AI",
    description=(
        "AI-Powered Satellite Flood Intelligence "
        "& Risk Prediction System"
    ),
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(health_router, prefix="/api")
app.include_router(satellite_router, prefix="/api")
app.include_router(flood_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(compare_router, prefix="/api")
app.include_router(sar_flood_router, prefix="/api")
app.include_router(sar_data_router, prefix="/api")
app.include_router(database_router, prefix="/api")
app.include_router(satellite_db_router, prefix="/api")
app.include_router(flood_db_router, prefix="/api")
app.include_router(risk_db_router, prefix="/api")
app.include_router(flood_regions_db_router, prefix="/api")
app.include_router(historical_db_router, prefix="/api")
app.include_router(alerts_db_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(sar_pipeline_router, prefix="/api")
app.include_router(sentinel1_router, prefix="/api")
app.include_router(sentinel1_download_router, prefix="/api")
app.include_router(cdse_auth_router, prefix="/api")



@app.get("/")
def home():
    return {
        "message": "Welcome to EarthWatch AI Backend",
        "status": "running",
        "version": "1.0.0"
    }