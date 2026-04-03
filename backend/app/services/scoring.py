"""Core scoring engine.

Replicates the Excel scorecard logic:
1. Grade each metric (A/B/C/D/F) using dynamic or manual thresholds
2. Compute per-channel weighted scores (grade points * weight)
3. Compute overall channel score (weighted by availability distribution)
4. Compute non-channel score ((Productivity grade + QA grade) / 2 * 100)
5. Compute final score (channel * weight + non-channel * weight)
6. Assign final grade (A>=90, B>=80, C>=70, D>=60, F<60)
7. Rank agents with tiebreakers (QA then Productivity)
8. Calculate PFP payouts
"""
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Agent, AgentPeriodScore, DynamicGradeScale,
    ManualGradeThreshold, MetricDefinition, PerformanceRecord,
    PfpConfig, ScorecardMetric, ScorecardTemplate,
)
from app.services.grade_scales import (
    assign_grade, compute_dynamic_thresholds,
    grade_to_non_channel_score, grade_to_points,
)


def _get_metric_records(
    db: Session, period_id: uuid.UUID, template: ScorecardTemplate
) -> dict[uuid.UUID, dict[uuid.UUID, PerformanceRecord]]:
    """Returns {agent_id: {scorecard_metric_id: record}}"""
    metric_ids = [sm.id for sm in template.metrics]
    records = db.scalars(
        select(PerformanceRecord).where(
            PerformanceRecord.scoring_period_id == period_id,
            PerformanceRecord.scorecard_metric_id.in_(metric_ids),
        )
    ).all()

    result: dict[uuid.UUID, dict[uuid.UUID, PerformanceRecord]] = {}
    for r in records:
        result.setdefault(r.agent_id, {})[r.scorecard_metric_id] = r
    return result


def _compute_dynamic_scales(
    db: Session, period_id: uuid.UUID, template: ScorecardTemplate,
    agent_records: dict[uuid.UUID, dict[uuid.UUID, PerformanceRecord]],
) -> dict[uuid.UUID, dict]:
    """Compute and store dynamic grade scales for each scored metric."""
    scales: dict[uuid.UUID, dict] = {}

    for sm in template.metrics:
        if not sm.include_in_score or sm.grade_mode != "dynamic":
            continue

        metric_def = sm.metric
        # Collect all agent values for this metric
        values = []
        for agent_recs in agent_records.values():
            rec = agent_recs.get(sm.id)
            if rec:
                values.append(float(rec.actual_value))

        if not values:
            continue

        thresholds = compute_dynamic_thresholds(
            values,
            metric_def.direction,
            template.outlier_method,
            float(template.iqr_multiplier),
        )
        scales[sm.id] = thresholds

        # Persist
        existing = db.scalar(
            select(DynamicGradeScale).where(
                DynamicGradeScale.scoring_period_id == period_id,
                DynamicGradeScale.scorecard_metric_id == sm.id,
            )
        )
        if existing:
            for k, v in thresholds.items():
                setattr(existing, k, v)
        else:
            db.add(DynamicGradeScale(
                scoring_period_id=period_id,
                scorecard_metric_id=sm.id,
                **thresholds,
            ))

    return scales


def _get_thresholds(sm: ScorecardMetric, dynamic_scales: dict[uuid.UUID, dict]) -> dict | None:
    """Get thresholds for a metric (dynamic or manual)."""
    if sm.grade_mode == "manual" and sm.manual_thresholds:
        mt = sm.manual_thresholds
        return {
            "grade_a": float(mt.grade_a),
            "grade_b": float(mt.grade_b),
            "grade_c": float(mt.grade_c),
            "grade_d": float(mt.grade_d),
        }
    return dynamic_scales.get(sm.id)


def _compute_channel_score(
    grades: list[tuple[str, float]],
) -> float | None:
    """Compute weighted channel score from (grade, weight_pct) pairs.

    Uses grade points: A=4, B=3, C=2, D=1, F=0
    Normalized to 0-100 scale: (weighted_sum / 4) * 100
    """
    if not grades:
        return None
    total_weight = sum(w for _, w in grades)
    if total_weight == 0:
        return None
    weighted_sum = sum(grade_to_points(g) * w for g, w in grades)
    gpa = weighted_sum / total_weight  # 0-4 scale
    return round((gpa / 4) * 100, 2)  # normalize to 0-100


