import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class MetricDefinitionOut(BaseModel):
    id: uuid.UUID
    key: str
    name: str
    description: str | None
    channel: str
    unit: str
    direction: str
    is_default: bool
    is_custom: bool = False
    formula: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MetricDefinitionCreate(BaseModel):
    key: str
    name: str
    description: str | None = None
    channel: str
    unit: str
    direction: str = "higher_better"
