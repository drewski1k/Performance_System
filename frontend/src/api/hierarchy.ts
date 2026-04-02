import api from "./client";
import type { Company, Site, Supervisor, Agent, HierarchyTree } from "@/types/hierarchy";

export const hierarchyApi = {
  // Companies
  listCompanies: () => api.get<Company[]>("/hierarchy/companies").then((r) => r.data),
  createCompany: (data: { name: string }) => api.post<Company>("/hierarchy/companies", data).then((r) => r.data),
  getCompany: (id: string) => api.get<Company>(`/hierarchy/companies/${id}`).then((r) => r.data),
  updateCompany: (id: string, data: { name?: string }) => api.put<Company>(`/hierarchy/companies/${id}`, data).then((r) => r.data),

  // Sites
  listSites: (companyId?: string) => api.get<Site[]>("/hierarchy/sites", { params: { company_id: companyId } }).then((r) => r.data),
  createSite: (data: { company_id: string; name: string; location?: string }) => api.post<Site>("/hierarchy/sites", data).then((r) => r.data),
  getSite: (id: string) => api.get<Site>(`/hierarchy/sites/${id}`).then((r) => r.data),

  // Supervisors
  listSupervisors: (siteId?: string) => api.get<Supervisor[]>("/hierarchy/supervisors", { params: { site_id: siteId } }).then((r) => r.data),
  createSupervisor: (data: { site_id: string; employee_id: string; first_name: string; last_name: string }) =>
    api.post<Supervisor>("/hierarchy/supervisors", data).then((r) => r.data),

  // Agents
  listAgents: (supervisorId?: string) => api.get<Agent[]>("/hierarchy/agents", { params: { supervisor_id: supervisorId } }).then((r) => r.data),
  createAgent: (data: { supervisor_id: string; employee_id: string; first_name: string; last_name: string }) =>
    api.post<Agent>("/hierarchy/agents", data).then((r) => r.data),

  // Tree
  getTree: () => api.get<HierarchyTree[]>("/hierarchy/tree").then((r) => r.data),
};