def calculate_scores(db: Session, period_id: uuid.UUID, template_id: uuid.UUID) -> int:
    """Run the full scoring engine for a period. Returns number of agents scored."""
    import logging
    log = logging.getLogger(__name__)

    template = db.get(ScorecardTemplate, template_id)
    if not template:
        raise ValueError("Template not found")

    # Eagerly load metric relationships
    for sm in template.metrics:
        _ = sm.metric
        _ = sm.manual_thresholds

    log.warning(f"[SCORING] Template '{template.name}' has {len(template.metrics)} metrics")
    scored_metrics = [sm for sm in template.metrics if sm.include_in_score]
    log.warning(f"[SCORING] Of those, {len(scored_metrics)} have include_in_score=True")

    agent_records = _get_metric_records(db, period_id, template)
    log.warning(f"[SCORING] Found records for {len(agent_records)} agents")
    if not agent_records:
        return 0

    # Step 0: Evaluate custom metric formulas and create derived records
    _evaluate_custom_metrics(db, period_id, template, agent_records)

    # Step 1: Compute dynamic grade scales
    dynamic_scales = _compute_dynamic_scales(db, period_id, template, agent_records)
    log.warning(f"[SCORING] Dynamic scales computed for {len(dynamic_scales)} metrics")
    log.warning(f"[SCORING] Template weights: channel={float(template.channel_weight)}%, non_channel={float(template.non_channel_weight)}%")

    # Build lookup: scorecard_metric_id -> ScorecardMetric
    sm_lookup: dict[uuid.UUID, ScorecardMetric] = {sm.id: sm for sm in template.metrics}

    # PFP config
    pfp_config = db.scalar(select(PfpConfig).where(PfpConfig.template_id == template_id))
    pfp_rates = {}
    if pfp_config:
        pfp_rates = {
            "A": float(pfp_config.grade_a_rate),
            "B": float(pfp_config.grade_b_rate),
            "C": float(pfp_config.grade_c_rate),
            "D": float(pfp_config.grade_d_rate),
            "F": float(pfp_config.grade_f_rate),
        }
    max_rate = pfp_rates.get("A", 0)

    # Step 2: Grade each agent's metrics and compute scores
    agent_scores: list[dict[str, Any]] = []

    for agent_id, recs in agent_records.items():
        # Grade individual metrics
        channel_grades: dict[str, list[tuple[str, float]]] = {
            "voice": [], "chat": [], "email": [],
        }
        non_channel_grades: list[tuple[str, float]] = []  # (grade, weight)
        strengths = []
        opportunities = []

        for sm_id, rec in recs.items():
            sm = sm_lookup.get(sm_id)
            if not sm or not sm.include_in_score:
                continue

            metric_def = sm.metric
            thresholds = _get_thresholds(sm, dynamic_scales)
            if not thresholds:
                continue

            value = float(rec.actual_value)
            grade = assign_grade(value, metric_def.direction, thresholds)
            points = grade_to_points(grade)

            # Update record
            rec.metric_grade = grade
            rec.metric_points = Decimal(str(points))

            # Categorize
            channel = metric_def.channel
            if channel in ("voice", "chat", "email"):
                channel_grades[channel].append((grade, float(sm.weight)))
            elif channel == "non_channel":
                non_channel_grades.append((grade, float(sm.weight)))

            # Strength/opportunity tracking (compare to mean)
            mean = thresholds.get("mean")
            if mean and mean != 0:
                delta_pct = ((value - mean) / abs(mean)) * 100
                entry = {"metric": metric_def.name, "value": round(value, 2), "delta_pct": round(delta_pct, 1)}
                if metric_def.direction == "higher_better":
                    if value > mean:
                        strengths.append(entry)
                    elif value < mean:
                        opportunities.append(entry)
                else:
                    if value < mean:
                        strengths.append(entry)
                    elif value > mean:
                        opportunities.append(entry)

        # Channel scores
        voice_score = _compute_channel_score(channel_grades["voice"])
        chat_score = _compute_channel_score(channel_grades["chat"])
        email_score = _compute_channel_score(channel_grades["email"])

        # Availability-based channel weighting
        # Look up availability times from context metrics
        voice_avail = _get_context_value(recs, sm_lookup, "voice_avail_time")
        chat_avail = _get_context_value(recs, sm_lookup, "chat_avail_time")
        email_avail = _get_context_value(recs, sm_lookup, "email_avail_time")
        total_avail = voice_avail + chat_avail + email_avail

        # If no availability data, use equal weighting across active channels
        if total_avail > 0:
            voice_pct = voice_avail / total_avail
            chat_pct = chat_avail / total_avail
            email_pct = email_avail / total_avail
        else:
            active_channels = sum(1 for s in [voice_score, chat_score, email_score] if s is not None)
            if active_channels > 0:
                voice_pct = (1.0 / active_channels) if voice_score is not None else 0
                chat_pct = (1.0 / active_channels) if chat_score is not None else 0
                email_pct = (1.0 / active_channels) if email_score is not None else 0
            else:
                voice_pct = chat_pct = email_pct = 0

        # Overall channel score (weighted by availability or equal weight)
        overall_channel = None
        if any(s is not None for s in [voice_score, chat_score, email_score]):
            parts = []
            if voice_score is not None:
                parts.append(voice_score * voice_pct)
            if chat_score is not None:
                parts.append(chat_score * chat_pct)
            if email_score is not None:
                parts.append(email_score * email_pct)
            weight_sum = (voice_pct if voice_score is not None else 0) + \
                         (chat_pct if chat_score is not None else 0) + \
                         (email_pct if email_score is not None else 0)
            overall_channel = round(sum(parts) / weight_sum, 2) if weight_sum > 0 else None

        # Non-channel score (weighted like channel scores)
        non_channel_score = _compute_channel_score(non_channel_grades)

        # Final score
        ch_weight = float(template.channel_weight) / 100
        nc_weight = float(template.non_channel_weight) / 100
        final_score = None

        if overall_channel is not None and non_channel_score is not None:
            # Both exist — use configured weights (if both are 0, split evenly)
            if ch_weight + nc_weight > 0:
                final_score = round(overall_channel * ch_weight + non_channel_score * nc_weight, 2)
            else:
                final_score = round((overall_channel + non_channel_score) / 2, 2)
        elif non_channel_score is not None:
            # Only non-channel exists — use it as the final score
            final_score = round(non_channel_score, 2)
        elif overall_channel is not None:
            # Only channel exists — use it as the final score
            final_score = round(overall_channel, 2)

        # Final grade (matches Excel: A>=90, B>=75, C>=60, D>=40, F<40)
        final_grade = None
        if final_score is not None:
            if final_score >= 90:
                final_grade = "A"
            elif final_score >= 75:
                final_grade = "B"
            elif final_score >= 60:
                final_grade = "C"
            elif final_score >= 40:
                final_grade = "D"
            else:
                final_grade = "F"

        # Logged hours (from total_logged_time metric, converted from seconds)
        logged_seconds = _get_context_value(recs, sm_lookup, "total_logged_time")
        logged_hours = round(logged_seconds / 3600, 2) if logged_seconds > 0 else 0

        # PFP
        pfp_rate = pfp_rates.get(final_grade, 0) if final_grade else 0
        pfp_payout = round(pfp_rate * logged_hours, 2)
        pfp_max = round(max_rate * logged_hours, 2)
        pfp_money_left = round(pfp_max - pfp_payout, 2)

        # Sort strengths/opportunities by magnitude
        strengths.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)
        opportunities.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)

        # QA and productivity raw values for tiebreaking
        qa_raw = _get_context_value(recs, sm_lookup, "qa_score_pct")
        prod_raw = _get_context_value(recs, sm_lookup, "productivity_pct")

        if len(agent_scores) == 0:
            log.warning(f"[SCORING] First agent: channel_grades={{{k}: {len(v)} for k, v in channel_grades.items()}}}, "
                        f"non_channel_grades={len(non_channel_grades)}, "
                        f"voice={voice_score}, chat={chat_score}, email={email_score}, "
                        f"overall_channel={overall_channel}, non_channel={non_channel_score}, "
                        f"final_score={final_score}, final_grade={final_grade}")

        agent_scores.append({
            "agent_id": agent_id,
            "voice_score": voice_score, "chat_score": chat_score, "email_score": email_score,
            "voice_pct": round(voice_pct, 4), "chat_pct": round(chat_pct, 4), "email_pct": round(email_pct, 4),
            "overall_channel_score": overall_channel,
            "non_channel_score": non_channel_score,
            "final_score": final_score, "final_grade": final_grade,
            "logged_hours": logged_hours,
            "pfp_rate": pfp_rate, "pfp_payout": pfp_payout,
            "pfp_max_payout": pfp_max, "pfp_money_left": pfp_money_left,
            "strengths": strengths[:5], "opportunities": opportunities[:5],
            "qa_raw": qa_raw, "prod_raw": prod_raw,
        })

    # Step 3: Rank (by final_score DESC, then QA DESC, then Productivity DESC)
    scored = [a for a in agent_scores if a["final_score"] is not None]
    scored.sort(key=lambda x: (-(x["final_score"] or 0), -(x["qa_raw"] or 0), -(x["prod_raw"] or 0)))

    for rank, entry in enumerate(scored, 1):
        entry["rank"] = rank

    # Step 4: Persist agent_period_scores
    for entry in agent_scores:
        existing = db.scalar(
            select(AgentPeriodScore).where(
                AgentPeriodScore.agent_id == entry["agent_id"],
                AgentPeriodScore.scoring_period_id == period_id,
            )
        )
        data = {
            "template_id": template_id,
            "voice_score": _to_decimal(entry["voice_score"]),
            "chat_score": _to_decimal(entry["chat_score"]),
            "email_score": _to_decimal(entry["email_score"]),
            "voice_pct": _to_decimal(entry["voice_pct"]),
            "chat_pct": _to_decimal(entry["chat_pct"]),
            "email_pct": _to_decimal(entry["email_pct"]),
            "overall_channel_score": _to_decimal(entry["overall_channel_score"]),
            "non_channel_score": _to_decimal(entry["non_channel_score"]),
            "final_score": _to_decimal(entry["final_score"]),
            "final_grade": entry["final_grade"],
            "rank": entry.get("rank"),
            "logged_hours": _to_decimal(entry["logged_hours"]),
            "pfp_rate": _to_decimal(entry["pfp_rate"]),
            "pfp_payout": _to_decimal(entry["pfp_payout"]),
            "pfp_max_payout": _to_decimal(entry["pfp_max_payout"]),
            "pfp_money_left": _to_decimal(entry["pfp_money_left"]),
            "strengths": entry["strengths"],
            "opportunities": entry["opportunities"],
        }
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            db.add(AgentPeriodScore(
                agent_id=entry["agent_id"],
                scoring_period_id=period_id,
                **data,
            ))

    db.commit()
    return len(agent_scores)


