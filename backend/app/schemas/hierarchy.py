import uuid
from datetime import date, datetime

from pydantic import BaseModel


# --- Company ---
class CompanyCreate(BaseModel):
    name: str

class CompanyUpdate(BaseModel):
    name: str | None = None

class CompanyOut(BaseModel):
    id: uuid.UUID
    name: str
    site_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Site ---
class SiteCreate(BaseModel):
    company_id: uuid.UUID
    name: str
    location: str | None = None

class SiteUpdate(BaseModel):
    name: str | None = None
    location: str | None = None

class SiteOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    location: str | None
    supervisor_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Supervisor ---
class SupervisorCreate(BaseModel):
    site_id: uuid.UUID
    employee_id: str
    first_name: str
    last_name: str
    email: str | None = None

class SupervisorUpdate(BaseModel):
    site_id: uuid.UUID | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    is_active: bool | None = None

class SupervisorOut(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    employee_id: str
    first_name: str
    last_name: str
    email: str | None
    is_active: bool
    agent_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Agent ---
class AgentCreate(BaseModel):
    supervisor_id: uuid.UUID
    employee_id: str
    first_name: str
    last_name: str
    email: str | None = None
    hire_date: date | None = None

class AgentUpdate(BaseModel):
    supervisor_id: uuid.UUID | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    hire_date: date | None = None
    is_active: bool | None = None

class AgentOut(BaseModel):
    id: uuid.UUID
    supervisor_id: uuid.UUID
    employee_id: str
    first_name: str
    last_name: str
    email: str | None
    hire_date: date | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Hierarchy Tree ---
class HierarchyAgentNode(BaseModel):
    id: uuid.UUID
    name: str
    employee_id: str

class HierarchySupervisorNode(BaseModel):
    id: uuid.UUID
    name: str
    agents: list[HierarchyAgentNode] = []

class HierarchySiteNode(BaseModel):
    id: uuid.UUID
    name: str
    supervisors: list[HierarchySupervisorNode] = []

class HierarchyTree(BaseModel):
    id: uuid.UUID
    name: str
    sites: list[HierarchySiteNode] = []
