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


class CustomMetricCreate(BaseModel):
    name: str
    key: str
    formula: str
    channel: str = "non_channel"
    unit: str = "ratio"
    direction: str = "higher_better"
    description: Optional[str] = None


@router.post("/definitions/custom", response_model=MetricDefinitionOut, status_code=201)
def create_custom_metric(data: CustomMetricCreate, db: Session = Depends(get_db)):
    """Create a custom calculated metric with a formula."""
    from app.services.formula import validate_formula, extract_metric_keys

    # Validate key uniqueness
    existing = db.scalar(select(MetricDefinition).where(MetricDefinition.key == data.key))
    if existing:
        raise HTTPException(400, f"Metric key '{data.key}' already exists")

    # Validate formula
    all_keys = {m.key for m in db.scalars(select(MetricDefinition)).all()}
    errors = validate_formula(data.formula, all_keys)
    if errors:
        raise HTTPException(400, f"Invalid formula: {'; '.join(errors)}")

    metric = MetricDefinition(
        key=data.key,
        name=data.name,
        description=data.description or f"Custom: {data.formula}",
        channel=data.channel,
        unit=data.unit,
        direction=data.direction,
        is_default=False,
        is_custom=True,
        formula=data.formula,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


@router.get("/definitions/keys")
def list_metric_keys(db: Session = Depends(get_db)):
    """Return all metric keys (for formula autocomplete)."""
    metrics = db.scalars(
        select(MetricDefinition).order_by(MetricDefinition.channel, MetricDefinition.name)
    ).all()
    return [
        {"key": m.key, "name": m.name, "channel": m.channel}
        for m in metrics
    ]


@router.post("/definitions/{metric_id}/validate-formula")
def validate_metric_formula(metric_id: uuid.UUID, body: dict, db: Session = Depends(get_db)):
    """Validate a formula string against available metric keys."""
    from app.services.formula import validate_formula, extract_metric_keys

    formula = body.get("formula", "")
    all_keys = {m.key for m in db.scalars(select(MetricDefinition)).all()}
    errors = validate_formula(formula, all_keys)
    referenced = extract_metric_keys(formula)

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "referenced_keys": sorted(referenced),
    }
