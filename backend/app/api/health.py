from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "project": "EarthWatch AI",
        "message": "Backend is running successfully"
    }