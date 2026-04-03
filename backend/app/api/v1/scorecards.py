import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    ManualGradeThreshold, MetricDefinition, PfpConfig,
    ProductivityState, ScorecardMetric, ScorecardTemplate,
)
from app.schemas.scorecard import (
    PfpConfigOut, PfpConfigSchema,
    ProductivityStateOut, ProductivityStateSchema,
    ScorecardMetricOut, ScorecardTemplateCreate, ScorecardTemplateOut, ScorecardTemplateUpdate,
)

router = APIRouter(prefix="/scorecards", tags=["scorecards"])


def _template_to_out(template: ScorecardTemplate) -> ScorecardTemplateOut:
    metrics_out = []
    for sm in sorted(template.metrics, key=lambda m: m.sort_order):
        metric_def = sm.metric
        mt = sm.manual_thresholds
        metrics_out.append(ScorecardMetricOut(
            id=sm.id,
            metric_id=sm.metric_id,
            metric_key=metric_def.key if metric_def else "",
            metric_name=metric_def.name if metric_def else "",
            metric_display_name=metric_def.display_name if metric_def else None,
            channel=(metric_def.channel or "") if metric_def else "",
            direction=metric_def.direction if metric_def else "",
            unit=metric_def.unit if metric_def else "",
            weight=sm.weight,
            include_in_score=sm.include_in_score,
            show_on_scorecard=sm.show_on_scorecard,
            min_threshold=sm.min_threshold,
            threshold_basis=sm.threshold_basis,
            grade_mode=sm.grade_mode,
            sort_order=sm.sort_order,
            manual_thresholds={"grade_a": mt.grade_a, "grade_b": mt.grade_b, "grade_c": mt.grade_c, "grade_d": mt.grade_d} if mt else None,
        ))
    return ScorecardTemplateOut(
        id=template.id,
        company_id=template.company_id,
        name=template.name,
        period_type=template.period_type,
        channel_weight=template.channel_weight,
        non_channel_weight=template.non_channel_weight,
        outlier_method=template.outlier_method,
        iqr_multiplier=template.iqr_multiplier,
        is_active=template.is_active,
        metrics=metrics_out,
    )


