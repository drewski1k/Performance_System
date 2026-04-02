import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.database import get_db
from app.services.export_service import export_scorecard_excel
from app.services.strength_opportunity import get_strengths_opportunities

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/strengths-opportunities")
def strengths_opportunities(
    level: str,
    entity_id: uuid.UUID,
    period_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return get_strengths_opportunities(db, level, entity_id, period_id)


@router.get("/export/excel")
def export_excel(period_id: uuid.UUID, db: Session = Depends(get_db)):
    data = export_scorecard_excel(db, period_id)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=scorecard_export.xlsx"},
    )
