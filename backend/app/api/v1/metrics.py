import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MetricDefinition
from app.schemas.metrics import MetricDefinitionCreate, MetricDefinitionOut

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/definitions", response_model=list[MetricDefinitionOut])
def list_metrics(channel: str | None = None, db: Session = Depends(get_db)):
    stmt = select(MetricDefinition).order_by(MetricDefinition.channel, MetricDefinition.name)
    if channel:
        stmt = stmt.where(MetricDefinition.channel == channel)
    return db.scalars(stmt).all()


@router.post("/definitions", response_model=MetricDefinitionOut, status_code=201)
def create_metric(data: MetricDefinitionCreate, db: Session = Depends(get_db)):
    metric = MetricDefinition(**data.model_dump())
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.get("/definitions/{metric_id}", response_model=MetricDefinitionOut)
def get_metric(metric_id: uuid.UUID, db: Session = Depends(get_db)):
    metric = db.get(MetricDefinition, metric_id)
    if not metric:
        raise HTTPException(404, "Metric not found")
    return metric


@router.put("/definitions/{metric_id}", response_model=MetricDefinitionOut)
def update_metric(metric_id: uuid.UUID, data: MetricDefinitionCreate, db: Session = Depends(get_db)):
    metric = db.get(MetricDefinition, metric_id)
    if not metric:
        raise HTTPException(404, "Metric not found")
    for field, value in data.model_dump().items():
        setattr(metric, field, value)
    db.commit()
    db.refresh(metric)
    return metric


from pydantic import BaseModel
from typing import Optional

class MetricDefinitionPatch(BaseModel):
    direction: Optional[str] = None
    name: Optional[str] = None
    channel: Optional[str] = None
    unit: Optional[str] = None


@router.patch("/definitions/{metric_id}", response_model=MetricDefinitionOut)
def patch_metric(metric_id: uuid.UUID, data: MetricDefinitionPatch, db: Session = Depends(get_db)):
    metric = db.get(MetricDefinition, metric_id)
    if not metric:
        raise HTTPException(404, "Metric not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(metric, field, value)
    db.commit()
    db.refresh(metric)
    return metric
