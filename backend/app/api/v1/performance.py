import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScorecardTemplate, ScoringPeriod
from app.services.import_service import execute_import, parse_csv, parse_excel, validate_import
from app.services.scoring import calculate_scores

router = APIRouter(prefix="/performance", tags=["performance"])


# --- Scoring Periods ---

@router.get("/periods")
def list_periods(company_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(ScoringPeriod).order_by(ScoringPeriod.start_date.desc())
    if company_id:
        stmt = stmt.where(ScoringPeriod.company_id == company_id)
    return db.scalars(stmt).all()


@router.post("/periods", status_code=201)
def create_period(
    company_id: uuid.UUID,
    label: str,
    period_type: str,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    period = ScoringPeriod(
        company_id=company_id,
        label=label,
        period_type=period_type,
        start_date=date_type.fromisoformat(start_date),
        end_date=date_type.fromisoformat(end_date),
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


# --- Data Import ---

@router.post("/import/validate")
async def validate_upload(
    file: UploadFile,
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or ""

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = parse_excel(content)
    else:
        df = parse_csv(content)

    result = validate_import(db, df, template_id)
    return result


@router.post("/import/execute")
async def execute_upload(
    file: UploadFile,
    template_id: uuid.UUID,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or ""

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = parse_excel(content)
    else:
        df = parse_csv(content)

    count = execute_import(db, df, template_id, period_id)
    return {"records_imported": count}


# --- Scoring ---

@router.post("/calculate/{period_id}")
def run_scoring(period_id: uuid.UUID, template_id: uuid.UUID, db: Session = Depends(get_db)):
    period = db.get(ScoringPeriod, period_id)
    if not period:
        raise HTTPException(404, "Period not found")
    template = db.get(ScorecardTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    count = calculate_scores(db, period_id, template_id)
    return {"agents_scored": count, "period_id": str(period_id)}
