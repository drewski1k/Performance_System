import uuid
from decimal import Decimal

from pydantic import BaseModel


class ManualThresholdSchema(BaseModel):
    grade_a: Decimal
    grade_b: Decimal
    grade_c: Decimal
    grade_d: Decimal


class ScorecardMetricConfig(BaseModel):
    metric_id: uuid.UUID
    weight: Decimal = Decimal("0")
    include_in_score: bool = False
    show_on_scorecard: bool = False
    min_threshold: int | None = None
    threshold_basis: str | None = None
    grade_mode: str = "dynamic"
    sort_order: int = 0
    manual_thresholds: ManualThresholdSchema | None = None


class ScorecardTemplateCreate(BaseModel):
    company_id: uuid.UUID | None = None
    name: str
    period_type: str = "biweekly"
    channel_weight: Decimal = Decimal("0")
    non_channel_weight: Decimal = Decimal("100")
    outlier_method: str = "iqr"
    iqr_multiplier: Decimal = Decimal("1.5")
    metrics: list[ScorecardMetricConfig] = []


class ScorecardTemplateUpdate(BaseModel):
    name: str | None = None
    period_type: str | None = None
    channel_weight: Decimal | None = None
    non_channel_weight: Decimal | None = None
    outlier_method: str | None = None
    iqr_multiplier: Decimal | None = None
    is_active: bool | None = None
    metrics: list[ScorecardMetricConfig] | None = None


class ScorecardMetricOut(BaseModel):
    id: uuid.UUID
    metric_id: uuid.UUID
    metric_key: str = ""
    metric_name: str = ""
    channel: str = ""
    direction: str = ""
    unit: str = ""
    weight: Decimal
    include_in_score: bool
    show_on_scorecard: bool
    min_threshold: int | None
    threshold_basis: str | None
    grade_mode: str
    sort_order: int
    manual_thresholds: ManualThresholdSchema | None = None

    model_config = {"from_attributes": True}


class ScorecardTemplateOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID | None
    name: str
    period_type: str
    channel_weight: Decimal
    non_channel_weight: Decimal
    outlier_method: str
    iqr_multiplier: Decimal
    is_active: bool
    metrics: list[ScorecardMetricOut] = []

    model_config = {"from_attributes": True}


class ProductivityStateSchema(BaseModel):
    state_name: str
    state_type: str
    is_productive: bool
    category: str | None = None


class ProductivityStateOut(BaseModel):
    id: uuid.UUID
    state_name: str
    state_type: str
    is_productive: bool
    category: str | None

    model_config = {"from_attributes": True}


class PfpConfigSchema(BaseModel):
    grade_a_rate: Decimal = Decimal("3.00")
    grade_b_rate: Decimal = Decimal("2.00")
    grade_c_rate: Decimal = Decimal("0.00")
    grade_d_rate: Decimal = Decimal("0.00")
    grade_f_rate: Decimal = Decimal("0.00")


class PfpConfigOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    grade_a_rate: Decimal
    grade_b_rate: Decimal
    grade_c_rate: Decimal
    grade_d_rate: Decimal
    grade_f_rate: Decimal

    model_config = {"from_attributes": True}
