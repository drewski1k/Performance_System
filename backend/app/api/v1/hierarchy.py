import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Agent, Company, Site, Supervisor
from app.schemas.hierarchy import (
    AgentCreate, AgentOut, AgentUpdate,
    CompanyCreate, CompanyOut, CompanyUpdate,
    HierarchyAgentNode, HierarchySiteNode, HierarchySupervisorNode, HierarchyTree,
    SiteCreate, SiteOut, SiteUpdate,
    SupervisorCreate, SupervisorOut, SupervisorUpdate,
)

router = APIRouter(prefix="/hierarchy", tags=["hierarchy"])


# --- Companies ---

@router.get("/companies", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db)):
    stmt = select(Company).order_by(Company.name)
    companies = db.scalars(stmt).all()
    result = []
    for c in companies:
        site_count = db.scalar(select(func.count(Site.id)).where(Site.company_id == c.id))
        result.append(CompanyOut(
            id=c.id, name=c.name, site_count=site_count or 0, created_at=c.created_at
        ))
    return result


@router.post("/companies", response_model=CompanyOut, status_code=201)
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    company = Company(name=data.name)
    db.add(company)
    db.commit()
    db.refresh(company)
    return CompanyOut(id=company.id, name=company.name, site_count=0, created_at=company.created_at)


