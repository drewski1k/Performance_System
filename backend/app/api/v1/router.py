from fastapi import APIRouter

from app.api.v1.hierarchy import router as hierarchy_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.scorecards import router as scorecards_router
from app.api.v1.performance import router as performance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.reports import router as reports_router

api_router = APIRouter()
api_router.include_router(hierarchy_router)
api_router.include_router(metrics_router)
api_router.include_router(scorecards_router)
api_router.include_router(performance_router)
api_router.include_router(dashboard_router)
api_router.include_router(reports_router)
