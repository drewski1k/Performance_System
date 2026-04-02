export interface Company {
  id: string;
  name: string;
  site_count: number;
  created_at: string;
}

export interface Site {
  id: string;
  company_id: string;
  name: string;
  location: string | null;
  supervisor_count: number;
  created_at: string;
}

export interface Supervisor {
  id: string;
  site_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  is_active: boolean;
  agent_count: number;
  created_at: string;
}

export interface Agent {
  id: string;
  supervisor_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface HierarchyAgentNode {
  id: string;
  name: string;
  employee_id: string;
}

export interface HierarchySupervisorNode {
  id: string;
  name: string;
  agents: HierarchyAgentNode[];
}

export interface HierarchySiteNode {
  id: string;
  name: string;
  supervisors: HierarchySupervisorNode[];
}

export interface HierarchyTree {
  id: string;
  name: string;
  sites: HierarchySiteNode[];
}