@router.get("/companies/{company_id}", response_model=CompanyOut)
def get_company(company_id: uuid.UUID, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    site_count = db.scalar(select(func.count(Site.id)).where(Site.company_id == company.id))
    return CompanyOut(id=company.id, name=company.name, site_count=site_count or 0, created_at=company.created_at)


@router.put("/companies/{company_id}", response_model=CompanyOut)
def update_company(company_id: uuid.UUID, data: CompanyUpdate, db: Session = Depends(get_db)):
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    if data.name is not None:
        company.name = data.name
    db.commit()
    db.refresh(company)
    site_count = db.scalar(select(func.count(Site.id)).where(Site.company_id == company.id))
    return CompanyOut(id=company.id, name=company.name, site_count=site_count or 0, created_at=company.created_at)


# --- Sites ---

@router.get("/sites", response_model=list[SiteOut])
def list_sites(company_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(Site).order_by(Site.name)
    if company_id:
        stmt = stmt.where(Site.company_id == company_id)
    sites = db.scalars(stmt).all()
    result = []
    for s in sites:
        sup_count = db.scalar(select(func.count(Supervisor.id)).where(Supervisor.site_id == s.id))
        result.append(SiteOut(
            id=s.id, company_id=s.company_id, name=s.name, location=s.location,
            supervisor_count=sup_count or 0, created_at=s.created_at,
        ))
    return result


@router.post("/sites", response_model=SiteOut, status_code=201)
def create_site(data: SiteCreate, db: Session = Depends(get_db)):
    if not db.get(Company, data.company_id):
        raise HTTPException(404, "Company not found")
    site = Site(company_id=data.company_id, name=data.name, location=data.location)
    db.add(site)
    db.commit()
    db.refresh(site)
    return SiteOut(
        id=site.id, company_id=site.company_id, name=site.name, location=site.location,
        supervisor_count=0, created_at=site.created_at,
    )


@router.get("/sites/{site_id}", response_model=SiteOut)
def get_site(site_id: uuid.UUID, db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    sup_count = db.scalar(select(func.count(Supervisor.id)).where(Supervisor.site_id == site.id))
    return SiteOut(
        id=site.id, company_id=site.company_id, name=site.name, location=site.location,
        supervisor_count=sup_count or 0, created_at=site.created_at,
    )


@router.put("/sites/{site_id}", response_model=SiteOut)
def update_site(site_id: uuid.UUID, data: SiteUpdate, db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    if data.name is not None:
        site.name = data.name
    if data.location is not None:
        site.location = data.location
    db.commit()
    db.refresh(site)
    sup_count = db.scalar(select(func.count(Supervisor.id)).where(Supervisor.site_id == site.id))
    return SiteOut(
        id=site.id, company_id=site.company_id, name=site.name, location=site.location,
        supervisor_count=sup_count or 0, created_at=site.created_at,
    )


# --- Supervisors ---

@router.get("/supervisors", response_model=list[SupervisorOut])
def list_supervisors(site_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(Supervisor).order_by(Supervisor.last_name, Supervisor.first_name)
    if site_id:
        stmt = stmt.where(Supervisor.site_id == site_id)
    supervisors = db.scalars(stmt).all()
    result = []
    for s in supervisors:
        agent_count = db.scalar(select(func.count(Agent.id)).where(Agent.supervisor_id == s.id))
        result.append(SupervisorOut(
            id=s.id, site_id=s.site_id, employee_id=s.employee_id,
            first_name=s.first_name, last_name=s.last_name, email=s.email,
            is_active=s.is_active, agent_count=agent_count or 0, created_at=s.created_at,
        ))
    return result


@router.post("/supervisors", response_model=SupervisorOut, status_code=201)
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db)):
    if not db.get(Site, data.site_id):
        raise HTTPException(404, "Site not found")
    sup = Supervisor(
        site_id=data.site_id, employee_id=data.employee_id,
        first_name=data.first_name, last_name=data.last_name, email=data.email,
    )
    db.add(sup)
    db.commit()
    db.refresh(sup)
    return SupervisorOut(
        id=sup.id, site_id=sup.site_id, employee_id=sup.employee_id,
        first_name=sup.first_name, last_name=sup.last_name, email=sup.email,
        is_active=sup.is_active, agent_count=0, created_at=sup.created_at,
    )


@router.get("/supervisors/{supervisor_id}", response_model=SupervisorOut)
def get_supervisor(supervisor_id: uuid.UUID, db: Session = Depends(get_db)):
    sup = db.get(Supervisor, supervisor_id)
    if not sup:
        raise HTTPException(404, "Supervisor not found")
    agent_count = db.scalar(select(func.count(Agent.id)).where(Agent.supervisor_id == sup.id))
    return SupervisorOut(
        id=sup.id, site_id=sup.site_id, employee_id=sup.employee_id,
        first_name=sup.first_name, last_name=sup.last_name, email=sup.email,
        is_active=sup.is_active, agent_count=agent_count or 0, created_at=sup.created_at,
    )


@router.put("/supervisors/{supervisor_id}", response_model=SupervisorOut)
def update_supervisor(supervisor_id: uuid.UUID, data: SupervisorUpdate, db: Session = Depends(get_db)):
    sup = db.get(Supervisor, supervisor_id)
    if not sup:
        raise HTTPException(404, "Supervisor not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(sup, field, value)
    db.commit()
    db.refresh(sup)
    agent_count = db.scalar(select(func.count(Agent.id)).where(Agent.supervisor_id == sup.id))
    return SupervisorOut(
        id=sup.id, site_id=sup.site_id, employee_id=sup.employee_id,
        first_name=sup.first_name, last_name=sup.last_name, email=sup.email,
        is_active=sup.is_active, agent_count=agent_count or 0, created_at=sup.created_at,
    )


# --- Agents ---

@router.get("/agents", response_model=list[AgentOut])
def list_agents(supervisor_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    stmt = select(Agent).order_by(Agent.last_name, Agent.first_name)
    if supervisor_id:
        stmt = stmt.where(Agent.supervisor_id == supervisor_id)
    return db.scalars(stmt).all()


@router.post("/agents", response_model=AgentOut, status_code=201)
def create_agent(data: AgentCreate, db: Session = Depends(get_db)):
    if not db.get(Supervisor, data.supervisor_id):
        raise HTTPException(404, "Supervisor not found")
    agent = Agent(
        supervisor_id=data.supervisor_id, employee_id=data.employee_id,
        first_name=data.first_name, last_name=data.last_name,
        email=data.email, hire_date=data.hire_date,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/agents/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: uuid.UUID, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.put("/agents/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: uuid.UUID, data: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent


# --- Hierarchy Tree ---

@router.get("/tree", response_model=list[HierarchyTree])
def get_hierarchy_tree(db: Session = Depends(get_db)):
    companies = db.scalars(
        select(Company)
        .options(
            selectinload(Company.sites)
            .selectinload(Site.supervisors)
            .selectinload(Supervisor.agents)
        )
        .order_by(Company.name)
    ).all()

    result = []
    for company in companies:
        sites = []
        for site in sorted(company.sites, key=lambda s: s.name):
            supervisors = []
            for sup in sorted(site.supervisors, key=lambda s: s.last_name):
                agents = [
                    HierarchyAgentNode(
                        id=a.id, name=f"{a.first_name} {a.last_name}", employee_id=a.employee_id
                    )
                    for a in sorted(sup.agents, key=lambda a: a.last_name)
                ]
                supervisors.append(HierarchySupervisorNode(
                    id=sup.id, name=f"{sup.first_name} {sup.last_name}", agents=agents
                ))
            sites.append(HierarchySiteNode(id=site.id, name=site.name, supervisors=supervisors))
        result.append(HierarchyTree(id=company.id, name=company.name, sites=sites))
    return result
