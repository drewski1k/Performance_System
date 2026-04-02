"""PDF and Excel export service."""
import io
import uuid
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agent, AgentPeriodScore, Supervisor


GRADE_FILLS = {
    "A": PatternFill(start_color="10B981", end_color="10B981", fill_type="solid"),
    "B": PatternFill(start_color="22C55E", end_color="22C55E", fill_type="solid"),
    "C": PatternFill(start_color="EAB308", end_color="EAB308", fill_type="solid"),
    "D": PatternFill(start_color="F97316", end_color="F97316", fill_type="solid"),
    "F": PatternFill(start_color="EF4444", end_color="EF4444", fill_type="solid"),
}


def export_scorecard_excel(
    db: Session, period_id: uuid.UUID, company_name: str = "Performance Report"
) -> bytes:
    """Generate Excel workbook with agent scorecard data."""
    scores = db.scalars(
        select(AgentPeriodScore)
        .where(AgentPeriodScore.scoring_period_id == period_id)
        .order_by(AgentPeriodScore.rank.asc().nullslast())
    ).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Scorecard"

    # Header
    headers = [
        "Rank", "Agent", "Employee ID", "Supervisor",
        "Final Score", "Final Grade",
        "Voice Score", "Chat Score", "Email Score", "Non-Channel Score",
        "Logged Hours", "PFP Rate", "PFP Payout", "Money Left on Table",
    ]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    # Data rows
    for row_idx, s in enumerate(scores, 2):
        agent = db.get(Agent, s.agent_id)
        supervisor = db.get(Supervisor, agent.supervisor_id) if agent else None

        values = [
            s.rank,
            f"{agent.first_name} {agent.last_name}" if agent else "",
            agent.employee_id if agent else "",
            f"{supervisor.first_name} {supervisor.last_name}" if supervisor else "",
            float(s.final_score) if s.final_score else None,
            s.final_grade,
            float(s.voice_score) if s.voice_score else None,
            float(s.chat_score) if s.chat_score else None,
            float(s.email_score) if s.email_score else None,
            float(s.non_channel_score) if s.non_channel_score else None,
            float(s.logged_hours) if s.logged_hours else None,
            float(s.pfp_rate) if s.pfp_rate else None,
            float(s.pfp_payout) if s.pfp_payout else None,
            float(s.pfp_money_left) if s.pfp_money_left else None,
        ]

        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col, value=val)

        # Color grade cell
        grade_cell = ws.cell(row=row_idx, column=6)
        if s.final_grade in GRADE_FILLS:
            grade_cell.fill = GRADE_FILLS[s.final_grade]
            grade_cell.font = Font(bold=True, color="FFFFFF")

    # Auto-width columns
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = 16

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
