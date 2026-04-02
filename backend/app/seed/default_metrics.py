"""Pre-seed call center metric definitions matching the Excel Config sheet."""
from sqlalchemy.orm import Session

from app.models.metric_definition import MetricDefinition

DEFAULT_METRICS = [
    # Voice channel
    {"key": "voice_acceptance_rate", "name": "Acceptance Rate - Voice", "channel": "voice", "unit": "percent", "direction": "higher_better"},
    {"key": "voice_fulfillment_rate", "name": "Fulfillment Rate - Voice", "channel": "voice", "unit": "percent", "direction": "higher_better"},
    {"key": "voice_aht", "name": "Avg Handle Time - Voice", "channel": "voice", "unit": "seconds", "direction": "lower_better"},
    {"key": "voice_cph", "name": "Contacts Per Hour - Voice", "channel": "voice", "unit": "count", "direction": "higher_better"},
    {"key": "voice_avail_time", "name": "Available Time - Voice", "channel": "voice", "unit": "seconds", "direction": "higher_better"},
    {"key": "voice_offered", "name": "Contact Offered - Voice", "channel": "voice", "unit": "count", "direction": "higher_better"},
    {"key": "voice_accepted", "name": "Contact Accepted - Voice", "channel": "voice", "unit": "count", "direction": "higher_better"},
    {"key": "voice_declined", "name": "Contact Declined - Voice", "channel": "voice", "unit": "count", "direction": "lower_better"},
    {"key": "voice_missed", "name": "Contact Missed - Voice", "channel": "voice", "unit": "count", "direction": "lower_better"},
    {"key": "voice_fulfilled", "name": "Contact Fulfilled - Voice", "channel": "voice", "unit": "count", "direction": "higher_better"},
    {"key": "voice_handle_time", "name": "Handle Time - Voice", "channel": "voice", "unit": "seconds", "direction": "lower_better"},
    {"key": "voice_acw", "name": "After Contact Time - Voice", "channel": "voice", "unit": "seconds", "direction": "lower_better"},
    {"key": "voice_avail_pct", "name": "Avail % - Voice", "channel": "voice", "unit": "percent", "direction": "higher_better"},
    # Chat channel
    {"key": "chat_acceptance_rate", "name": "Acceptance Rate - Chat", "channel": "chat", "unit": "percent", "direction": "higher_better"},
    {"key": "chat_fulfillment_rate", "name": "Fulfillment Rate - Chat", "channel": "chat", "unit": "percent", "direction": "higher_better"},
    {"key": "chat_aht", "name": "Avg Handle Time - Chat", "channel": "chat", "unit": "seconds", "direction": "lower_better"},
    {"key": "chat_cph", "name": "Contacts Per Hour - Chat", "channel": "chat", "unit": "count", "direction": "higher_better"},
    {"key": "chat_avail_time", "name": "Available Time - Chat", "channel": "chat", "unit": "seconds", "direction": "higher_better"},
    {"key": "chat_offered", "name": "Contact Offered - Chat", "channel": "chat", "unit": "count", "direction": "higher_better"},
    {"key": "chat_accepted", "name": "Contact Accepted - Chat", "channel": "chat", "unit": "count", "direction": "higher_better"},
    {"key": "chat_declined", "name": "Contact Declined - Chat", "channel": "chat", "unit": "count", "direction": "lower_better"},
    {"key": "chat_missed", "name": "Contact Missed - Chat", "channel": "chat", "unit": "count", "direction": "lower_better"},
    {"key": "chat_fulfilled", "name": "Contact Fulfilled - Chat", "channel": "chat", "unit": "count", "direction": "higher_better"},
    {"key": "chat_handle_time", "name": "Handle Time - Chat", "channel": "chat", "unit": "seconds", "direction": "lower_better"},
    {"key": "chat_acw", "name": "After Contact Time - Chat", "channel": "chat", "unit": "seconds", "direction": "lower_better"},
    {"key": "chat_avail_pct", "name": "Avail % - Chat", "channel": "chat", "unit": "percent", "direction": "higher_better"},
    # Email channel
    {"key": "email_acceptance_rate", "name": "Acceptance Rate - Email", "channel": "email", "unit": "percent", "direction": "higher_better"},
    {"key": "email_fulfillment_rate", "name": "Fulfillment Rate - Email", "channel": "email", "unit": "percent", "direction": "higher_better"},
    {"key": "email_aht", "name": "Avg Handle Time - Email", "channel": "email", "unit": "seconds", "direction": "lower_better"},
    {"key": "email_cph", "name": "Contacts Per Hour - Email", "channel": "email", "unit": "count", "direction": "higher_better"},
    {"key": "email_avail_time", "name": "Available Time - Email", "channel": "email", "unit": "seconds", "direction": "higher_better"},
    {"key": "email_offered", "name": "Contact Offered - Email", "channel": "email", "unit": "count", "direction": "higher_better"},
    {"key": "email_accepted", "name": "Contact Accepted - Email", "channel": "email", "unit": "count", "direction": "higher_better"},
    {"key": "email_fulfilled", "name": "Contact Fulfilled - Email", "channel": "email", "unit": "count", "direction": "higher_better"},
    {"key": "email_handle_time", "name": "Handle Time - Email", "channel": "email", "unit": "seconds", "direction": "lower_better"},
    {"key": "email_acw", "name": "After Contact Time - Email", "channel": "email", "unit": "seconds", "direction": "lower_better"},
    {"key": "email_avail_pct", "name": "Avail % - Email", "channel": "email", "unit": "percent", "direction": "higher_better"},
    # SMS channel
    {"key": "sms_offered", "name": "Contact Offered - SMS", "channel": "sms", "unit": "count", "direction": "higher_better"},
    {"key": "sms_accepted", "name": "Contact Accepted - SMS", "channel": "sms", "unit": "count", "direction": "higher_better"},
    {"key": "sms_declined", "name": "Contact Declined - SMS", "channel": "sms", "unit": "count", "direction": "lower_better"},
    {"key": "sms_missed", "name": "Contact Missed - SMS", "channel": "sms", "unit": "count", "direction": "lower_better"},
    {"key": "sms_fulfilled", "name": "Contact Fulfilled - SMS", "channel": "sms", "unit": "count", "direction": "higher_better"},
    {"key": "sms_acceptance_rate", "name": "Acceptance Rate - SMS", "channel": "sms", "unit": "percent", "direction": "higher_better"},
    {"key": "sms_fulfillment_rate", "name": "Fulfillment Rate - SMS", "channel": "sms", "unit": "percent", "direction": "higher_better"},
    {"key": "sms_handle_time", "name": "Handle Time - SMS", "channel": "sms", "unit": "seconds", "direction": "lower_better"},
    {"key": "sms_aht", "name": "Avg Handle Time - SMS", "channel": "sms", "unit": "seconds", "direction": "lower_better"},
    {"key": "sms_acw", "name": "After Contact Time - SMS", "channel": "sms", "unit": "seconds", "direction": "lower_better"},
    # Non-channel metrics
    {"key": "occupancy_pct", "name": "Occupancy %", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
    {"key": "active_time_pct", "name": "Active Time %", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
    {"key": "total_contact_volume", "name": "Total Contact Volume", "channel": "non_channel", "unit": "count", "direction": "higher_better"},
    {"key": "overall_aht", "name": "Avg Handle Time - Overall", "channel": "non_channel", "unit": "seconds", "direction": "lower_better"},
    {"key": "away_time_pct", "name": "Away Time %", "channel": "non_channel", "unit": "percent", "direction": "lower_better"},
    {"key": "total_logged_time", "name": "Total Logged Time", "channel": "non_channel", "unit": "seconds", "direction": "higher_better"},
    {"key": "total_active_time", "name": "Total Active Time", "channel": "non_channel", "unit": "seconds", "direction": "higher_better"},
    {"key": "overall_acceptance_rate", "name": "Overall Acceptance Rate", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
    {"key": "overall_fulfillment_rate", "name": "Overall Fulfillment Rate", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
    {"key": "productivity_pct", "name": "Productivity %", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
    {"key": "total_evaluations", "name": "Total Evaluations", "channel": "non_channel", "unit": "count", "direction": "higher_better"},
    {"key": "qa_score_pct", "name": "QA Score %", "channel": "non_channel", "unit": "percent", "direction": "higher_better"},
]


def seed_default_metrics(db: Session) -> int:
    """Insert default metrics if they don't exist. Returns count of new metrics added."""
    from sqlalchemy import select

    existing_keys = set(db.scalars(select(MetricDefinition.key)).all())
    added = 0
    for m in DEFAULT_METRICS:
        if m["key"] not in existing_keys:
            db.add(MetricDefinition(**m, is_default=True))
            added += 1
    if added:
        db.commit()
    return added