def _evaluate_custom_metrics(
    db: Session, period_id: uuid.UUID, template: ScorecardTemplate,
    agent_records: dict[uuid.UUID, dict[uuid.UUID, PerformanceRecord]],
) -> None:
    """Evaluate custom metric formulas and create/update PerformanceRecords."""
    from app.services.formula import evaluate_formula, resolve_evaluation_order

    # Find custom metrics in the template
    custom_sms = []
    sm_lookup = {sm.id: sm for sm in template.metrics}

    for sm in template.metrics:
        metric_def = sm.metric
        if metric_def and metric_def.is_custom and metric_def.formula:
            custom_sms.append({
                "key": metric_def.key,
                "formula": metric_def.formula,
                "sm": sm,
                "metric_def": metric_def,
            })

    if not custom_sms:
        return

    # Resolve evaluation order (handles dependencies between custom metrics)
    ordered = resolve_evaluation_order(custom_sms)

    # Build key->sm_id mapping for resolving metric references
    key_to_sm_id: dict[str, uuid.UUID] = {}
    for sm in template.metrics:
        if sm.metric:
            key_to_sm_id[sm.metric.key] = sm.id

    # Evaluate for each agent
    for agent_id, recs in agent_records.items():
        # Build current values dict from existing records
        values: dict[str, float] = {}
        for sm_id, rec in recs.items():
            sm = sm_lookup.get(sm_id)
            if sm and sm.metric:
                values[sm.metric.key] = float(rec.actual_value)

        # Evaluate each custom metric in dependency order
        for item in ordered:
            result = evaluate_formula(item["formula"], values)
            if result is None:
                continue

            sm = item["sm"]
            values[item["key"]] = result  # Make available to subsequent formulas

            # Create or update the performance record
            existing_rec = recs.get(sm.id)
            if existing_rec:
                existing_rec.actual_value = Decimal(str(round(result, 6)))
            else:
                new_rec = PerformanceRecord(
                    agent_id=agent_id,
                    scoring_period_id=period_id,
                    scorecard_metric_id=sm.id,
                    actual_value=Decimal(str(round(result, 6))),
                )
                db.add(new_rec)
                db.flush()
                recs[sm.id] = new_rec


def _get_context_value(
    recs: dict[uuid.UUID, PerformanceRecord],
    sm_lookup: dict[uuid.UUID, ScorecardMetric],
    metric_key: str,
) -> float:
    """Get a metric value by key from an agent's records."""
    for sm_id, rec in recs.items():
        sm = sm_lookup.get(sm_id)
        if sm and sm.metric and sm.metric.key == metric_key:
            return float(rec.actual_value)
    return 0.0


def _to_decimal(val: float | int | None) -> Decimal | None:
    if val is None:
        return None
    return Decimal(str(val))
