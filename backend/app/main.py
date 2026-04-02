from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed default metrics on startup
    try:
        from app.database import SessionLocal
        from app.seed.default_metrics import seed_default_metrics
        db = SessionLocal()
        try:
            added = seed_default_metrics(db)
            if added:
                print(f"Seeded {added} default metric definitions")
        finally:
            db.close()
    except Exception as e:
        print(f"Seed skipped (DB may not be ready): {e}")
    yield


app = FastAPI(
    title="Performance Management System",
    version="1.0.0",
    description="Call center performance scorecard with multi-level rollup",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