def _load_template(db: Session, template_id: uuid.UUID) -> ScorecardTemplate:
    template = db.scalar(
        select(ScorecardTemplate)
        .options(
            selectinload(ScorecardTemplate.metrics)
            .selectinload(ScorecardMetric.metric),
            selectinload(ScorecardTemplate.metrics)
            .selectinload(ScorecardMetric.manual_thresholds),
        )
        .where(ScorecardTemplate.id == template_id)
    )
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.get("/templates", response_model=list[ScorecardTemplateOut])
def list_templates(company_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    stmt = (
        select(ScorecardTemplate)
        .options(
            selectinload(ScorecardTemplate.metrics).selectinload(ScorecardMetric.metric),
            selectinload(ScorecardTemplate.metrics).selectinload(ScorecardMetric.manual_thresholds),
        )
        .order_by(ScorecardTemplate.name)
    )
    if company_id:
        stmt = stmt.where(ScorecardTemplate.company_id == company_id)
    templates = db.scalars(stmt).all()
    return [_template_to_out(t) for t in templates]


@router.post("/templates", response_model=ScorecardTemplateOut, status_code=201)
def create_template(data: ScorecardTemplateCreate, db: Session = Depends(get_db)):
    template = ScorecardTemplate(
        company_id=data.company_id,
        name=data.name,
        period_type=data.period_type,
        channel_weight=data.channel_weight,
        non_channel_weight=data.non_channel_weight,
        outlier_method=data.outlier_method,
        iqr_multiplier=data.iqr_multiplier,
    )
    db.add(template)
    db.flush()

    for mc in data.metrics:
        if not db.get(MetricDefinition, mc.metric_id):
            raise HTTPException(400, f"Metric {mc.metric_id} not found")
        sm = ScorecardMetric(
            template_id=template.id,
            metric_id=mc.metric_id,
            weight=mc.weight,
            include_in_score=mc.include_in_score,
            show_on_scorecard=mc.show_on_scorecard,
            min_threshold=mc.min_threshold,
            threshold_basis=mc.threshold_basis,
            grade_mode=mc.grade_mode,
            sort_order=mc.sort_order,
        )
        db.add(sm)
        db.flush()
        if mc.manual_thresholds:
            db.add(ManualGradeThreshold(
                scorecard_metric_id=sm.id,
                grade_a=mc.manual_thresholds.grade_a,
                grade_b=mc.manual_thresholds.grade_b,
                grade_c=mc.manual_thresholds.grade_c,
                grade_d=mc.manual_thresholds.grade_d,
            ))

    db.commit()
    return _template_to_out(_load_template(db, template.id))


@router.get("/templates/{template_id}", response_model=ScorecardTemplateOut)
def get_template(template_id: uuid.UUID, db: Session = Depends(get_db)):
    return _template_to_out(_load_template(db, template_id))


@router.put("/templates/{template_id}", response_model=ScorecardTemplateOut)
def update_template(template_id: uuid.UUID, data: ScorecardTemplateUpdate, db: Session = Depends(get_db)):
    template = _load_template(db, template_id)

    for field in ["name", "period_type", "channel_weight", "non_channel_weight", "outlier_method", "iqr_multiplier", "is_active"]:
        value = getattr(data, field, None)
        if value is not None:
            setattr(template, field, value)

    if data.metrics is not None:
        # Update existing metrics in place to preserve IDs (PerformanceRecords reference them)
        existing_by_metric_id = {sm.metric_id: sm for sm in template.metrics}
        incoming_metric_ids = {mc.metric_id for mc in data.metrics}

        # Delete metrics that are no longer in the list
        for sm in template.metrics:
            if sm.metric_id not in incoming_metric_ids:
                db.delete(sm)
        db.flush()

        for mc in data.metrics:
            existing_sm = existing_by_metric_id.get(mc.metric_id)
            if existing_sm:
                # Update in place — preserves the ScorecardMetric ID
                existing_sm.weight = mc.weight
                existing_sm.include_in_score = mc.include_in_score
                existing_sm.show_on_scorecard = mc.show_on_scorecard
                existing_sm.min_threshold = mc.min_threshold
                existing_sm.threshold_basis = mc.threshold_basis
                existing_sm.grade_mode = mc.grade_mode
                existing_sm.sort_order = mc.sort_order
                sm = existing_sm
            else:
                # New metric — create fresh
                sm = ScorecardMetric(
                    template_id=template.id,
                    metric_id=mc.metric_id,
                    weight=mc.weight,
                    include_in_score=mc.include_in_score,
                    show_on_scorecard=mc.show_on_scorecard,
                    min_threshold=mc.min_threshold,
                    threshold_basis=mc.threshold_basis,
                    grade_mode=mc.grade_mode,
                    sort_order=mc.sort_order,
                )
                db.add(sm)
                db.flush()

            # Handle manual thresholds
            if mc.manual_thresholds:
                if sm.manual_thresholds:
                    sm.manual_thresholds.grade_a = mc.manual_thresholds.grade_a
                    sm.manual_thresholds.grade_b = mc.manual_thresholds.grade_b
                    sm.manual_thresholds.grade_c = mc.manual_thresholds.grade_c
                    sm.manual_thresholds.grade_d = mc.manual_thresholds.grade_d
                else:
                    db.add(ManualGradeThreshold(
                        scorecard_metric_id=sm.id,
                        grade_a=mc.manual_thresholds.grade_a,
                        grade_b=mc.manual_thresholds.grade_b,
                        grade_c=mc.manual_thresholds.grade_c,
                        grade_d=mc.manual_thresholds.grade_d,
                    ))
            elif sm.manual_thresholds:
                db.delete(sm.manual_thresholds)

    db.commit()
    return _template_to_out(_load_template(db, template.id))


# --- Productivity States ---

@router.get("/templates/{template_id}/productivity-states", response_model=list[ProductivityStateOut])
def list_productivity_states(template_id: uuid.UUID, db: Session = Depends(get_db)):
    states = db.scalars(
        select(ProductivityState).where(ProductivityState.template_id == template_id).order_by(ProductivityState.state_name)
    ).all()
    return states


@router.put("/templates/{template_id}/productivity-states", response_model=list[ProductivityStateOut])
def update_productivity_states(template_id: uuid.UUID, states: list[ProductivityStateSchema], db: Session = Depends(get_db)):
    if not db.get(ScorecardTemplate, template_id):
        raise HTTPException(404, "Template not found")
    # Replace all states
    db.execute(
        select(ProductivityState).where(ProductivityState.template_id == template_id)
    )
    existing = db.scalars(select(ProductivityState).where(ProductivityState.template_id == template_id)).all()
    for s in existing:
        db.delete(s)
    db.flush()

    new_states = []
    for s in states:
        ps = ProductivityState(
            template_id=template_id,
            state_name=s.state_name,
            state_type=s.state_type,
            is_productive=s.is_productive,
            category=s.category,
        )
        db.add(ps)
        new_states.append(ps)
    db.commit()
    for ps in new_states:
        db.refresh(ps)
    return new_states


# --- PFP Config ---

def _pfp_to_out(config: PfpConfig) -> dict:
    """Convert PfpConfig to response dict with hours_metric_name."""
    from app.models import MetricDefinition
    data = {
        "id": config.id,
        "template_id": config.template_id,
        "grade_a_rate": config.grade_a_rate,
        "grade_b_rate": config.grade_b_rate,
        "grade_c_rate": config.grade_c_rate,
        "grade_d_rate": config.grade_d_rate,
        "grade_f_rate": config.grade_f_rate,
        "hours_metric_id": config.hours_metric_id,
        "hours_unit": config.hours_unit or "seconds",
        "hours_metric_name": None,
    }
    if config.hours_metric:
        data["hours_metric_name"] = config.hours_metric.display_name or config.hours_metric.name
    return data


@router.get("/templates/{template_id}/pfp")
def get_pfp_config(template_id: uuid.UUID, db: Session = Depends(get_db)):
    config = db.scalar(select(PfpConfig).where(PfpConfig.template_id == template_id))
    if not config:
        return None
    return _pfp_to_out(config)


@router.put("/templates/{template_id}/pfp")
def update_pfp_config(template_id: uuid.UUID, data: PfpConfigSchema, db: Session = Depends(get_db)):
    if not db.get(ScorecardTemplate, template_id):
        raise HTTPException(404, "Template not found")
    config = db.scalar(select(PfpConfig).where(PfpConfig.template_id == template_id))
    if config:
        for field, value in data.model_dump().items():
            setattr(config, field, value)
    else:
        config = PfpConfig(template_id=template_id, **data.model_dump())
        db.add(config)
    db.commit()
    db.refresh(config)
    return _pfp_to_out(config)
